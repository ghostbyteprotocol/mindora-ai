// app.js — MinDora AI Core Engine (100% Google Gemini Native Voice & Image + Unlimited Fallback + 6-Tap Vault)
import { auth, db, getApiKey, MINDORA_MODELS, STUDIO_VOICES, QUICK_MODES } from "./config.js";
import { SUPPORTED_LANGUAGES, getCurrentLang, applyLanguage, t } from "./lang.js";
import { initAuth, openForgotPinVerification } from "./auth.js";
import {
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

setPersistence(auth, browserLocalPersistence).catch(() => {});

// ==================== CUSTOM WEBSITE DIALOGS & TOASTS ====================
function showCustomToast(message, type = "info") {
  let container = document.getElementById("mindora-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "mindora-toast-container";
    container.className = "fixed top-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none w-[92%] max-w-sm";
    document.body.appendChild(container);
  }

  const borderClass =
    type === "error"
      ? "border-red-500/60 text-red-200"
      : type === "success"
      ? "border-emerald-500/60 text-emerald-200"
      : "border-cyan-500/50 text-white";

  const iconHtml =
    type === "error"
      ? `<i class="fa-solid fa-circle-exclamation text-red-400"></i>`
      : type === "success"
      ? `<i class="fa-solid fa-circle-check text-emerald-400"></i>`
      : `<i class="fa-solid fa-sparkles text-cyan-400"></i>`;

  const toast = document.createElement("div");
  toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#0d1220]/95 border ${borderClass} shadow-2xl backdrop-blur-xl text-xs font-medium transition-all duration-300 opacity-0 -translate-y-2`;
  toast.innerHTML = `${iconHtml}<span class="leading-snug">${escapeHtml(String(message))}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("opacity-0", "-translate-y-2");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "-translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

window.alert = (msg) => showCustomToast(msg, "info");

function showCustomConfirm({ title = "Confirm Action", message = "", confirmText = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4";
    overlay.innerHTML = `
      <div class="w-full max-w-xs rounded-3xl bg-[#0d1220] border border-slate-800 p-5 shadow-2xl space-y-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-2xl ${danger ? "bg-red-500/15 text-red-400" : "bg-blue-600/20 text-cyan-400"} flex items-center justify-center shrink-0">
            <i class="fa-solid ${danger ? "fa-trash-can" : "fa-circle-question"}"></i>
          </div>
          <h3 class="text-sm font-bold text-white">${escapeHtml(title)}</h3>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(message)}</p>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button type="button" id="md-dlg-cancel" class="px-4 py-2 rounded-xl bg-[#151c30] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition">Cancel</button>
          <button type="button" id="md-dlg-ok" class="px-4 py-2 rounded-xl ${
            danger ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"
          } text-white text-xs font-semibold transition">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelector("#md-dlg-cancel").onclick = () => cleanup(false);
    overlay.querySelector("#md-dlg-ok").onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
  });
}

function showCustomPrompt({ title = "Rename", defaultValue = "", placeholder = "Type here..." }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4";
    overlay.innerHTML = `
      <div class="w-full max-w-xs rounded-3xl bg-[#0d1220] border border-slate-800 p-5 shadow-2xl space-y-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-2xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-pen"></i>
          </div>
          <h3 class="text-sm font-bold text-white">${escapeHtml(title)}</h3>
        </div>
        <input type="text" id="md-prompt-input" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}"
          class="w-full px-3.5 py-2.5 rounded-2xl bg-[#080b14] border border-slate-700 focus:border-cyan-400 text-xs text-white focus:outline-none" />
        <div class="flex items-center justify-end gap-2 pt-1">
          <button type="button" id="md-prm-cancel" class="px-4 py-2 rounded-xl bg-[#151c30] hover:bg-slate-800 text-slate-300 text-xs font-semibold transition">Cancel</button>
          <button type="button" id="md-prm-ok" class="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold transition">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const inputEl = overlay.querySelector("#md-prompt-input");
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 50);

    const cleanup = (val) => {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelector("#md-prm-cancel").onclick = () => cleanup(null);
    overlay.querySelector("#md-prm-ok").onclick = () => cleanup(inputEl.value.trim() || null);
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter") cleanup(inputEl.value.trim() || null);
      if (e.key === "Escape") cleanup(null);
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(null);
    };
  });
}

// ==================== GLOBAL STATE ====================
let currentUser = null;
let currentProfile = null;
let currentChatId = null;
let allChats = [];
let currentMessages = [];
let userMemory = "";
let customSystemPrompt = "";
let securityPin = null;
let activeMode = "default";

let attachedFile = null;
let isStreaming = false;
let streamAbortController = null;
let activeAudioBtn = null;

let targetContextChat = null;
let unlockedChatsSession = new Set();

let isLiveActive = false;
let isLiveMuted = false;
let isLiveSpeakerOn = true;
let studioVoiceIndex = 0;
let activePreviewVoiceId = null;
let textSyncInterval = null;
let chatsSubscribedUid = null;
const voicePreviewCache = {};

// Gemini Native Studio Voices (100% powered by user's Google Gemini API key)
const GEMINI_STUDIO_VOICES = [
  { id: "Aoede", name: "Aoede", tag: "Warm & Expressive", label: "Aoede (Warm & Expressive)" },
  { id: "Puck", name: "Puck", tag: "Natural & Friendly", label: "Puck (Natural & Friendly)" },
  { id: "Kore", name: "Kore", tag: "Soft & Clear", label: "Kore (Soft & Clear)" },
  { id: "Charon", name: "Charon", tag: "Deep & Calm", label: "Charon (Deep & Calm)" },
  { id: "Fenrir", name: "Fenrir", tag: "Bold & Energetic", label: "Fenrir (Bold & Energetic)" }
];

const sharedAudioPlayer = new Audio();
sharedAudioPlayer.preload = "auto";

const MINDORA_IDENTITY_PROMPT = `
Identity & Developer Knowledge (Follow these exact rules ONLY when asked about yourself or your developer/creator):
1. Self-Introduction: You are **MinDora AI**, an intelligent, fast, multilingual personal AI assistant.
2. Basic Developer Intro (When asked who created/developed you or for basic details about your developer):
   - State ONLY: You were developed by **Ayan Karmakar**, a **B.Tech Computer Science and Engineering (CSE)** student at **Bankura Unnayani Institute of Engineering** under **MAKAUT** (Maulana Abul Kalam Azad University of Technology).
   - Keep it clean and focused on his name, department, college, and MAKAUT—do NOT dump extra personal info unless specifically asked.
3. Additional / Detailed Developer Info (ONLY when the user explicitly asks for more/additional details about Ayan Karmakar):
   - Share that he hails from **Purulia, West Bengal, India**, and is passionate about Artificial Intelligence, software engineering, web & mobile development, and building human-like multilingual AI systems.
4. Instagram & Google Search (ONLY when asked for his Instagram ID, social handles, or where to find him):
   - Share his Instagram ID **@the_atheist_ayan** along with the direct link **https://instagram.com/the_atheist_ayan**, and let them know that searching **"Atheist Ayan"** on Google will bring up all his information.
5. Do NOT bring up your developer in normal everyday queries unrelated to you or your creator.
`;

function unlockMobileAudio() {
  try {
    sharedAudioPlayer.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    sharedAudioPlayer.play().then(() => sharedAudioPlayer.pause()).catch(() => {});
  } catch (e) {}
}

// Convert Gemini Raw PCM (24kHz 16-bit mono) to playable WAV Blob URL
function pcmBase64ToWavUrl(base64Pcm, sampleRate = 24000) {
  const binaryStr = atob(base64Pcm);
  const pcmLen = binaryStr.length;
  const wavBuffer = new ArrayBuffer(44 + pcmLen);
  const view = new DataView(wavBuffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcmLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcmLen, true);

  const bytes = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLen; i++) bytes[i] = binaryStr.charCodeAt(i);

  return URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
}

// ==================== CUSTOM PREMIUM DROPDOWN ENHANCER ====================
function upgradeNativeSelectToCustom(selectId, extraClass = "") {
  const nativeSel = document.getElementById(selectId);
  if (!nativeSel || nativeSel.dataset.customized === "true") return;
  nativeSel.dataset.customized = "true";
  nativeSel.classList.add("hidden");

  const wrapper = document.createElement("div");
  wrapper.className = `relative inline-block ${extraClass}`;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className =
    "w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl bg-[#101524] hover:bg-[#171f36] border border-slate-700/80 text-xs font-semibold text-white transition shadow-sm";

  const labelSpan = document.createElement("span");
  labelSpan.className = "truncate";
  const chevron = document.createElement("i");
  chevron.className = "fa-solid fa-chevron-down text-[10px] text-cyan-400 transition-transform duration-200";

  trigger.appendChild(labelSpan);
  trigger.appendChild(chevron);

  const menu = document.createElement("div");
  menu.className =
    "custom-select-menu hidden absolute left-0 right-0 mt-1.5 min-w-[185px] rounded-2xl bg-[#0d1220] border border-slate-700/90 shadow-2xl py-1.5 z-50 backdrop-blur-xl max-h-60 overflow-y-auto";

  const rebuildOptions = () => {
    const opts = Array.from(nativeSel.options);
    const currentOpt = opts[nativeSel.selectedIndex] || opts[0];
    labelSpan.textContent = currentOpt ? currentOpt.textContent : "Select";

    menu.innerHTML = "";
    opts.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      const isSelected = opt.value === nativeSel.value;
      item.className = `w-full text-left px-3.5 py-2 text-xs flex items-center justify-between gap-2 transition ${
        isSelected
          ? "bg-blue-600/25 text-cyan-300 font-semibold"
          : "text-slate-300 hover:bg-[#161e33] hover:text-white"
      }`;
      item.innerHTML = `
        <span class="truncate">${escapeHtml(opt.textContent)}</span>
        ${isSelected ? `<i class="fa-solid fa-check text-[10px] text-cyan-400 shrink-0"></i>` : ""}
      `;
      item.onclick = (e) => {
        e.stopPropagation();
        nativeSel.value = opt.value;
        nativeSel.dispatchEvent(new Event("change"));
        rebuildOptions();
        menu.classList.add("hidden");
        chevron.style.transform = "rotate(0deg)";
      };
      menu.appendChild(item);
    });
  };

  trigger.onclick = (e) => {
    e.stopPropagation();
    const isHidden = menu.classList.contains("hidden");
    document.querySelectorAll(".custom-select-menu").forEach((m) => m.classList.add("hidden"));
    if (isHidden) {
      rebuildOptions();
      menu.classList.remove("hidden");
      chevron.style.transform = "rotate(180deg)";
    } else {
      chevron.style.transform = "rotate(0deg)";
    }
  };

  rebuildOptions();
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  nativeSel.parentNode.insertBefore(wrapper, nativeSel.nextSibling);
}

// ==================== INITIALIZATION & PERSISTENT SESSION ====================
async function handleAuthenticatedUser(user, profile = null) {
  if (!user) return;
  currentUser = user;
  if (profile) {
    currentProfile = profile;
    localStorage.setItem("mindora_cached_profile", JSON.stringify(profile));
  } else if (!currentProfile) {
    try {
      const cached = JSON.parse(localStorage.getItem("mindora_cached_profile") || "null");
      if (cached) currentProfile = cached;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        currentProfile = userDoc.data();
        localStorage.setItem("mindora_cached_profile", JSON.stringify(currentProfile));
      }
    } catch (e) {}
  }

  const authScreen = document.getElementById("auth-screen") || document.getElementById("auth-modal");
  if (authScreen) authScreen.classList.add("hidden");

  await loadUserPersonalization();
  await loadSecurityPin();
  if (chatsSubscribedUid !== user.uid) {
    chatsSubscribedUid = user.uid;
    subscribeToChats();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("mindora_lang")) {
    localStorage.setItem("mindora_lang", "en");
  }
  applyLanguage(getCurrentLang());

  upgradeNativeSelectToCustom("model-select", "min-w-[148px]");
  upgradeNativeSelectToCustom("imagine-style", "w-full");
  upgradeNativeSelectToCustom("imagine-ratio", "w-full");

  renderLanguageOptions();
  setupSidebarAndGestures();
  setupChatInputAndTools();
  setupModalsAndSettings();
  setupLiveVoiceEngine();

  if (typeof window.speechSynthesis !== "undefined") {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await handleAuthenticatedUser(user, null);
    }
  });

  initAuth(async (user, profile) => {
    await handleAuthenticatedUser(user, profile);
  });
});

// ==================== 1. PERSONALIZATION & SECURITY PIN ====================
async function loadUserPersonalization() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "settings", "personalization"));
    if (snap.exists()) {
      userMemory = snap.data().memory || "";
      customSystemPrompt = snap.data().customPrompt || "";
    }
    const memEl = document.getElementById("settings-memory-input");
    const sysEl = document.getElementById("settings-custom-prompt");
    if (memEl) memEl.value = userMemory;
    if (sysEl) sysEl.value = customSystemPrompt;
  } catch (e) {}
}

async function loadSecurityPin() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "settings", "security"));
    securityPin = snap.exists() ? snap.data().pin || null : null;
    updatePinStatusUI();
  } catch (e) {}
}

function updatePinStatusUI() {
  const statusEl = document.getElementById("security-pin-status");
  if (statusEl) {
    statusEl.textContent = securityPin
      ? "Security PIN is active for Locked Chats & Hidden Vault."
      : "No PIN set yet. Set a PIN to lock or hide conversations.";
  }
}

// ==================== 2. SIDEBAR, SWIPE GESTURES & 6-TAP TOP-LEFT LOGO VAULT ====================
function setupSidebarAndGestures() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");

  const openSidebar = () => {
    if (sidebar) sidebar.classList.remove("-translate-x-full");
    if (backdrop) backdrop.classList.remove("hidden");
  };

  const closeSidebar = () => {
    if (sidebar) sidebar.classList.add("-translate-x-full");
    if (backdrop) backdrop.classList.add("hidden");
  };

  const openBtn = document.getElementById("open-sidebar");
  const closeBtn = document.getElementById("close-sidebar");
  if (openBtn) openBtn.onclick = openSidebar;
  if (closeBtn) closeBtn.onclick = closeSidebar;
  if (backdrop) backdrop.onclick = closeSidebar;

  if (sidebar) {
    const sidebarLogoImg = sidebar.querySelector('img[src="logo.png"]');
    const secretLogoTarget = sidebarLogoImg ? sidebarLogoImg.parentElement : null;
    if (secretLogoTarget) {
      secretLogoTarget.style.cursor = "pointer";
      secretLogoTarget.style.userSelect = "none";
      let logoTapCount = 0;
      let logoTapResetTimer = null;

      secretLogoTarget.addEventListener("click", (e) => {
        e.stopPropagation();
        logoTapCount += 1;
        clearTimeout(logoTapResetTimer);
        logoTapResetTimer = setTimeout(() => {
          logoTapCount = 0;
        }, 2200);

        if (logoTapCount >= 6) {
          logoTapCount = 0;
          clearTimeout(logoTapResetTimer);
          closeSidebar();
          openHiddenVaultFlow();
        }
      });
    }
  }

  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!currentUser || e.changedTouches.length !== 1 || !sidebar) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);

    if (dy < 60) {
      if (dx > 75 && touchStartX < 100) openSidebar();
      else if (dx < -75 && !sidebar.classList.contains("-translate-x-full")) closeSidebar();
    }
  }, { passive: true });

  const searchInput = document.getElementById("chat-search-input");
  if (searchInput) searchInput.oninput = () => renderChatList();

  const newChatBtn = document.getElementById("new-chat-btn");
  if (newChatBtn) {
    newChatBtn.onclick = () => {
      startNewChat();
      closeSidebar();
    };
  }

  const profileBtn = document.getElementById("profile-hold-btn");
  if (profileBtn) {
    profileBtn.onclick = () => {
      closeSidebar();
      renderCustomVoiceListUI();
      document.getElementById("settings-modal").classList.remove("hidden");
    };
  }

  document.addEventListener("click", (e) => {
    const ctx = document.getElementById("chat-context-menu");
    const vctx = document.getElementById("vault-context-menu");
    if (ctx && !ctx.contains(e.target)) ctx.classList.add("hidden");
    if (vctx && !vctx.contains(e.target)) vctx.classList.add("hidden");
    document.querySelectorAll(".custom-select-menu").forEach((m) => m.classList.add("hidden"));
  });
}

// ==================== 3. CHAT LIST, PIN, LOCK, HIDE & VAULT ====================
function subscribeToChats() {
  const q = query(collection(db, "users", currentUser.uid, "chats"), orderBy("updatedAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allChats = [];
    snapshot.forEach((d) => allChats.push({ id: d.id, ...d.data() }));
    renderChatList();
    renderVaultList();
  });
}

function renderChatList() {
  const listEl = document.getElementById("chat-list");
  if (!listEl) return;
  const searchTerm = (document.getElementById("chat-search-input")?.value || "").trim().toLowerCase();
  listEl.innerHTML = "";

  const visibleChats = allChats
    .filter((c) => !c.hidden && (!searchTerm || (c.title || "").toLowerCase().includes(searchTerm)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  if (visibleChats.length === 0) {
    listEl.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-6">No conversations yet</p>`;
    return;
  }

  visibleChats.forEach((chat) => {
    const item = document.createElement("div");
    const isActive = chat.id === currentChatId;
    item.className = `group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer transition ${
      isActive
        ? "bg-blue-600/20 border border-blue-500/40 text-white font-semibold"
        : "text-slate-400 hover:bg-[#131827] hover:text-slate-200 border border-transparent"
    }`;

    const left = document.createElement("div");
    left.className = "flex items-center gap-2 min-w-0 flex-1";

    let iconsHtml = "";
    if (chat.pinned) iconsHtml += `<i class="fa-solid fa-thumbtack text-[10px] text-cyan-400 shrink-0"></i>`;
    if (chat.locked) iconsHtml += `<i class="fa-solid fa-lock text-[10px] text-amber-400 shrink-0"></i>`;

    left.innerHTML = `${iconsHtml}<span class="truncate">${escapeHtml(chat.title || "New Chat")}</span>`;
    left.onclick = () => handleSelectChat(chat);

    const menuBtn = document.createElement("button");
    menuBtn.className = "p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition shrink-0";
    menuBtn.innerHTML = `<i class="fa-solid fa-ellipsis-vertical text-[11px]"></i>`;
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      openChatContextMenu(e, chat);
    };

    item.appendChild(left);
    item.appendChild(menuBtn);
    listEl.appendChild(item);
  });
}

function handleSelectChat(chat) {
  const closeSidebar = () => {
    document.getElementById("sidebar").classList.add("-translate-x-full");
    document.getElementById("sidebar-backdrop").classList.add("hidden");
  };

  if (chat.locked && !unlockedChatsSession.has(chat.id)) {
    openPinModal("verify", () => {
      unlockedChatsSession.add(chat.id);
      closeSidebar();
      loadChatMessages(chat.id);
    });
  } else {
    closeSidebar();
    loadChatMessages(chat.id);
  }
}

function openChatContextMenu(event, chat) {
  targetContextChat = chat;
  const menu = document.getElementById("chat-context-menu");
  menu.classList.remove("hidden");

  const x = Math.min(event.clientX, window.innerWidth - 190);
  const y = Math.min(event.clientY, window.innerHeight - 230);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

document.getElementById("ctx-pin-btn").onclick = async () => {
  if (!targetContextChat) return;
  await updateDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id), { pinned: !targetContextChat.pinned });
};

document.getElementById("ctx-rename-btn").onclick = async () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const newTitle = await showCustomPrompt({
    title: "Rename Conversation",
    defaultValue: chat.title || "",
    placeholder: "Enter conversation name..."
  });
  if (newTitle) {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", chat.id), { title: newTitle });
    showCustomToast("Conversation renamed", "success");
  }
};

document.getElementById("ctx-lock-btn").onclick = () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const mode = securityPin ? "verify" : "setup";
  openPinModal(mode, async () => {
    const nextLocked = !chat.locked;
    await updateDoc(doc(db, "users", currentUser.uid, "chats", chat.id), { locked: nextLocked });
    if (!nextLocked) unlockedChatsSession.add(chat.id);
    showCustomToast(nextLocked ? "Chat locked" : "Chat unlocked", "success");
  });
};

document.getElementById("ctx-hide-btn").onclick = () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const mode = securityPin ? "verify" : "setup";
  openPinModal(mode, async () => {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", chat.id), { hidden: true });
    if (currentChatId === chat.id) startNewChat();
    showCustomToast("Moved to Hidden Vault", "success");
  });
};

document.getElementById("ctx-export-btn").onclick = async () => {
  if (!targetContextChat) return;
  const snap = await getDocs(
    query(collection(db, "users", currentUser.uid, "chats", targetContextChat.id, "messages"), orderBy("createdAt", "asc"))
  );
  let content = `MinDora AI — ${targetContextChat.title}\n${"=".repeat(40)}\n\n`;
  snap.forEach((d) => {
    const m = d.data();
    content += `[${m.role.toUpperCase()}]:\n${m.text}\n\n`;
  });
  const blob = new Blob([content], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(targetContextChat.title || "chat").replace(/[^a-z0-9]/gi, "_")}.txt`;
  a.click();
};

document.getElementById("ctx-delete-btn").onclick = async () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const ok = await showCustomConfirm({
    title: "Delete Conversation",
    message: `Delete "${chat.title || "this chat"}" permanently? This cannot be undone.`,
    confirmText: "Delete",
    danger: true
  });
  if (ok) {
    await deleteDoc(doc(db, "users", currentUser.uid, "chats", chat.id));
    if (currentChatId === chat.id) startNewChat();
    showCustomToast("Conversation deleted", "info");
  }
};

function openHiddenVaultFlow() {
  const mode = securityPin ? "verify" : "setup";
  openPinModal(mode, () => {
    renderVaultList();
    document.getElementById("vault-modal").classList.remove("hidden");
  });
}

function renderVaultList() {
  const vaultEl = document.getElementById("vault-chat-list");
  if (!vaultEl) return;
  vaultEl.innerHTML = "";

  const hiddenChats = allChats.filter((c) => c.hidden);
  if (hiddenChats.length === 0) {
    vaultEl.innerHTML = `<p class="text-xs text-slate-500 text-center py-8">No hidden conversations in your vault.</p>`;
    return;
  }

  hiddenChats.forEach((chat) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between px-3.5 py-3 rounded-2xl bg-[#111625] border border-slate-800 hover:border-purple-500/40 text-xs text-white cursor-pointer select-none transition";

    const left = document.createElement("div");
    left.className = "flex items-center gap-2.5 min-w-0 flex-1";
    left.innerHTML = `
      <i class="fa-solid fa-eye-slash text-purple-400"></i>
      <span class="truncate font-medium">${escapeHtml(chat.title || "Hidden Chat")}</span>
    `;
    left.onclick = () => {
      document.getElementById("vault-modal").classList.add("hidden");
      loadChatMessages(chat.id);
    };

    const optBtn = document.createElement("button");
    optBtn.type = "button";
    optBtn.className = "p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0";
    optBtn.innerHTML = `<i class="fa-solid fa-ellipsis-vertical text-xs"></i>`;
    optBtn.onclick = (e) => {
      e.stopPropagation();
      openVaultContextMenu(e, chat);
    };

    row.appendChild(left);
    row.appendChild(optBtn);
    vaultEl.appendChild(row);
  });
}

function openVaultContextMenu(pos, chat) {
  targetContextChat = chat;
  const menu = document.getElementById("vault-context-menu");
  menu.classList.remove("hidden");
  menu.style.left = `${Math.min(pos.clientX || 120, window.innerWidth - 175)}px`;
  menu.style.top = `${Math.min(pos.clientY || 200, window.innerHeight - 150)}px`;
}

document.getElementById("vctx-unhide-btn").onclick = async () => {
  if (!targetContextChat) return;
  await updateDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id), { hidden: false });
  showCustomToast("Chat unhidden", "success");
};

document.getElementById("vctx-rename-btn").onclick = async () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const name = await showCustomPrompt({
    title: "Rename Hidden Chat",
    defaultValue: chat.title || "",
    placeholder: "Enter new name..."
  });
  if (name) {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", chat.id), { title: name });
    showCustomToast("Hidden chat renamed", "success");
  }
};

document.getElementById("vctx-delete-btn").onclick = async () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const ok = await showCustomConfirm({
    title: "Delete Hidden Chat",
    message: "Delete this hidden conversation permanently?",
    confirmText: "Delete",
    danger: true
  });
  if (ok) {
    await deleteDoc(doc(db, "users", currentUser.uid, "chats", chat.id));
    if (currentChatId === chat.id) startNewChat();
    showCustomToast("Hidden chat deleted", "info");
  }
};

document.getElementById("close-vault-btn").onclick = () => {
  document.getElementById("vault-modal").classList.add("hidden");
};

// ==================== 4. UNIFIED PIN MODAL ====================
let pinCallback = null;
let pinMode = "verify";

function openPinModal(mode, onVerified) {
  pinMode = mode;
  pinCallback = onVerified;

  const modal = document.getElementById("pin-modal");
  const title = document.getElementById("pin-modal-title");
  const desc = document.getElementById("pin-modal-desc");
  const oldWrap = document.getElementById("pin-old-wrap");
  const confirmWrap = document.getElementById("pin-confirm-wrap");
  const forgotBtn = document.getElementById("forgot-pin-trigger-btn");
  const errEl = document.getElementById("pin-error-text");

  document.getElementById("pin-old-input").value = "";
  document.getElementById("pin-input").value = "";
  document.getElementById("pin-confirm-input").value = "";
  errEl.classList.add("hidden");

  if (mode === "setup") {
    title.textContent = "Create Security PIN";
    desc.textContent = "Set a 4 to 6 digit PIN for Lock & Hidden Vault";
    oldWrap.classList.add("hidden");
    confirmWrap.classList.remove("hidden");
    forgotBtn.classList.add("hidden");
  } else if (mode === "change") {
    title.textContent = "Change Security PIN";
    desc.textContent = "Enter your old PIN and choose a new one";
    oldWrap.classList.remove("hidden");
    confirmWrap.classList.remove("hidden");
    forgotBtn.classList.remove("hidden");
  } else {
    title.textContent = "Enter Security PIN";
    desc.textContent = "Verify your PIN to continue";
    oldWrap.classList.add("hidden");
    confirmWrap.classList.add("hidden");
    forgotBtn.classList.remove("hidden");
  }

  modal.classList.remove("hidden");
  setTimeout(() => document.getElementById(mode === "change" ? "pin-old-input" : "pin-input").focus(), 100);
}

document.getElementById("close-pin-modal").onclick = () => {
  document.getElementById("pin-modal").classList.add("hidden");
};

document.getElementById("pin-submit-btn").onclick = async () => {
  const errEl = document.getElementById("pin-error-text");
  const card = document.getElementById("pin-modal-card");
  const oldPin = document.getElementById("pin-old-input").value.trim();
  const pin = document.getElementById("pin-input").value.trim();
  const confirmPin = document.getElementById("pin-confirm-input").value.trim();

  const fail = (msg) => {
    errEl.textContent = msg;
    errEl.classList.remove("hidden");
    card.classList.remove("shake-error");
    void card.offsetWidth;
    card.classList.add("shake-error");
  };

  if (pinMode === "setup") {
    if (!/^\d{4,6}$/.test(pin)) return fail("PIN must be 4 to 6 digits.");
    if (pin !== confirmPin) return fail("PINs do not match.");
    securityPin = pin;
    await setDoc(doc(db, "users", currentUser.uid, "settings", "security"), { pin }, { merge: true });
    updatePinStatusUI();
    document.getElementById("pin-modal").classList.add("hidden");
    if (pinCallback) pinCallback();
  } else if (pinMode === "change") {
    if (oldPin !== securityPin) return fail("Old PIN is incorrect.");
    if (!/^\d{4,6}$/.test(pin)) return fail("New PIN must be 4 to 6 digits.");
    if (pin !== confirmPin) return fail("New PINs do not match.");
    securityPin = pin;
    await setDoc(doc(db, "users", currentUser.uid, "settings", "security"), { pin }, { merge: true });
    updatePinStatusUI();
    document.getElementById("pin-modal").classList.add("hidden");
    showCustomToast("Security PIN updated successfully!", "success");
  } else {
    if (pin !== securityPin) return fail("Incorrect PIN. Try again.");
    document.getElementById("pin-modal").classList.add("hidden");
    if (pinCallback) pinCallback();
  }
};

document.getElementById("forgot-pin-trigger-btn").onclick = () => {
  document.getElementById("pin-modal").classList.add("hidden");
  openForgotPinVerification(() => {
    openPinModal("setup", () => showCustomToast("New Security PIN set!", "success"));
  });
};

// ==================== 5. MESSAGES RENDERING (KaTeX Math + Actions) ====================
let unsubscribeMsgs = null;

function renderMathSafe(container) {
  if (typeof window.renderMathInElement === "function") {
    window.renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true }
      ],
      throwOnError: false
    });
  }
}

function startNewChat() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  currentChatId = null;
  currentMessages = [];
  renderChatList();

  const box = document.getElementById("messages-box");
  box.innerHTML = `
    <div id="welcome-hero" class="max-w-xl mx-auto my-8 text-center space-y-5">
      <div class="w-16 h-16 mx-auto rounded-2xl bg-[#111625] logo-ring flex items-center justify-center overflow-hidden p-1.5">
        <img src="logo.png" alt="MinDora" class="w-full h-full object-contain rounded-xl"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div class="hidden w-full h-full rounded-xl bg-gradient-to-tr from-blue-600/30 to-cyan-400/30 items-center justify-center text-3xl text-cyan-400">
          <i class="fa-solid fa-sparkles"></i>
        </div>
      </div>
      <div>
        <h2 class="text-xl md:text-2xl font-bold text-white">${t("hero_title")}</h2>
        <p class="text-xs text-slate-400 mt-1.5">${t("hero_sub")}</p>
      </div>
    </div>
  `;
}

function loadChatMessages(chatId) {
  currentChatId = chatId;
  renderChatList();
  if (unsubscribeMsgs) unsubscribeMsgs();

  const q = query(collection(db, "users", currentUser.uid, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
  unsubscribeMsgs = onSnapshot(q, (snap) => {
    if (isStreaming) return;
    currentMessages = [];
    const box = document.getElementById("messages-box");
    box.innerHTML = "";

    snap.forEach((d) => {
      const msg = { id: d.id, ...d.data() };
      currentMessages.push(msg);
      box.appendChild(createMessageElement(msg, currentMessages.length - 1));
    });
    box.scrollTop = box.scrollHeight;
  });
}

function createMessageElement(msg, index) {
  const isUser = msg.role === "user";
  const row = document.createElement("div");
  row.className = `flex gap-3 max-w-3xl mx-auto ${isUser ? "justify-end" : "justify-start"}`;

  if (!isUser) {
    const avatar = document.createElement("div");
    avatar.className = "w-8 h-8 rounded-xl bg-[#111625] border border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0 mt-1 p-0.5 shadow";
    avatar.innerHTML = `
      <img src="logo.png" alt="AI" class="w-full h-full object-contain rounded-lg"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <div class="hidden w-full h-full rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 items-center justify-center text-white text-xs">
        <i class="fa-solid fa-sparkles"></i>
      </div>
    `;
    row.appendChild(avatar);
  }

  const col = document.createElement("div");
  col.className = `flex flex-col ${isUser ? "items-end max-w-[85%]" : "items-start flex-1 min-w-0"}`;

  const bubble = document.createElement("div");
  bubble.className = isUser ? "user-bubble px-4 py-3 text-sm" : "w-full ai-bubble px-4 py-3.5";

  if (msg.attachmentName) {
    const badge = document.createElement("div");
    badge.className = "mb-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/25 text-[11px] text-cyan-200";
    badge.innerHTML = `<i class="fa-solid fa-paperclip"></i><span>${escapeHtml(msg.attachmentName)}</span>`;
    bubble.appendChild(badge);
  }

  if (msg.imageUrl) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "mb-2.5 relative inline-block";
    imgWrap.innerHTML = `
      <img src="${msg.imageUrl}" class="max-w-xs sm:max-w-sm rounded-2xl border border-slate-700/80 shadow-lg" />
      <button type="button" class="dl-img-btn mt-2 px-3 py-1.5 rounded-xl bg-[#090c14] hover:bg-blue-600 border border-slate-700 text-white text-[11px] font-semibold flex items-center gap-1.5 transition">
        <i class="fa-solid fa-download"></i> Download HD PNG
      </button>
    `;
    imgWrap.querySelector(".dl-img-btn").onclick = () => downloadImageHD(msg.imageUrl);
    bubble.appendChild(imgWrap);
  }

  const bodyDiv = document.createElement("div");
  if (isUser) {
    bodyDiv.className = "whitespace-pre-wrap leading-relaxed";
    bodyDiv.textContent = msg.text;
  } else {
    bodyDiv.className = "prose-mindora";
    bodyDiv.innerHTML = marked.parse(msg.text || "");
    enhanceCodeBlocks(bodyDiv);
    renderMathSafe(bodyDiv);
  }
  bubble.appendChild(bodyDiv);
  col.appendChild(bubble);

  const actions = document.createElement("div");
  actions.className = "msg-actions";

  if (isUser) {
    const copyBtn = createActionChip("fa-regular fa-copy", "Copy", () => {
      navigator.clipboard.writeText(msg.text);
      copyBtn.querySelector("span").textContent = "Copied";
      setTimeout(() => (copyBtn.querySelector("span").textContent = "Copy"), 1400);
    });

    const editBtn = createActionChip("fa-solid fa-pen", "Edit", () => {
      startInlineEdit(bubble, bodyDiv, msg, index);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
  } else {
    const regenBtn = createActionChip("fa-solid fa-rotate-right", "Regenerate", () => {
      regenerateFromIndex(index);
    });

    const listenBtn = createActionChip("fa-solid fa-volume-high", "Listen", () => {
      unlockMobileAudio();
      toggleNeuralListen(msg.text, listenBtn);
    });

    const copyBtn = createActionChip("fa-regular fa-copy", "Copy", () => {
      navigator.clipboard.writeText(msg.text);
      copyBtn.querySelector("span").textContent = "Copied";
      setTimeout(() => (copyBtn.querySelector("span").textContent = "Copy"), 1400);
    });

    actions.appendChild(regenBtn);
    actions.appendChild(listenBtn);
    actions.appendChild(copyBtn);
  }

  col.appendChild(actions);
  row.appendChild(col);
  return row;
}

function createActionChip(iconClass, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "action-chip";
  btn.innerHTML = `<i class="${iconClass}"></i><span>${label}</span>`;
  btn.onclick = onClick;
  return btn;
}

function startInlineEdit(bubble, bodyDiv, msg, index) {
  const originalText = msg.text;
  bubble.innerHTML = `
    <textarea class="w-full min-w-[220px] sm:min-w-[340px] bg-[#080b14] text-white text-xs p-2.5 rounded-xl border border-cyan-400/50 focus:outline-none resize-none" rows="3">${escapeHtml(originalText)}</textarea>
    <div class="flex justify-end gap-2 mt-2">
      <button type="button" class="cancel-edit px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px]">Cancel</button>
      <button type="button" class="save-edit px-3 py-1 rounded-lg bg-cyan-400 text-slate-950 font-bold text-[11px]">Save & Send</button>
    </div>
  `;
  const ta = bubble.querySelector("textarea");
  ta.focus();

  bubble.querySelector(".cancel-edit").onclick = () => {
    bubble.innerHTML = "";
    bubble.appendChild(bodyDiv);
  };

  bubble.querySelector(".save-edit").onclick = async () => {
    const updatedText = ta.value.trim();
    if (!updatedText) return;

    const toDelete = currentMessages.slice(index);
    const batch = writeBatch(db);
    toDelete.forEach((m) => {
      if (m.id) batch.delete(doc(db, "users", currentUser.uid, "chats", currentChatId, "messages", m.id));
    });
    await batch.commit();

    await sendPromptPipeline(updatedText);
  };
}

async function regenerateFromIndex(aiMsgIndex) {
  if (isStreaming || !currentChatId) return;
  const prevUserMsg = currentMessages[aiMsgIndex - 1];
  if (!prevUserMsg || prevUserMsg.role !== "user") return;

  const toDelete = currentMessages.slice(aiMsgIndex);
  const batch = writeBatch(db);
  toDelete.forEach((m) => {
    if (m.id) batch.delete(doc(db, "users", currentUser.uid, "chats", currentChatId, "messages", m.id));
  });
  await batch.commit();

  await generateAIResponseOnly(prevUserMsg.text, null);
}

function enhanceCodeBlocks(container) {
  container.querySelectorAll("pre").forEach((pre) => {
    const codeEl = pre.querySelector("code");
    const rawCode = codeEl ? codeEl.innerText : pre.innerText;
    const langClass = codeEl ? codeEl.className : "";
    const langName = (langClass.replace("language-", "") || "code").toUpperCase();

    const wrapper = document.createElement("div");
    wrapper.className = "code-wrapper";

    const toolbar = document.createElement("div");
    toolbar.className = "code-toolbar";

    const isPreviewable =
      langName.includes("HTML") ||
      rawCode.includes("<!DOCTYPE html") ||
      rawCode.includes("<html") ||
      (rawCode.includes("<div") && rawCode.includes("</div"));

    toolbar.innerHTML = `
      <span class="font-mono font-bold text-cyan-400">${escapeHtml(langName)}</span>
      <div class="flex items-center gap-2">
        ${isPreviewable ? `<button type="button" class="run-preview-btn px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 hover:bg-emerald-500/30 transition"><i class="fa-solid fa-play mr-1"></i>Run Preview</button>` : ""}
        <button type="button" class="copy-code-btn px-2.5 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition"><i class="fa-regular fa-copy mr-1"></i>Copy</button>
      </div>
    `;

    toolbar.querySelector(".copy-code-btn").onclick = (e) => {
      navigator.clipboard.writeText(rawCode);
      e.currentTarget.innerHTML = `<i class="fa-solid fa-check text-emerald-400 mr-1"></i>Copied`;
      setTimeout(() => (e.currentTarget.innerHTML = `<i class="fa-regular fa-copy mr-1"></i>Copy`), 1400);
    };

    const runBtn = toolbar.querySelector(".run-preview-btn");
    if (runBtn) {
      runBtn.onclick = () => {
        document.getElementById("code-preview-iframe").srcdoc = rawCode;
        document.getElementById("code-preview-modal").classList.remove("hidden");
      };
    }

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(toolbar);
    wrapper.appendChild(pre);
  });
}

async function downloadImageHD(url) {
  try {
    if (url.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `MinDora_AI_${Date.now()}.png`;
      a.click();
      return;
    }
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.startsWith("image/")) {
      showCustomToast("Image download failed. Try regenerating.", "error");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `MinDora_AI_${Date.now()}.png`;
    a.click();
  } catch (e) {
    window.open(url, "_blank");
  }
}

// ==================== 6. GOOGLE GEMINI NATIVE VOICE + UNLIMITED FALLBACK ENGINE ====================
function stopCurrentSpeech() {
  if (textSyncInterval) {
    clearInterval(textSyncInterval);
    textSyncInterval = null;
  }
  if (typeof window.speechSynthesis !== "undefined") {
    window.speechSynthesis.cancel();
  }
  sharedAudioPlayer.pause();
  sharedAudioPlayer.onplay = null;
  sharedAudioPlayer.onended = null;
  sharedAudioPlayer.onerror = null;
  if (activeAudioBtn) {
    activeAudioBtn.classList.remove("speaking-active");
    activeAudioBtn.querySelector("span").textContent = "Listen";
    activeAudioBtn = null;
  }
  if (activePreviewVoiceId) {
    activePreviewVoiceId = null;
    renderCustomVoiceListUI();
  }
}

function cleanTextForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, " Code block is shown on screen. ")
    .replace(/\$\$[\s\S]*?\$\$/g, " equation ")
    .replace(/\$/g, "")
    .replace(/[*#`_~>]/g, "")
    .trim()
    .slice(0, 750);
}

// 100% Google Gemini Native Audio Generation (No ElevenLabs limits!)
async function fetchGeminiAudioUrl(text, voiceName = "Aoede") {
  const apiKey = getApiKey();
  const cleanSpeechText = cleanTextForSpeech(text);
  if (!apiKey || !cleanSpeechText) return null;

  const audioModels = [
    "gemini-2.5-flash-preview-tts",
    "gemini-2.0-flash",
    "gemini-2.5-flash"
  ];

  for (const modelName of audioModels) {
    try {
      const isTtsModel = modelName.includes("-tts");
      const bodyPayload = isTtsModel
        ? {
            contents: [{ parts: [{ text: cleanSpeechText }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName }
                }
              }
            }
          }
        : {
            contents: [
              {
                parts: [
                  {
                    text: `Read aloud the following text naturally, warmly, and clearly in its exact original language without adding or changing any words:\n\n${cleanSpeechText}`
                  }
                ]
              }
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName }
                }
              }
            }
          };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey
          },
          body: JSON.stringify(bodyPayload)
        }
      );

      if (res.ok) {
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
        const inlineObj = audioPart?.inlineData || audioPart?.inline_data;
        if (inlineObj?.data) {
          const mime = (inlineObj.mimeType || inlineObj.mime_type || "").toLowerCase();
          if (mime.includes("wav") || mime.includes("mp3") || mime.includes("ogg")) {
            return `data:${mime};base64,${inlineObj.data}`;
          }
          const rateMatch = mime.match(/rate=(\d+)/);
          const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
          return pcmBase64ToWavUrl(inlineObj.data, sampleRate);
        }
      }
    } catch (e) {}
  }
  return null;
}

// Instant Unlimited Fallback (Device Neural TTS when offline/rate-limited)
function speakWithDeviceFallback(text, onStart, onEnd) {
  const cleanSpeechText = cleanTextForSpeech(text);
  if (!cleanSpeechText || typeof window.speechSynthesis === "undefined") {
    if (onEnd) onEnd();
    return;
  }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(cleanSpeechText);
  if (/[\u0980-\u09FF]/.test(cleanSpeechText)) utter.lang = "bn-IN";
  else if (/[\u0900-\u097F]/.test(cleanSpeechText)) utter.lang = "hi-IN";
  else utter.lang = "en-IN";

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice =
    voices.find((v) => v.lang.toLowerCase() === utter.lang.toLowerCase()) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(utter.lang.slice(0, 2).toLowerCase()));
  if (matchedVoice) utter.voice = matchedVoice;

  utter.rate = 1.0;
  utter.pitch = 1.02;
  utter.onstart = () => {
    if (onStart) onStart();
  };
  utter.onend = () => {
    if (onEnd) onEnd();
  };
  utter.onerror = () => {
    if (onEnd) onEnd();
  };
  window.speechSynthesis.speak(utter);
}

async function toggleNeuralListen(text, btnEl) {
  if (activeAudioBtn === btnEl) {
    stopCurrentSpeech();
    return;
  }

  stopCurrentSpeech();
  activeAudioBtn = btnEl;
  btnEl.classList.add("speaking-active");
  btnEl.querySelector("span").textContent = "Loading...";

  const voiceName = GEMINI_STUDIO_VOICES[studioVoiceIndex]?.id || "Aoede";
  const wavUrl = await fetchGeminiAudioUrl(text, voiceName);

  if (activeAudioBtn !== btnEl) return;

  if (wavUrl) {
    btnEl.querySelector("span").textContent = "Stop";
    sharedAudioPlayer.src = wavUrl;
    sharedAudioPlayer.onended = () => stopCurrentSpeech();
    sharedAudioPlayer.onerror = () => stopCurrentSpeech();
    sharedAudioPlayer.play().catch(() => stopCurrentSpeech());
  } else {
    speakWithDeviceFallback(
      text,
      () => {
        if (activeAudioBtn === btnEl) btnEl.querySelector("span").textContent = "Stop";
      },
      () => stopCurrentSpeech()
    );
  }
}

// ==================== CUSTOM VOICE LIST WITH INLINE PLAY PREVIEW BUTTONS ====================
function renderCustomVoiceListUI() {
  const nativeSelect = document.getElementById("settings-voice-select");
  if (!nativeSelect || !nativeSelect.parentNode) return;
  nativeSelect.classList.add("hidden");

  let listContainer = document.getElementById("custom-voice-cards-list");
  if (!listContainer) {
    listContainer = document.createElement("div");
    listContainer.id = "custom-voice-cards-list";
    listContainer.className = "space-y-2 mt-1";
    nativeSelect.parentNode.appendChild(listContainer);
  }

  listContainer.innerHTML = "";
  GEMINI_STUDIO_VOICES.forEach((voice, idx) => {
    const isSelected = idx === studioVoiceIndex;
    const isPlayingThis = activePreviewVoiceId === voice.id;

    const row = document.createElement("div");
    row.className = `flex items-center justify-between px-3.5 py-2.5 rounded-2xl border transition cursor-pointer ${
      isSelected
        ? "bg-emerald-500/15 border-emerald-500/60 text-white"
        : "bg-[#080b14] border-slate-800 text-slate-300 hover:border-slate-700"
    }`;

    const left = document.createElement("div");
    left.className = "flex items-center gap-2.5 min-w-0 flex-1";
    left.innerHTML = `
      <span class="w-4 h-4 rounded-full flex items-center justify-center border ${
        isSelected ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-slate-600"
      }">
        ${isSelected ? `<i class="fa-solid fa-check text-[9px]"></i>` : ""}
      </span>
      <div class="truncate">
        <span class="text-xs font-semibold">${escapeHtml(voice.name)}</span>
        <span class="text-[10px] text-slate-400 ml-1.5">${escapeHtml(voice.tag)}</span>
      </div>
    `;

    left.onclick = () => {
      studioVoiceIndex = idx;
      localStorage.setItem("mindora_voice_idx", String(studioVoiceIndex));
      const voiceLabelEl = document.getElementById("live-voice-label");
      if (voiceLabelEl) voiceLabelEl.textContent = voice.name;
      renderCustomVoiceListUI();
    };

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = `w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition ${
      isPlayingThis
        ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/30"
        : "bg-[#131a2c] hover:bg-emerald-500/25 text-emerald-400 border border-slate-700"
    }`;
    playBtn.title = `Preview ${voice.name}`;
    playBtn.innerHTML = isPlayingThis
      ? `<i class="fa-solid fa-stop text-xs"></i>`
      : `<i class="fa-solid fa-play text-xs ml-0.5"></i>`;

    playBtn.onclick = async (e) => {
      e.stopPropagation();
      unlockMobileAudio();

      if (activePreviewVoiceId === voice.id) {
        stopCurrentSpeech();
        return;
      }

      stopCurrentSpeech();
      activePreviewVoiceId = voice.id;
      playBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`;

      const sampleText = `Hello! I am ${voice.name}, powered by Google Gemini. How can I help you today?`;
      let wavUrl = voicePreviewCache[voice.id];
      if (!wavUrl) {
        wavUrl = await fetchGeminiAudioUrl(sampleText, voice.id);
        if (wavUrl) voicePreviewCache[voice.id] = wavUrl;
      }

      if (activePreviewVoiceId !== voice.id) return;

      if (wavUrl) {
        renderCustomVoiceListUI();
        sharedAudioPlayer.src = wavUrl;
        sharedAudioPlayer.onended = () => {
          activePreviewVoiceId = null;
          renderCustomVoiceListUI();
        };
        sharedAudioPlayer.onerror = () => {
          activePreviewVoiceId = null;
          renderCustomVoiceListUI();
        };
        sharedAudioPlayer.play().catch(() => {
          activePreviewVoiceId = null;
          renderCustomVoiceListUI();
        });
      } else {
        speakWithDeviceFallback(
          sampleText,
          () => renderCustomVoiceListUI(),
          () => {
            activePreviewVoiceId = null;
            renderCustomVoiceListUI();
          }
        );
      }
    };

    row.appendChild(left);
    row.appendChild(playBtn);
    listContainer.appendChild(row);
  });
}

// ==================== 7. INPUT BAR, FILE UPLOAD & SEND/STOP ====================
function setupChatInputAndTools() {
  const input = document.getElementById("chat-input");
  const sendStopBtn = document.getElementById("send-stop-btn");

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 130) + "px";
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) sendPromptPipeline();
    }
  });

  sendStopBtn.onclick = () => {
    if (isStreaming && streamAbortController) {
      streamAbortController.abort();
      setStreamingState(false);
    } else {
      sendPromptPipeline();
    }
  };

  document.querySelectorAll(".quick-prompt").forEach((btn) => {
    btn.onclick = () => sendPromptPipeline(btn.dataset.prompt);
  });

  document.querySelectorAll(".mode-pill").forEach((pill) => {
    pill.onclick = () => {
      activeMode = pill.dataset.mode;
      document.querySelectorAll(".mode-pill").forEach((p) => {
        p.className = "mode-pill px-3 py-1 rounded-full text-[11px] font-medium bg-[#111625] text-slate-400 border border-slate-800 hover:text-white transition";
      });
      pill.className = "mode-pill px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-600/25 text-cyan-300 border border-blue-500/40 transition";
    };
  });

  document.getElementById("file-input").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      showCustomToast("Video files are not supported. Upload images, PDFs, audio, or code.", "error");
      e.target.value = "";
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isBinaryMultimodal = isImage || file.type === "application/pdf" || file.type.startsWith("audio/");

    const reader = new FileReader();
    reader.onload = () => {
      if (isBinaryMultimodal) {
        attachedFile = {
          name: file.name,
          mime: file.type,
          base64: reader.result.split(",")[1],
          isImage
        };
      } else {
        attachedFile = {
          name: file.name,
          mime: "text/plain",
          textContent: reader.result,
          isImage: false
        };
      }

      document.getElementById("attachment-name").textContent = file.name;
      document.getElementById("attachment-type").textContent = isImage ? "Image attached" : "File ready";
      const thumb = document.getElementById("attachment-thumb");
      const icon = document.getElementById("attachment-file-icon");

      if (isImage) {
        thumb.src = reader.result;
        thumb.classList.remove("hidden");
        icon.classList.add("hidden");
      } else {
        thumb.classList.add("hidden");
        icon.classList.remove("hidden");
      }
      document.getElementById("attachment-preview").classList.remove("hidden");
    };

    if (isBinaryMultimodal) reader.readAsDataURL(file);
    else reader.readAsText(file);
    e.target.value = "";
  };

  document.getElementById("clear-attachment-btn").onclick = clearAttachment;

  document.getElementById("enhance-prompt-btn").onclick = async () => {
    const raw = input.value.trim();
    if (!raw || isStreaming) return;
    const btn = document.getElementById("enhance-prompt-btn");
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`;
    try {
      const enhanced = await callGeminiSingleShot(
        `Rewrite and expand this user prompt to be clearer, richer, and more effective for an AI assistant. Return ONLY the improved prompt text:\n\n"${raw}"`
      );
      if (enhanced) {
        input.value = enhanced.trim();
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 130) + "px";
      }
    } finally {
      btn.innerHTML = `<i class="fa-solid fa-wand-sparkles text-xs"></i>`;
    }
  };
}

function clearAttachment() {
  attachedFile = null;
  document.getElementById("attachment-preview").classList.add("hidden");
}

function setStreamingState(active) {
  isStreaming = active;
  const btn = document.getElementById("send-stop-btn");
  const icon = document.getElementById("send-stop-icon");
  if (active) {
    btn.classList.remove("bg-blue-600", "hover:bg-blue-500");
    btn.classList.add("bg-red-600", "hover:bg-red-500");
    icon.className = "fa-solid fa-stop";
  } else {
    btn.classList.remove("bg-red-600", "hover:bg-red-500");
    btn.classList.add("bg-blue-600", "hover:bg-blue-500");
    icon.className = "fa-solid fa-arrow-up";
  }
}

// ==================== 8. SMOOTH TYPEWRITER STREAMING & SYNCHRONIZED LIVE PIPELINE ====================
async function animateTextStream(targetEl, fullText, boxEl, signal) {
  const words = fullText.split(/(\s+)/);
  let rendered = "";
  const step = Math.max(2, Math.ceil(words.length / 65));

  for (let i = 0; i < words.length; i += step) {
    if (signal && signal.aborted) break;
    rendered += words.slice(i, i + step).join("");
    targetEl.innerHTML = marked.parse(rendered);
    boxEl.scrollTop = boxEl.scrollHeight;
    await new Promise((r) => setTimeout(r, 15));
  }
  targetEl.innerHTML = marked.parse(rendered || fullText);
  return rendered || fullText;
}

async function sendPromptPipeline(overrideText = null, liveVoiceCallback = null) {
  const input = document.getElementById("chat-input");
  const rawText = (overrideText !== null ? overrideText : input.value).trim();
  if (!rawText && !attachedFile) {
    if (liveVoiceCallback) liveVoiceCallback("");
    return;
  }

  input.value = "";
  input.style.height = "auto";

  const filePayload = attachedFile;
  clearAttachment();

  try {
    if (!currentChatId) {
      const newChatRef = await addDoc(collection(db, "users", currentUser.uid, "chats"), {
        title: (rawText.replace(/\n\n\[Voice Conversation Note:[\s\S]*\]$/, "") || filePayload?.name || "New Chat").slice(0, 38),
        pinned: false,
        locked: false,
        hidden: false,
        updatedAt: serverTimestamp()
      });
      currentChatId = newChatRef.id;
    } else {
      await updateDoc(doc(db, "users", currentUser.uid, "chats", currentChatId), {
        updatedAt: serverTimestamp()
      });
    }

    const displayUserText = rawText.replace(/\n\n\[Voice Conversation Note:[\s\S]*\]$/, "") || `Analyze attached file: ${filePayload.name}`;
    const userMsgObj = {
      role: "user",
      text: displayUserText,
      attachmentName: filePayload ? filePayload.name : null,
      imageUrl: filePayload?.isImage ? `data:${filePayload.mime};base64,${filePayload.base64}` : null,
      createdAt: serverTimestamp()
    };

    const hero = document.getElementById("welcome-hero");
    if (hero) hero.remove();

    const box = document.getElementById("messages-box");
    box.appendChild(createMessageElement(userMsgObj, currentMessages.length));
    box.scrollTop = box.scrollHeight;

    await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
      role: "user",
      text: displayUserText,
      attachmentName: filePayload ? filePayload.name : null,
      createdAt: serverTimestamp()
    });

    if (rawText.toLowerCase().startsWith("/imagine ")) {
      const prompt = rawText.slice(9).trim();
      await triggerImageGeneration(prompt, "1024x1024");
      if (liveVoiceCallback) liveVoiceCallback("Your image has been generated.");
      return;
    }

    autoCaptureMemory(displayUserText);
    await generateAIResponseOnly(rawText, filePayload, liveVoiceCallback);
  } catch (err) {
    if (liveVoiceCallback) liveVoiceCallback("Network error. Please try again.");
  }
}

async function generateAIResponseOnly(promptText, filePayload, liveVoiceCallback = null) {
  const box = document.getElementById("messages-box");

  const aiRow = document.createElement("div");
  aiRow.className = "flex gap-3 max-w-3xl mx-auto justify-start";
  aiRow.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-[#111625] border border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0 mt-1 p-0.5 shadow">
      <img src="logo.png" alt="AI" class="w-full h-full object-contain rounded-lg"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
      <div class="hidden w-full h-full rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 items-center justify-center text-white text-xs">
        <i class="fa-solid fa-sparkles"></i>
      </div>
    </div>
    <div class="flex-1 min-w-0 ai-bubble px-4 py-3.5">
      <div class="prose-mindora streaming-cursor"></div>
    </div>
  `;
  const textTarget = aiRow.querySelector(".prose-mindora");
  box.appendChild(aiRow);
  box.scrollTop = box.scrollHeight;

  setStreamingState(true);
  streamAbortController = new AbortController();

  const selectedKey = document.getElementById("model-select").value;
  const modelSpec = MINDORA_MODELS[selectedKey] || MINDORA_MODELS.auto;
  const modePrompt = QUICK_MODES[activeMode]?.instruction || "";

  const activeChain = liveVoiceCallback
    ? ["gemini-flash-lite-latest", "gemini-flash-latest"]
    : modelSpec.chain;

  const systemGuide = `You are MinDora AI, a sharp, friendly, and intelligent personal AI assistant. Respond naturally in the exact language the user writes or speaks in (default to English if ambiguous).
${MINDORA_IDENTITY_PROMPT}
${modelSpec.styleHint ? `Model Profile: ${modelSpec.styleHint}` : ""}
Mode Behavior: ${modePrompt}
User Profile: Name is ${currentProfile?.fullName || "User"}, Age ${currentProfile?.age || "N/A"}, Gender ${currentProfile?.gender || "N/A"}.
Saved Memory: ${userMemory || "None yet."}
Custom Instructions: ${customSystemPrompt || "None."}`;

  let finalUserPrompt = promptText;
  if (filePayload?.textContent) {
    finalUserPrompt += `\n\n--- Attached File (${filePayload.name}) ---\n${filePayload.textContent.slice(0, 25000)}`;
  }

  const userParts = [{ text: `[System Context: ${systemGuide}]\n\n${finalUserPrompt}` }];
  if (filePayload?.base64) {
    userParts.push({ inline_data: { mime_type: filePayload.mime, data: filePayload.base64 } });
  }

  const historyContents = currentMessages.slice(-8).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }]
  }));

  const payload = {
    contents: [...historyContents, { role: "user", parts: userParts }]
  };

  let finalReply = "";
  let succeeded = false;
  let lastApiError = "";

  for (const modelName of activeChain) {
    if (streamAbortController.signal.aborted) break;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": getApiKey()
        },
        body: JSON.stringify(payload),
        signal: streamAbortController.signal
      });

      const data = await res.json();
      if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const rawReply = data.candidates[0].content.parts[0].text;
        if (liveVoiceCallback) {
          liveVoiceCallback(rawReply);
          textTarget.innerHTML = marked.parse(rawReply);
          finalReply = rawReply;
        } else {
          finalReply = await animateTextStream(textTarget, rawReply, box, streamAbortController.signal);
        }
        succeeded = true;
        break;
      } else if (data.error?.message) {
        lastApiError = data.error.message;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        succeeded = true;
        break;
      }
      lastApiError = err.message;
    }
  }

  textTarget.classList.remove("streaming-cursor");
  renderMathSafe(textTarget);
  setStreamingState(false);

  if (!succeeded && !finalReply) {
    finalReply = `**Error:** ${lastApiError || "Unable to connect. Please check your Google Gemini API key in Settings."}`;
    textTarget.innerHTML = marked.parse(finalReply);
    if (liveVoiceCallback) liveVoiceCallback("Sorry, I could not connect right now. Please try again.");
  }

  await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
    role: "model",
    text: finalReply,
    createdAt: serverTimestamp()
  });

  loadChatMessages(currentChatId);
}

async function callGeminiSingleShot(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": getApiKey()
    },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function autoCaptureMemory(text) {
  if (/\b(remember|my name is|i am a|i live in|i like)\b/i.test(text) || /মনে রাখ|আমার নাম|আমি একজন/.test(text)) {
    const line = `- ${text.slice(0, 120)}`;
    if (!userMemory.includes(line)) {
      userMemory = `${userMemory}\n${line}`.trim();
      const memEl = document.getElementById("settings-memory-input");
      if (memEl) memEl.value = userMemory;
      await setDoc(doc(db, "users", currentUser.uid, "settings", "personalization"), { memory: userMemory }, { merge: true });
    }
  }
}

// ==================== 9. GOOGLE GEMINI NATIVE IMAGE STUDIO + UNLIMITED BACKUP ====================
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function ensureFirestoreSafeImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("data:image/")) return Promise.resolve(imageUrl);
  if (imageUrl.length < 750000) return Promise.resolve(imageUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 896;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}

async function triggerImageGeneration(prompt, ratio = "1024x1024") {
  const box = document.getElementById("messages-box");
  const loadingRow = document.createElement("div");
  loadingRow.id = "img-gen-loader";
  loadingRow.className = "flex gap-3 max-w-3xl mx-auto justify-start";
  loadingRow.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-[#111625] border border-slate-700/80 flex items-center justify-center shrink-0 mt-1">
      <i class="fa-solid fa-wand-magic-sparkles text-cyan-400 text-xs animate-spin"></i>
    </div>
    <div class="ai-bubble px-4 py-3 text-xs text-cyan-300 flex items-center gap-2">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Generating Gemini HD artwork for "${escapeHtml(prompt)}"...</span>
    </div>
  `;
  box.appendChild(loadingRow);
  box.scrollTop = box.scrollHeight;

  let finalImageUrl = null;
  let lastImgError = "";
  const apiKey = getApiKey();

  // 1. Primary: Google Gemini Native Image Models
  if (apiKey) {
    const googleImageModels = [
      "gemini-2.5-flash-image",
      "gemini-2.0-flash-exp-image-generation",
      "gemini-3.1-flash-image-preview"
    ];
    for (const modelName of googleImageModels) {
      if (finalImageUrl) break;
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": apiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Generate a high-resolution, detailed image: ${prompt}` }] }],
              generationConfig: {
                responseModalities: ["IMAGE", "TEXT"]
              }
            })
          }
        );
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
        const inlineObj = imgPart?.inlineData || imgPart?.inline_data;
        if (inlineObj?.data) {
          const mime = inlineObj.mimeType || inlineObj.mime_type || "image/png";
          finalImageUrl = `data:${mime};base64,${inlineObj.data}`;
          break;
        } else if (data.error?.message) {
          lastImgError = data.error.message;
        }
      } catch (e) {
        lastImgError = e.message;
      }
    }
  }

  // 2. Unlimited Free Fallback (AI Horde — zero API key or IP rate-limit blocks)
  if (!finalImageUrl) {
    try {
      const submitRes = await fetch("https://stablehorde.net/api/v2/generate/async", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": "0000000000"
        },
        body: JSON.stringify({
          prompt: `${prompt}, high quality, detailed`,
          params: {
            width: 512,
            height: 512,
            steps: 20,
            n: 1
          },
          nsfw: false,
          censor_nsfw: true
        })
      });
      const submitData = await submitRes.json();
      if (submitData.id) {
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          const checkRes = await fetch(`https://stablehorde.net/api/v2/generate/status/${submitData.id}`);
          const checkData = await checkRes.json();
          if (checkData.done && Array.isArray(checkData.generations) && checkData.generations[0]?.img) {
            const genImg = checkData.generations[0].img;
            if (genImg.startsWith("http")) {
              const imgRes = await fetch(genImg);
              const blob = await imgRes.blob();
              finalImageUrl = await blobToDataUrl(blob);
            } else {
              finalImageUrl = `data:image/webp;base64,${genImg}`;
            }
            break;
          }
        }
      }
    } catch (e) {}
  }

  const loader = document.getElementById("img-gen-loader");
  if (loader) loader.remove();

  if (finalImageUrl) {
    finalImageUrl = await ensureFirestoreSafeImage(finalImageUrl);
    const caption = `Generated HD artwork for: **"${prompt}"**`;
    await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
      role: "model",
      text: caption,
      imageUrl: finalImageUrl,
      createdAt: serverTimestamp()
    });
  } else {
    showCustomToast(`Image busy right now. Please try again in a few seconds.`, "error");
    await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
      role: "model",
      text: `**Image Generation Busy:** ${lastImgError || "Please try again in a few seconds."}`,
      createdAt: serverTimestamp()
    });
  }

  loadChatMessages(currentChatId);
}

// ==================== 10. MODALS, SETTINGS & LANGUAGE ====================
function setupModalsAndSettings() {
  document.getElementById("close-settings-btn").onclick = () => {
    stopCurrentSpeech();
    document.getElementById("settings-modal").classList.add("hidden");
  };

  renderCustomVoiceListUI();

  document.querySelectorAll(".settings-tab").forEach((tab) => {
    tab.onclick = () => {
      const target = tab.dataset.stab;
      document.querySelectorAll(".settings-tab").forEach((tEl) => {
        tEl.className = "settings-tab py-2 rounded-xl text-slate-400 hover:text-white";
      });
      tab.className = "settings-tab py-2 rounded-xl bg-blue-600 text-white";

      document.querySelectorAll(".settings-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `spanel-${target}`);
      });
      if (target === "personalization") renderCustomVoiceListUI();
    };
  });

  document.getElementById("save-personalization-btn").onclick = async () => {
    userMemory = document.getElementById("settings-memory-input").value.trim();
    customSystemPrompt = document.getElementById("settings-custom-prompt").value.trim();

    await setDoc(
      doc(db, "users", currentUser.uid, "settings", "personalization"),
      { memory: userMemory, customPrompt: customSystemPrompt },
      { merge: true }
    );

    showCustomToast("Personalization saved!", "success");
  };

  document.getElementById("open-change-pin-btn").onclick = () => {
    openPinModal(securityPin ? "change" : "setup", () => updatePinStatusUI());
  };

  document.getElementById("open-forgot-pin-btn").onclick = () => {
    openForgotPinVerification(() => {
      openPinModal("setup", () => {
        updatePinStatusUI();
        showCustomToast("New Security PIN saved!", "success");
      });
    });
  };

  document.getElementById("open-imagine-modal-btn").onclick = () => {
    document.getElementById("imagine-modal").classList.remove("hidden");
  };
  document.getElementById("close-imagine-modal").onclick = () => {
    document.getElementById("imagine-modal").classList.add("hidden");
  };
  document.getElementById("generate-image-btn").onclick = async () => {
    const rawPrompt = document.getElementById("imagine-prompt-input").value.trim();
    if (!rawPrompt) return;
    const style = document.getElementById("imagine-style").value;
    const ratio = document.getElementById("imagine-ratio").value;

    document.getElementById("imagine-modal").classList.add("hidden");
    document.getElementById("imagine-prompt-input").value = "";

    if (!currentChatId) {
      const ref = await addDoc(collection(db, "users", currentUser.uid, "chats"), {
        title: `Art: ${rawPrompt.slice(0, 28)}`,
        pinned: false,
        locked: false,
        hidden: false,
        updatedAt: serverTimestamp()
      });
      currentChatId = ref.id;
    }

    await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
      role: "user",
      text: `/imagine ${rawPrompt}`,
      createdAt: serverTimestamp()
    });

    await triggerImageGeneration(`${rawPrompt}, ${style}`, ratio);
  };

  document.getElementById("close-preview-modal").onclick = () => {
    document.getElementById("code-preview-modal").classList.add("hidden");
    document.getElementById("code-preview-iframe").srcdoc = "";
  };
}

function renderLanguageOptions() {
  const container = document.getElementById("language-list-container");
  if (!container) return;
  const activeCode = getCurrentLang();
  container.innerHTML = "";

  SUPPORTED_LANGUAGES.forEach((lang) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isSelected = lang.code === activeCode;
    btn.className = `flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs transition ${
      isSelected
        ? "bg-blue-600/20 border-blue-500 text-white font-semibold"
        : "bg-[#080b14] border-slate-800 text-slate-300 hover:border-slate-700"
    }`;
    btn.innerHTML = `
      <span>${lang.native} <span class="text-slate-500 text-[10px]">(${lang.name})</span></span>
      ${isSelected ? `<i class="fa-solid fa-circle-check text-cyan-400"></i>` : ""}
    `;
    btn.onclick = () => {
      applyLanguage(lang.code);
      renderLanguageOptions();
    };
    container.appendChild(btn);
  });
}

// ==================== 11. GEMINI LIVE SYNCHRONIZED TEXT & VOICE ENGINE ====================
function setupLiveVoiceEngine() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  const orb = document.getElementById("live-orb");
  const statusText = document.getElementById("live-status-text");
  const userCaption = document.getElementById("live-user-caption");
  const stateBadge = document.getElementById("live-state-badge");
  const stateDot = document.getElementById("live-state-dot");
  const interruptBtn = document.getElementById("live-interrupt-btn");
  const speechLangBtn = document.getElementById("live-speech-lang-btn");
  const speechLangLabel = document.getElementById("live-speech-lang-label");

  const SPEECH_MODES = [
    { id: "auto", label: "Auto" },
    { id: "en-IN", label: "English" },
    { id: "bn-IN", label: "Bengali" },
    { id: "hi-IN", label: "Hindi" }
  ];
  let speechModeIdx = 0;
  let detectedRecLang = "en-IN";
  if (speechLangLabel) speechLangLabel.textContent = SPEECH_MODES[speechModeIdx].label;

  let isAiSpeakingTurn = false;
  let isWaitingForAiReply = false;
  let isMicStarting = false;

  const savedVoiceIdx = parseInt(localStorage.getItem("mindora_voice_idx") || "0", 10);
  studioVoiceIndex = isNaN(savedVoiceIdx) ? 0 : savedVoiceIdx % GEMINI_STUDIO_VOICES.length;
  const voiceLabelEl = document.getElementById("live-voice-label");
  if (voiceLabelEl) {
    voiceLabelEl.textContent = GEMINI_STUDIO_VOICES[studioVoiceIndex].name;
  }

  function detectLanguageFromText(text) {
    if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
    if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
    return "en-IN";
  }

  function stopAllLiveAudio() {
    isAiSpeakingTurn = false;
    if (textSyncInterval) {
      clearInterval(textSyncInterval);
      textSyncInterval = null;
    }
    if (typeof window.speechSynthesis !== "undefined") {
      window.speechSynthesis.cancel();
    }
    sharedAudioPlayer.pause();
    sharedAudioPlayer.onplay = null;
    sharedAudioPlayer.onended = null;
    sharedAudioPlayer.onerror = null;
  }

  function revealTextSyncedWithAudio(fullCleanText, useTimerFallback = false) {
    if (!statusText) return;
    if (textSyncInterval) {
      clearInterval(textSyncInterval);
      textSyncInterval = null;
    }

    const words = fullCleanText.split(/\s+/);
    if (words.length <= 3) {
      statusText.textContent = fullCleanText;
      return;
    }

    let idx = 0;
    statusText.textContent = "";
    textSyncInterval = setInterval(() => {
      if (!isLiveActive || !isAiSpeakingTurn) {
        clearInterval(textSyncInterval);
        textSyncInterval = null;
        return;
      }

      if (!useTimerFallback && sharedAudioPlayer.duration && !isNaN(sharedAudioPlayer.duration) && sharedAudioPlayer.duration > 0) {
        const progress = Math.min(1, (sharedAudioPlayer.currentTime + 0.15) / sharedAudioPlayer.duration);
        const targetWordCount = Math.max(1, Math.ceil(progress * words.length));
        statusText.textContent = words.slice(0, targetWordCount).join(" ");
        if (progress >= 1) {
          clearInterval(textSyncInterval);
          textSyncInterval = null;
        }
      } else {
        idx = Math.min(words.length, idx + 1);
        statusText.textContent = words.slice(0, idx).join(" ");
        if (idx >= words.length) {
          clearInterval(textSyncInterval);
          textSyncInterval = null;
        }
      }
    }, 110);
  }

  async function playLiveOverlayPreview(voiceIdx) {
    unlockMobileAudio();
    const voiceObj = GEMINI_STUDIO_VOICES[voiceIdx] || GEMINI_STUDIO_VOICES[0];
    const sampleText = `Hello! I am ${voiceObj.name}. Speak to me in English, Bengali, or Hindi!`;

    stopAllLiveAudio();
    try { if (recognition) recognition.abort(); } catch (e) {}

    if (statusText) statusText.textContent = `Loading ${voiceObj.name} preview...`;

    let wavUrl = voicePreviewCache[voiceObj.id];
    if (!wavUrl) {
      wavUrl = await fetchGeminiAudioUrl(sampleText, voiceObj.id);
      if (wavUrl) voicePreviewCache[voiceObj.id] = wavUrl;
    }

    const finishPreview = () => {
      isAiSpeakingTurn = false;
      if (statusText) statusText.textContent = sampleText;
      if (isLiveActive && !isLiveMuted) {
        setTimeout(() => {
          if (statusText) statusText.textContent = "Listening... Go ahead.";
          safeStartMic();
        }, 450);
      }
    };

    if (wavUrl) {
      isAiSpeakingTurn = true;
      sharedAudioPlayer.src = wavUrl;
      sharedAudioPlayer.onplay = () => {
        setLiveTurnUI("speaking");
        revealTextSyncedWithAudio(sampleText, false);
      };
      sharedAudioPlayer.onended = finishPreview;
      sharedAudioPlayer.onerror = finishPreview;
      sharedAudioPlayer.play().catch(finishPreview);
    } else {
      isAiSpeakingTurn = true;
      speakWithDeviceFallback(
        sampleText,
        () => {
          setLiveTurnUI("speaking");
          revealTextSyncedWithAudio(sampleText, true);
        },
        finishPreview
      );
    }
  }

  if (speechLangBtn) {
    speechLangBtn.onclick = () => {
      speechModeIdx = (speechModeIdx + 1) % SPEECH_MODES.length;
      if (speechLangLabel) speechLangLabel.textContent = SPEECH_MODES[speechModeIdx].label;
      if (recognition && isLiveActive && !isLiveMuted && !isAiSpeakingTurn) {
        try { recognition.abort(); } catch (e) {}
        setTimeout(safeStartMic, 350);
      }
    };
  }

  function setLiveTurnUI(state) {
    if (!stateBadge || !stateDot || !orb) return;
    if (state === "listening") {
      stateBadge.textContent = "Listening";
      stateDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
      orb.classList.remove("speaking", "muted");
      if (interruptBtn) interruptBtn.classList.add("hidden");
    } else if (state === "thinking") {
      stateBadge.textContent = "Thinking...";
      stateDot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping";
      orb.classList.remove("speaking");
      if (interruptBtn) interruptBtn.classList.add("hidden");
    } else if (state === "speaking") {
      stateBadge.textContent = "MinDora Speaking";
      stateDot.className = "w-2 h-2 rounded-full bg-cyan-400 animate-pulse";
      orb.classList.add("speaking");
      if (interruptBtn) interruptBtn.classList.remove("hidden");
    } else if (state === "muted") {
      stateBadge.textContent = "Muted";
      stateDot.className = "w-2 h-2 rounded-full bg-red-400";
      orb.classList.add("muted");
      orb.classList.remove("speaking");
      if (interruptBtn) interruptBtn.classList.add("hidden");
    }
  }

  function getActiveRecognitionLang() {
    const mode = SPEECH_MODES[speechModeIdx].id;
    return mode === "auto" ? detectedRecLang : mode;
  }

  function safeStartMic() {
    if (!recognition || !isLiveActive || isLiveMuted || isAiSpeakingTurn || isWaitingForAiReply || isMicStarting) return;
    isMicStarting = true;
    try {
      recognition.lang = getActiveRecognitionLang();
      recognition.start();
      setLiveTurnUI("listening");
    } catch (e) {
    } finally {
      setTimeout(() => { isMicStarting = false; }, 300);
    }
  }

  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (isAiSpeakingTurn || isWaitingForAiReply) return;

      const spokenText = (event.results?.[0]?.[0]?.transcript || "").trim();
      if (!spokenText) return;

      if (isLiveActive) {
        isWaitingForAiReply = true;
        try { recognition.abort(); } catch (e) {}
        if (userCaption) userCaption.textContent = `You: "${spokenText}"`;
        if (statusText) statusText.textContent = "Thinking...";
        setLiveTurnUI("thinking");

        const livePrompt = `${spokenText}\n\n[Voice Conversation Note: Strictly mirror the language the user just spoke! If they spoke English (like "Hello", "Hi", "Who are you", "Okay"), reply 100% in natural English. If they spoke Bengali (even if transcribed phonetically in Roman script like "kemon acho", "tumi ke", "ekta kotha bolo"), reply 100% in natural Bengali script (বাংলা). If they spoke Hindi (even in Roman script like "kaise ho", "kya haal hai"), reply 100% in natural Hindi Devanagari script (हिन्दी). Keep reply warm and concise (1-2 short spoken sentences) with NO markdown symbols, bullet points, or emojis.]`;
        sendPromptPipeline(livePrompt, (aiReply) => {
          isWaitingForAiReply = false;
          detectedRecLang = detectLanguageFromText(aiReply);
          speakInLiveMode(aiReply);
        });
      } else {
        const input = document.getElementById("chat-input");
        input.value = (input.value + " " + spokenText).trim();
        input.focus();
      }
    };

    recognition.onerror = () => {
      if (isLiveActive && !isLiveMuted && !isAiSpeakingTurn && !isWaitingForAiReply) {
        setTimeout(safeStartMic, 500);
      }
    };

    recognition.onend = () => {
      if (isLiveActive && !isLiveMuted && !isAiSpeakingTurn && !isWaitingForAiReply) {
        setTimeout(safeStartMic, 450);
      }
    };
  }

  async function speakInLiveMode(text) {
    const cleanDisplay = text.replace(/[*#`_~>$]/g, "").trim();

    const finishSpeakingTurn = () => {
      isAiSpeakingTurn = false;
      if (textSyncInterval) {
        clearInterval(textSyncInterval);
        textSyncInterval = null;
      }
      if (statusText && cleanDisplay) statusText.textContent = cleanDisplay.slice(0, 260);
      if (!isLiveActive) return;
      if (isLiveMuted) {
        setLiveTurnUI("muted");
      } else {
        setTimeout(() => {
          if (isLiveActive && !isLiveMuted && !isAiSpeakingTurn) {
            if (statusText) statusText.textContent = "Listening... Go ahead.";
            safeStartMic();
          }
        }, 450);
      }
    };

    if (!isLiveSpeakerOn || !isLiveActive || !cleanDisplay) {
      if (statusText) statusText.textContent = cleanDisplay.slice(0, 260);
      finishSpeakingTurn();
      return;
    }

    stopCurrentSpeech();
    stopAllLiveAudio();
    isAiSpeakingTurn = true;
    try { if (recognition) recognition.abort(); } catch (e) {}

    setLiveTurnUI("thinking");
    if (statusText) statusText.textContent = "Thinking...";

    const voiceName = GEMINI_STUDIO_VOICES[studioVoiceIndex]?.id || "Aoede";
    const wavUrl = await fetchGeminiAudioUrl(cleanDisplay, voiceName);

    if (!isLiveActive || !isLiveSpeakerOn || !isAiSpeakingTurn) {
      finishSpeakingTurn();
      return;
    }

    if (wavUrl) {
      sharedAudioPlayer.src = wavUrl;
      sharedAudioPlayer.onplay = () => {
        setLiveTurnUI("speaking");
        revealTextSyncedWithAudio(cleanDisplay.slice(0, 260), false);
      };
      sharedAudioPlayer.onended = finishSpeakingTurn;
      sharedAudioPlayer.onerror = finishSpeakingTurn;
      sharedAudioPlayer.play().catch(() => {
        speakWithDeviceFallback(
          cleanDisplay,
          () => {
            setLiveTurnUI("speaking");
            revealTextSyncedWithAudio(cleanDisplay.slice(0, 260), true);
          },
          finishSpeakingTurn
        );
      });
    } else {
      speakWithDeviceFallback(
        cleanDisplay,
        () => {
          setLiveTurnUI("speaking");
          revealTextSyncedWithAudio(cleanDisplay.slice(0, 260), true);
        },
        finishSpeakingTurn
      );
    }
  }

  if (interruptBtn) {
    interruptBtn.onclick = () => {
      stopAllLiveAudio();
      isWaitingForAiReply = false;
      if (statusText) statusText.textContent = "Listening...";
      safeStartMic();
    };
  }

  document.getElementById("mic-btn").onclick = () => {
    if (!recognition) return showCustomToast("Voice recognition is not supported on this browser.", "error");
    recognition.lang = getActiveRecognitionLang();
    recognition.start();
  };

  document.getElementById("live-talk-btn").onclick = () => {
    if (!recognition) return showCustomToast("Live Voice is not supported on this browser.", "error");
    unlockMobileAudio();
    stopCurrentSpeech();
    stopAllLiveAudio();
    isLiveActive = true;
    isLiveMuted = false;
    isWaitingForAiReply = false;
    detectedRecLang = "en-IN";
    if (userCaption) userCaption.textContent = "";
    if (statusText) statusText.textContent = "Listening... Say Hello or speak in any language.";
    document.getElementById("live-mute-icon").className = "fa-solid fa-microphone";
    document.getElementById("live-overlay").classList.remove("hidden");
    safeStartMic();
  };

  document.getElementById("live-mute-btn").onclick = () => {
    isLiveMuted = !isLiveMuted;
    const icon = document.getElementById("live-mute-icon");
    if (isLiveMuted) {
      icon.className = "fa-solid fa-microphone-slash text-red-400";
      if (statusText) statusText.textContent = "Microphone Muted";
      setLiveTurnUI("muted");
      try { if (recognition) recognition.abort(); } catch (e) {}
    } else {
      icon.className = "fa-solid fa-microphone";
      if (statusText) statusText.textContent = "Listening...";
      safeStartMic();
    }
  };

  document.getElementById("live-speaker-btn").onclick = () => {
    isLiveSpeakerOn = !isLiveSpeakerOn;
    const icon = document.getElementById("live-speaker-icon");
    if (isLiveSpeakerOn) {
      unlockMobileAudio();
      icon.className = "fa-solid fa-volume-high text-cyan-400";
    } else {
      stopAllLiveAudio();
      icon.className = "fa-solid fa-volume-xmark text-slate-500";
      if (!isLiveMuted) safeStartMic();
    }
  };

  document.getElementById("live-voice-style-btn").onclick = () => {
    studioVoiceIndex = (studioVoiceIndex + 1) % GEMINI_STUDIO_VOICES.length;
    localStorage.setItem("mindora_voice_idx", String(studioVoiceIndex));
    const vName = GEMINI_STUDIO_VOICES[studioVoiceIndex].name;
    if (voiceLabelEl) voiceLabelEl.textContent = vName;
    renderCustomVoiceListUI();
    playLiveOverlayPreview(studioVoiceIndex);
  };

  document.getElementById("close-live-btn").onclick = () => {
    isLiveActive = false;
    isWaitingForAiReply = false;
    stopAllLiveAudio();
    orb.classList.remove("speaking", "muted");
    try { if (recognition) recognition.abort(); } catch (e) {}
    document.getElementById("live-overlay").classList.add("hidden");
  };
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}
