// auth.js — Complete Authentication, Email Verification, Onboarding & Profile Security
import { auth, db, getApiKey, setApiKey } from "./config.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let activeUser = null;
let activeProfile = null;
let onWorkspaceReady = null;
let onPinReauthSuccessCallback = null;

// Screen References
const screens = {
  auth: document.getElementById("auth-screen"),
  verify: document.getElementById("verify-screen"),
  onboarding: document.getElementById("onboarding-screen"),
  app: document.getElementById("app-screen")
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.classList.toggle("hidden", key !== name);
  });
}

function showAuthAlert(type, msg) {
  const errBox = document.getElementById("auth-error");
  const okBox = document.getElementById("auth-success");
  errBox.classList.add("hidden");
  okBox.classList.add("hidden");

  if (type === "error") {
    document.getElementById("auth-error-text").textContent = msg;
    errBox.classList.remove("hidden");
  } else if (type === "success") {
    document.getElementById("auth-success-text").textContent = msg;
    okBox.classList.remove("hidden");
  }
}

function sanitizeUsername(raw) {
  return (raw || "").toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
}

// ==================== 1. AUTH TABS & SOCIAL LOGIN ====================
function setupAuthListeners() {
  const tabSignIn = document.getElementById("tab-signin");
  const tabSignUp = document.getElementById("tab-signup");
  const formSignIn = document.getElementById("signin-form");
  const formSignUp = document.getElementById("signup-form");

  tabSignIn.onclick = () => {
    showAuthAlert(null, "");
    tabSignIn.classList.add("bg-blue-600", "text-white", "shadow");
    tabSignIn.classList.remove("text-slate-400");
    tabSignUp.classList.remove("bg-blue-600", "text-white", "shadow");
    tabSignUp.classList.add("text-slate-400");
    formSignIn.classList.remove("hidden");
    formSignUp.classList.add("hidden");
  };

  tabSignUp.onclick = () => {
    showAuthAlert(null, "");
    tabSignUp.classList.add("bg-blue-600", "text-white", "shadow");
    tabSignUp.classList.remove("text-slate-400");
    tabSignIn.classList.remove("bg-blue-600", "text-white", "shadow");
    tabSignIn.classList.add("text-slate-400");
    formSignUp.classList.remove("hidden");
    formSignIn.classList.add("hidden");
  };

  // Google Sign-In
  document.getElementById("google-login-btn").onclick = async () => {
    showAuthAlert(null, "");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      showAuthAlert("error", err.message.replace("Firebase: ", ""));
    }
  };

  // Apple Sign-In
  document.getElementById("apple-login-btn").onclick = async () => {
    showAuthAlert(null, "");
    try {
      await signInWithPopup(auth, new OAuthProvider("apple.com"));
    } catch (err) {
      showAuthAlert("error", err.message.replace("Firebase: ", ""));
    }
  };

  // Email / Username Sign-In
  formSignIn.onsubmit = async (e) => {
    e.preventDefault();
    showAuthAlert(null, "");
    const btn = document.getElementById("signin-submit-btn");
    const identifier = document.getElementById("signin-identifier").value.trim();
    const password = document.getElementById("signin-password").value;

    btn.disabled = true;
    try {
      let emailToUse = identifier;
      if (!identifier.includes("@")) {
        const cleanUser = sanitizeUsername(identifier.replace(/^@/, ""));
        const uSnap = await getDoc(doc(db, "usernames", cleanUser));
        if (!uSnap.exists()) {
          throw new Error(`Username "@${cleanUser}" not found.`);
        }
        emailToUse = uSnap.data().email;
      }
      await signInWithEmailAndPassword(auth, emailToUse, password);
    } catch (err) {
      showAuthAlert("error", err.message.replace("Firebase: ", ""));
    } finally {
      btn.disabled = false;
    }
  };

  // Forgot Password from Sign-In Screen
  document.getElementById("forgot-password-btn").onclick = async () => {
    showAuthAlert(null, "");
    let identifier = document.getElementById("signin-identifier").value.trim();
    if (!identifier) {
      return showAuthAlert("error", "Enter your username or email first, then tap Forgot password.");
    }
    try {
      if (!identifier.includes("@")) {
        const cleanUser = sanitizeUsername(identifier.replace(/^@/, ""));
        const uSnap = await getDoc(doc(db, "usernames", cleanUser));
        if (!uSnap.exists()) throw new Error("Username not found.");
        identifier = uSnap.data().email;
      }
      await sendPasswordResetEmail(auth, identifier);
      showAuthAlert("success", `Password reset link sent to ${identifier}.`);
    } catch (err) {
      showAuthAlert("error", err.message.replace("Firebase: ", ""));
    }
  };

  // Email Sign-Up (Name, Email, Username, Password -> Sends Verification Link)
  formSignUp.onsubmit = async (e) => {
    e.preventDefault();
    showAuthAlert(null, "");
    const btn = document.getElementById("signup-submit-btn");
    const fullName = document.getElementById("signup-name").value.trim();
    const cleanUser = sanitizeUsername(document.getElementById("signup-username").value);
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    if (cleanUser.length < 3) {
      return showAuthAlert("error", "Username must be at least 3 characters (a-z, 0-9, _).");
    }

    btn.disabled = true;
    try {
      const unameRef = doc(db, "usernames", cleanUser);
      const unameSnap = await getDoc(unameRef);
      if (unameSnap.exists()) {
        throw new Error(`Username "@${cleanUser}" is already taken.`);
      }

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: fullName });

      // Reserve username & initial draft profile
      await setDoc(unameRef, {
        uid: cred.user.uid,
        email: email,
        username: cleanUser
      });

      await setDoc(doc(db, "users", cred.user.uid), {
        fullName: fullName,
        username: cleanUser,
        email: email,
        onboarded: false,
        createdAt: serverTimestamp()
      });

      await sendEmailVerification(cred.user);
    } catch (err) {
      showAuthAlert("error", err.message.replace("Firebase: ", ""));
    } finally {
      btn.disabled = false;
    }
  };
}

// ==================== 2. EMAIL VERIFICATION FLOW ====================
function setupVerificationListeners() {
  const statusEl = document.getElementById("verify-status-msg");

  document.getElementById("check-verified-btn").onclick = async () => {
    if (!activeUser) return;
    statusEl.classList.add("hidden");
    await activeUser.reload();
    if (auth.currentUser.emailVerified) {
      await routeAuthenticatedUser(auth.currentUser);
    } else {
      statusEl.textContent = "Not verified yet. Click the link in your email inbox (check Spam too) and try again.";
      statusEl.classList.remove("hidden");
    }
  };

  document.getElementById("resend-verify-btn").onclick = async () => {
    if (!activeUser) return;
    try {
      await sendEmailVerification(activeUser);
      statusEl.textContent = "A fresh verification link has been sent to your email!";
      statusEl.classList.remove("hidden");
    } catch (err) {
      statusEl.textContent = err.message.replace("Firebase: ", "");
      statusEl.classList.remove("hidden");
    }
  };

  document.getElementById("verify-logout-btn").onclick = () => signOut(auth);
}

// ==================== 3. ONBOARDING FLOW (Age, Gender, Username, Password) ====================
function setupOnboardingListeners() {
  const form = document.getElementById("onboarding-form");
  const errEl = document.getElementById("onboard-error");

  form.onsubmit = async (e) => {
    e.preventDefault();
    errEl.classList.add("hidden");
    const btn = document.getElementById("onboard-submit-btn");

    const fullName = document.getElementById("onboard-name").value.trim();
    const cleanUser = sanitizeUsername(document.getElementById("onboard-username").value);
    const age = parseInt(document.getElementById("onboard-age").value, 10);
    const gender = document.getElementById("onboard-gender").value;
    const newPassword = document.getElementById("onboard-password").value;

    if (cleanUser.length < 3) {
      errEl.textContent = "Username must be at least 3 characters.";
      errEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    try {
      // Check username uniqueness (allow if already owned by this user)
      const unameRef = doc(db, "usernames", cleanUser);
      const unameSnap = await getDoc(unameRef);
      if (unameSnap.exists() && unameSnap.data().uid !== activeUser.uid) {
        throw new Error(`Username "@${cleanUser}" is already taken.`);
      }

      // If user signed in via Google/Apple and entered a password, link Email+Password credential
      const hasPasswordProvider = activeUser.providerData.some((p) => p.providerId === "password");
      if (!hasPasswordProvider && newPassword && newPassword.length >= 6 && activeUser.email) {
        const cred = EmailAuthProvider.credential(activeUser.email, newPassword);
        await linkWithCredential(activeUser, cred);
      }

      await updateProfile(activeUser, { displayName: fullName });

      await setDoc(unameRef, {
        uid: activeUser.uid,
        email: activeUser.email || "",
        username: cleanUser
      });

      const profileData = {
        fullName,
        username: cleanUser,
        email: activeUser.email || "",
        age,
        gender,
        photoData: activeUser.photoURL || "",
        onboarded: true,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", activeUser.uid), profileData, { merge: true });
      activeProfile = { ...(activeProfile || {}), ...profileData };

      syncProfileUI();
      showScreen("app");
      if (onWorkspaceReady) onWorkspaceReady(activeUser, activeProfile);
    } catch (err) {
      errEl.textContent = err.message.replace("Firebase: ", "");
      errEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  };
}

// ==================== 4. PROFILE UI & SETTINGS ACCOUNT SYNC ====================
function syncProfileUI() {
  if (!activeUser || !activeProfile) return;

  const name = activeProfile.fullName || activeUser.displayName || "User";
  const username = activeProfile.username || "user";
  const photo = activeProfile.photoData || activeUser.photoURL || "";
  const initial = name.charAt(0).toUpperCase();

  // Sidebar Footer
  document.getElementById("sidebar-fullname").textContent = name;
  document.getElementById("sidebar-username").textContent = `@${username}`;

  const sideImg = document.getElementById("sidebar-avatar-img");
  const sideInit = document.getElementById("sidebar-avatar-initial");
  if (photo) {
    sideImg.src = photo;
    sideImg.classList.remove("hidden");
    sideInit.classList.add("hidden");
  } else {
    sideInit.textContent = initial;
    sideInit.classList.remove("hidden");
    sideImg.classList.add("hidden");
  }

  // Settings Account Inputs
  document.getElementById("settings-fullname").value = name;
  document.getElementById("settings-username").value = username;
  document.getElementById("settings-age").value = activeProfile.age || "";
  document.getElementById("settings-gender").value = activeProfile.gender || "Male";
  document.getElementById("settings-api-key").value = getApiKey();

  const setImg = document.getElementById("settings-avatar-img");
  const setInit = document.getElementById("settings-avatar-initial");
  if (photo) {
    setImg.src = photo;
    setImg.classList.remove("hidden");
    setInit.classList.add("hidden");
  } else {
    setInit.textContent = initial;
    setInit.classList.remove("hidden");
    setImg.classList.add("hidden");
  }
}

// Compress & Resize Profile Photo via Canvas (No paid Firebase Storage needed)
function compressAvatarToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupAccountSettingsListeners() {
  // Profile Photo Change
  document.getElementById("avatar-upload-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeUser) return;
    try {
      const compressedDataUrl = await compressAvatarToBase64(file);
      activeProfile.photoData = compressedDataUrl;
      await setDoc(doc(db, "users", activeUser.uid), { photoData: compressedDataUrl }, { merge: true });
      syncProfileUI();
    } catch (err) {
      alert("Could not process profile photo: " + err.message);
    }
  };

  // Save Account Details (Name, Username, Age, Gender, API Key)
  document.getElementById("save-account-btn").onclick = async () => {
    if (!activeUser) return;
    const btn = document.getElementById("save-account-btn");
    const newName = document.getElementById("settings-fullname").value.trim();
    const newUsername = sanitizeUsername(document.getElementById("settings-username").value);
    const newAge = parseInt(document.getElementById("settings-age").value, 10) || "";
    const newGender = document.getElementById("settings-gender").value;
    const newApiKey = document.getElementById("settings-api-key").value.trim();

    if (newUsername.length < 3) {
      return alert("Username must be at least 3 characters.");
    }

    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      const oldUsername = activeProfile.username;
      if (newUsername !== oldUsername) {
        const newUnameRef = doc(db, "usernames", newUsername);
        const snap = await getDoc(newUnameRef);
        if (snap.exists() && snap.data().uid !== activeUser.uid) {
          throw new Error(`Username "@${newUsername}" is already taken.`);
        }
        await setDoc(newUnameRef, {
          uid: activeUser.uid,
          email: activeUser.email || "",
          username: newUsername
        });
        if (oldUsername) {
          await deleteDoc(doc(db, "usernames", oldUsername)).catch(() => {});
        }
      }

      await updateProfile(activeUser, { displayName: newName });
      const updated = {
        fullName: newName,
        username: newUsername,
        age: newAge,
        gender: newGender,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, "users", activeUser.uid), updated, { merge: true });
      activeProfile = { ...activeProfile, ...updated };

      if (newApiKey) setApiKey(newApiKey);
      syncProfileUI();
      btn.textContent = "Saved!";
      setTimeout(() => (btn.textContent = "Save Changes"), 1500);
    } catch (err) {
      alert(err.message.replace("Firebase: ", ""));
      btn.textContent = "Save Changes";
    } finally {
      btn.disabled = false;
    }
  };

  // Update Account Password
  document.getElementById("update-pass-btn").onclick = async () => {
    const newPass = document.getElementById("settings-new-pass").value;
    if (!newPass || newPass.length < 6) {
      return alert("Password must be at least 6 characters.");
    }
    try {
      await updatePassword(activeUser, newPass);
      document.getElementById("settings-new-pass").value = "";
      alert("Account password updated successfully!");
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        alert("For security, please sign out and sign in again before changing your password, or use the Reset Email link below.");
      } else {
        alert(err.message.replace("Firebase: ", ""));
      }
    }
  };

  // Send Password Reset Email
  document.getElementById("settings-reset-email-btn").onclick = async () => {
    if (!activeUser?.email) return alert("No email linked to this account.");
    try {
      await sendPasswordResetEmail(auth, activeUser.email);
      alert(`Password reset link sent to ${activeUser.email}`);
    } catch (err) {
      alert(err.message.replace("Firebase: ", ""));
    }
  };

  // Sign Out
  document.getElementById("settings-logout-btn").onclick = () => {
    document.getElementById("settings-modal").classList.add("hidden");
    signOut(auth);
  };
}

// ==================== 5. FORGOT PIN ACCOUNT RE-VERIFICATION ====================
export function openForgotPinVerification(onSuccess) {
  onPinReauthSuccessCallback = onSuccess;
  const modal = document.getElementById("forgot-pin-modal");
  const errEl = document.getElementById("forgot-pin-error");
  errEl.classList.add("hidden");

  const hasPassword = activeUser.providerData.some((p) => p.providerId === "password");
  document.getElementById("forgot-pin-email-box").classList.toggle("hidden", !hasPassword);
  document.getElementById("forgot-pin-oauth-box").classList.toggle("hidden", hasPassword);
  document.getElementById("verify-reauth-btn").classList.toggle("hidden", !hasPassword);

  modal.classList.remove("hidden");
}

function setupForgotPinListeners() {
  const modal = document.getElementById("forgot-pin-modal");
  const errEl = document.getElementById("forgot-pin-error");

  document.getElementById("close-forgot-pin-modal").onclick = () => modal.classList.add("hidden");

  // Re-verify via Password
  document.getElementById("verify-reauth-btn").onclick = async () => {
    errEl.classList.add("hidden");
    const pass = document.getElementById("forgot-pin-account-pass").value;
    if (!pass) {
      errEl.textContent = "Please enter your account password.";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      const cred = EmailAuthProvider.credential(activeUser.email, pass);
      await reauthenticateWithCredential(activeUser, cred);
      document.getElementById("forgot-pin-account-pass").value = "";
      modal.classList.add("hidden");
      if (onPinReauthSuccessCallback) onPinReauthSuccessCallback();
    } catch (err) {
      errEl.textContent = "Incorrect password. Verification failed.";
      errEl.classList.remove("hidden");
    }
  };

  // Re-verify via Google/Apple Popup
  document.getElementById("forgot-pin-reauth-btn").onclick = async () => {
    errEl.classList.add("hidden");
    try {
      const isApple = activeUser.providerData.some((p) => p.providerId === "apple.com");
      const provider = isApple ? new OAuthProvider("apple.com") : new GoogleAuthProvider();
      await reauthenticateWithPopup(activeUser, provider);
      modal.classList.add("hidden");
      if (onPinReauthSuccessCallback) onPinReauthSuccessCallback();
    } catch (err) {
      errEl.textContent = err.message.replace("Firebase: ", "");
      errEl.classList.remove("hidden");
    }
  };
}

// ==================== 6. CENTRAL AUTH ROUTER ====================
async function routeAuthenticatedUser(user) {
  activeUser = user;
  const isEmailPasswordOnly =
    user.providerData.length > 0 &&
    user.providerData.every((p) => p.providerId === "password");

  // Step A: Enforce Email Verification for Email Signups
  if (isEmailPasswordOnly && !user.emailVerified) {
    document.getElementById("verify-email-display").textContent = user.email;
    showScreen("verify");
    return;
  }

  // Step B: Check Firestore Profile & Onboarding Completion
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const data = userSnap.exists() ? userSnap.data() : {};
  activeProfile = data;

  if (!data.onboarded) {
    document.getElementById("onboard-name").value = data.fullName || user.displayName || "";
    const suggestedUser =
      data.username ||
      sanitizeUsername((user.email || user.displayName || "user").split("@")[0]);
    document.getElementById("onboard-username").value = suggestedUser;

    // Hide password box if already signed up with email+password
    document.getElementById("onboard-password-wrap").classList.toggle("hidden", isEmailPasswordOnly);
    showScreen("onboarding");
    return;
  }

  // Step C: Ready for Main Workspace
  syncProfileUI();
  showScreen("app");
  if (onWorkspaceReady) onWorkspaceReady(user, activeProfile);
}

export function initAuth(callback) {
  onWorkspaceReady = callback;
  setupAuthListeners();
  setupVerificationListeners();
  setupOnboardingListeners();
  setupAccountSettingsListeners();
  setupForgotPinListeners();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await routeAuthenticatedUser(user);
    } else {
      activeUser = null;
      activeProfile = null;
      showScreen("auth");
    }
  });
}
