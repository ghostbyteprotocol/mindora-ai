// app.js — MinDora AI Core Engine (Streaming, Multimodal, PIN Vault, Live Voice & Settings)
import { db, getApiKey, MINDORA_MODELS, QUICK_MODES } from "./config.js";
import { SUPPORTED_LANGUAGES, getCurrentLang, applyLanguage, t } from "./lang.js";
import { initAuth, openForgotPinVerification } from "./auth.js";
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

// Attachment State
let attachedFile = null; // { name, mime, base64, textContent, isImage }

// Streaming & Speech State
let isStreaming = false;
let streamAbortController = null;
let activeSpeechBtn = null;

// Context Menu & Vault State
let targetContextChat = null;
let unlockedChatsSession = new Set();

// Live Voice State
let isLiveActive = false;
let isLiveMuted = false;
let isLiveSpeakerOn = true;
let voiceStyleIndex = 0;
const VOICE_STYLES = [
  { name: "Natural", pitch: 1.0, rate: 1.02 },
  { name: "Soft", pitch: 1.25, rate: 1.04 },
  { name: "Deep", pitch: 0.78, rate: 0.96 },
  { name: "Fast", pitch: 1.05, rate: 1.22 }
];

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
  applyLanguage(getCurrentLang());
  renderLanguageOptions();
  setupSidebarAndGestures();
  setupChatInputAndTools();
  setupModalsAndSettings();
  setupLiveVoiceEngine();

  initAuth(async (user, profile) => {
    currentUser = user;
    currentProfile = profile;
    await loadUserPersonalization();
    await loadSecurityPin();
    subscribeToChats();
  });
});

// ==================== 1. PERSONALIZATION & SECURITY PIN LOADERS ====================
async function loadUserPersonalization() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "settings", "personalization"));
    if (snap.exists()) {
      userMemory = snap.data().memory || "";
      customSystemPrompt = snap.data().customPrompt || "";
    }
    document.getElementById("settings-memory-input").value = userMemory;
    document.getElementById("settings-custom-prompt").value = customSystemPrompt;
  } catch (e) {
    console.warn("Personalization load warning:", e);
  }
}

async function loadSecurityPin() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid, "settings", "security"));
    securityPin = snap.exists() ? snap.data().pin || null : null;
    updatePinStatusUI();
  } catch (e) {
    console.warn("Security load warning:", e);
  }
}

function updatePinStatusUI() {
  const statusEl = document.getElementById("security-pin-status");
  if (statusEl) {
    statusEl.textContent = securityPin
      ? "Security PIN is active for Locked Chats & Hidden Vault."
      : "No PIN set yet. Set a PIN to lock or hide conversations.";
  }
}

// ==================== 2. SIDEBAR, SWIPE GESTURES & 5-SEC PROFILE HOLD ====================
function setupSidebarAndGestures() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");

  const openSidebar = () => {
    sidebar.classList.remove("-translate-x-full");
    backdrop.classList.remove("hidden");
  };

  const closeSidebar = () => {
    sidebar.classList.add("-translate-x-full");
    backdrop.classList.add("hidden");
  };

  document.getElementById("open-sidebar").onclick = openSidebar;
  document.getElementById("close-sidebar").onclick = closeSidebar;
  backdrop.onclick = closeSidebar;

  // Touch Swipe Right to Open / Swipe Left to Close
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!currentUser || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);

    if (dy < 60) {
      if (dx > 75 && touchStartX < 90) {
        openSidebar();
      } else if (dx < -75 && !sidebar.classList.contains("-translate-x-full")) {
        closeSidebar();
      }
    }
  }, { passive: true });

  // Search Chats
  document.getElementById("chat-search-input").oninput = () => renderChatList();

  // New Chat
  document.getElementById("new-chat-btn").onclick = () => {
    startNewChat();
    closeSidebar();
  };

  // Profile Button: Quick Tap = Settings | 5-Second Long Press = Hidden Vault
  const profileBtn = document.getElementById("profile-hold-btn");
  let holdTimer = null;
  let longPressTriggered = false;

  const startHold = (e) => {
    if (e.type === "mousedown" && e.button !== 0) return;
    longPressTriggered = false;
    profileBtn.classList.add("holding");

    holdTimer = setTimeout(() => {
      longPressTriggered = true;
      profileBtn.classList.remove("holding");
      closeSidebar();
      openHiddenVaultFlow();
    }, 5000);
  };

  const cancelHold = () => {
    clearTimeout(holdTimer);
    profileBtn.classList.remove("holding");
  };

  profileBtn.addEventListener("touchstart", startHold, { passive: true });
  profileBtn.addEventListener("touchend", cancelHold);
  profileBtn.addEventListener("touchcancel", cancelHold);
  profileBtn.addEventListener("mousedown", startHold);
  profileBtn.addEventListener("mouseup", cancelHold);
  profileBtn.addEventListener("mouseleave", cancelHold);

  profileBtn.onclick = () => {
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
    closeSidebar();
    document.getElementById("settings-modal").classList.remove("hidden");
  };

  // Close context menus when clicking anywhere else
  document.addEventListener("click", (e) => {
    const ctx = document.getElementById("chat-context-menu");
    const vctx = document.getElementById("vault-context-menu");
    if (!ctx.contains(e.target)) ctx.classList.add("hidden");
    if (!vctx.contains(e.target)) vctx.classList.add("hidden");
  });
}

// ==================== 3. CHAT LIST, PIN, LOCK, HIDE & HIDDEN VAULT ====================
function subscribeToChats() {
  const q = query(collection(db, "users", currentUser.uid, "chats"), orderBy("updatedAt", "desc"));
  onSnapshot(q, (snapshot) => {
    allChats = [];
    snapshot.forEach((d) => {
      allChats.push({ id: d.id, ...d.data() });
    });
    renderChatList();
    renderVaultList();
  });
}

function renderChatList() {
  const listEl = document.getElementById("chat-list");
  const searchTerm = document.getElementById("chat-search-input").value.trim().toLowerCase();
  listEl.innerHTML = "";

  // Filter out hidden chats and apply search
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
    item.className = `chat-item group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs cursor-pointer ${
      isActive ? "chat-item-active" : "text-slate-400 hover:bg-slate-900/90 hover:text-slate-200 border border-transparent"
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

// Context Menu Actions
document.getElementById("ctx-pin-btn").onclick = async () => {
  if (!targetContextChat) return;
  await updateDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id), {
    pinned: !targetContextChat.pinned
  });
};

document.getElementById("ctx-rename-btn").onclick = async () => {
  if (!targetContextChat) return;
  const newTitle = prompt("Rename conversation:", targetContextChat.title || "");
  if (newTitle && newTitle.trim()) {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id), {
      title: newTitle.trim()
    });
  }
};

document.getElementById("ctx-lock-btn").onclick = () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const mode = securityPin ? "verify" : "setup";
  openPinModal(mode, async () => {
    const nextLocked = !chat.locked;
    await updateDoc(doc(db, "users", currentUser.uid, "chats", chat.id), {
      locked: nextLocked
    });
    if (!nextLocked) unlockedChatsSession.add(chat.id);
  });
};

document.getElementById("ctx-hide-btn").onclick = () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const mode = securityPin ? "verify" : "setup";
  openPinModal(mode, async () => {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", chat.id), {
      hidden: true
    });
    if (currentChatId === chat.id) startNewChat();
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
  if (confirm(`Delete "${targetContextChat.title}" permanently?`)) {
    await deleteDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id));
    if (currentChatId === targetContextChat.id) startNewChat();
  }
};

// Hidden Vault Flow (Triggered by 5-Second Long Press on Profile Icon)
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
    row.className = "flex items-center justify-between px-3.5 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-purple-500/40 text-xs text-white cursor-pointer select-none transition";
    row.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <i class="fa-solid fa-eye-slash text-purple-400"></i>
        <span class="truncate font-medium">${escapeHtml(chat.title || "Hidden Chat")}</span>
      </div>
      <span class="text-[10px] text-slate-500">Hold for options</span>
    `;

    // Tap to Open Hidden Chat
    let vHoldTimer = null;
    let vLongPressed = false;

    const startVHold = (e) => {
      vLongPressed = false;
      vHoldTimer = setTimeout(() => {
        vLongPressed = true;
        openVaultContextMenu(e.touches ? e.touches[0] : e, chat);
      }, 600);
    };

    const endVHold = () => clearTimeout(vHoldTimer);

    row.addEventListener("touchstart", startVHold, { passive: true });
    row.addEventListener("touchend", endVHold);
    row.addEventListener("mousedown", startVHold);
    row.addEventListener("mouseup", endVHold);

    row.onclick = () => {
      if (vLongPressed) return;
      document.getElementById("vault-modal").classList.add("hidden");
      loadChatMessages(chat.id);
    };

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
};

document.getElementById("vctx-rename-btn").onclick = async () => {
  if (!targetContextChat) return;
  const name = prompt("Rename hidden chat:", targetContextChat.title || "");
  if (name && name.trim()) {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id), { title: name.trim() });
  }
};

document.getElementById("vctx-delete-btn").onclick = async () => {
  if (!targetContextChat) return;
  if (confirm("Delete this hidden chat permanently?")) {
    await deleteDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id));
    if (currentChatId === targetContextChat.id) startNewChat();
  }
};

document.getElementById("close-vault-btn").onclick = () => {
  document.getElementById("vault-modal").classList.add("hidden");
};

// ==================== 4. UNIFIED PIN MODAL (Setup, Verify, Change, Forgot) ====================
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
    alert("Security PIN updated successfully!");
  } else {
    if (pin !== securityPin) return fail("Incorrect PIN. Try again.");
    document.getElementById("pin-modal").classList.add("hidden");
    if (pinCallback) pinCallback();
  }
};

document.getElementById("forgot-pin-trigger-btn").onclick = () => {
  document.getElementById("pin-modal").classList.add("hidden");
  openForgotPinVerification(() => {
    openPinModal("setup", () => {
      alert("New Security PIN set!");
    });
  });
};

// ==================== 5. MESSAGES VIEWPORT, EDIT, COPY, REGENERATE & LISTEN ====================
let unsubscribeMsgs = null;

function startNewChat() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  currentChatId = null;
  currentMessages = [];
  renderChatList();

  const box = document.getElementById("messages-box");
  box.innerHTML = `
    <div id="welcome-hero" class="max-w-xl mx-auto my-8 text-center space-y-5">
      <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-blue-600/25 to-cyan-400/25 border border-cyan-500/30 flex items-center justify-center text-3xl text-cyan-400 shadow-lg">
        <i class="fa-solid fa-sparkles"></i>
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
    if (isStreaming) return; // Avoid re-render collision during active SSE stream
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
    avatar.className = "w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white text-xs shrink-0 mt-1 shadow";
    avatar.innerHTML = `<i class="fa-solid fa-sparkles"></i>`;
    row.appendChild(avatar);
  }

  const col = document.createElement("div");
  col.className = `flex flex-col ${isUser ? "items-end max-w-[84%]" : "items-start flex-1 min-w-0"}`;

  const bubble = document.createElement("div");
  bubble.className = isUser
    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md text-sm"
    : "w-full glass-panel rounded-2xl rounded-tl-sm px-4 py-3.5";

  // Attachment badge if present
  if (msg.attachmentName) {
    const badge = document.createElement("div");
    badge.className = "mb-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/25 text-[11px] text-cyan-200";
    badge.innerHTML = `<i class="fa-solid fa-paperclip"></i><span>${escapeHtml(msg.attachmentName)}</span>`;
    bubble.appendChild(badge);
  }

  // Generated or Uploaded Image
  if (msg.imageUrl) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "mb-2.5 relative inline-block";
    imgWrap.innerHTML = `
      <img src="${msg.imageUrl}" class="max-w-xs sm:max-w-sm rounded-xl border border-slate-700/80 shadow-lg" />
      <button type="button" class="dl-img-btn mt-2 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-blue-600 border border-slate-700 text-white text-[11px] font-medium flex items-center gap-1.5 transition">
        <i class="fa-solid fa-download"></i> Download HD PNG
      </button>
    `;
    imgWrap.querySelector(".dl-img-btn").onclick = () => downloadImageHD(msg.imageUrl);
    bubble.appendChild(imgWrap);
  }

  // Message Text Body
  const bodyDiv = document.createElement("div");
  if (isUser) {
    bodyDiv.className = "whitespace-pre-wrap leading-relaxed";
    bodyDiv.textContent = msg.text;
  } else {
    bodyDiv.className = "prose-mindora";
    bodyDiv.innerHTML = marked.parse(msg.text || "");
    enhanceCodeBlocks(bodyDiv);
  }
  bubble.appendChild(bodyDiv);
  col.appendChild(bubble);

  // Action Chips (User: Edit & Copy | AI: Regenerate, Listen, Copy)
  const actions = document.createElement("div");
  actions.className = "msg-actions";

  if (isUser) {
    // Copy User Prompt
    const copyBtn = createActionChip("fa-regular fa-copy", "Copy", () => {
      navigator.clipboard.writeText(msg.text);
      copyBtn.querySelector("span").textContent = "Copied";
      setTimeout(() => (copyBtn.querySelector("span").textContent = "Copy"), 1400);
    });

    // Edit & Re-send User Prompt
    const editBtn = createActionChip("fa-solid fa-pen", "Edit", () => {
      startInlineEdit(bubble, bodyDiv, msg, index);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
  } else {
    // Regenerate AI Reply
    const regenBtn = createActionChip("fa-solid fa-rotate-right", "Regenerate", () => {
      regenerateFromIndex(index);
    });

    // Listen (Auto-Language TTS)
    const listenBtn = createActionChip("fa-solid fa-volume-high", "Listen", () => {
      toggleSpeakMessage(msg.text, listenBtn);
    });

    // Copy AI Reply
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

// Inline Edit User Message & Re-Send
function startInlineEdit(bubble, bodyDiv, msg, index) {
  const originalText = msg.text;
  bubble.innerHTML = `
    <textarea class="w-full min-w-[220px] sm:min-w-[340px] bg-slate-950/90 text-white text-xs p-2.5 rounded-xl border border-cyan-400/50 focus:outline-none resize-none" rows="3">${escapeHtml(originalText)}</textarea>
    <div class="flex justify-end gap-2 mt-2">
      <button type="button" class="cancel-edit px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px]">Cancel</button>
      <button type="button" class="save-edit px-3 py-1 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-[11px]">Save & Send</button>
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

    // Delete this message and all subsequent messages from Firestore
    const toDelete = currentMessages.slice(index);
    const batch = writeBatch(db);
    toDelete.forEach((m) => {
      if (m.id) batch.delete(doc(db, "users", currentUser.uid, "chats", currentChatId, "messages", m.id));
    });
    await batch.commit();

    // Send updated prompt
    await sendPromptPipeline(updatedText);
  };
}

// Regenerate AI Reply
async function regenerateFromIndex(aiMsgIndex) {
  if (isStreaming || !currentChatId) return;
  const prevUserMsg = currentMessages[aiMsgIndex - 1];
  if (!prevUserMsg || prevUserMsg.role !== "user") return;

  // Delete the AI message (and anything after it)
  const toDelete = currentMessages.slice(aiMsgIndex);
  const batch = writeBatch(db);
  toDelete.forEach((m) => {
    if (m.id) batch.delete(doc(db, "users", currentUser.uid, "chats", currentChatId, "messages", m.id));
  });
  await batch.commit();

  // Trigger AI generation for the previous user prompt without duplicating user message
  await generateAIResponseOnly(prevUserMsg.text, null);
}

// Auto-Detect Script & Speak Message
function detectSpeechLang(text) {
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0600-\u06FF]/.test(text)) return "ar-SA";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  return "en-IN";
}

function toggleSpeakMessage(text, btnEl) {
  if (!window.speechSynthesis) return;

  if (activeSpeechBtn === btnEl && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btnEl.classList.remove("speaking-active");
    activeSpeechBtn = null;
    return;
  }

  window.speechSynthesis.cancel();
  if (activeSpeechBtn) activeSpeechBtn.classList.remove("speaking-active");

  const clean = text.replace(/```[\s\S]*?```/g, " Code block omitted. ").replace(/[*#`_~>]/g, "");
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = detectSpeechLang(clean);

  btnEl.classList.add("speaking-active");
  activeSpeechBtn = btnEl;

  utter.onend = () => {
    btnEl.classList.remove("speaking-active");
    activeSpeechBtn = null;
  };
  window.speechSynthesis.speak(utter);
}

// Enhance Code Blocks with Copy + Live Run Preview
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
      <span class="font-mono font-semibold text-cyan-400">${escapeHtml(langName)}</span>
      <div class="flex items-center gap-2">
        ${isPreviewable ? `<button type="button" class="run-preview-btn px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition"><i class="fa-solid fa-play mr-1"></i>Run Preview</button>` : ""}
        <button type="button" class="copy-code-btn px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"><i class="fa-regular fa-copy mr-1"></i>Copy</button>
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

// Direct High-Quality Image Download
async function downloadImageHD(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `MinDora_AI_${Date.now()}.png`;
    a.click();
  } catch (e) {
    window.open(url, "_blank");
  }
}

// ==================== 6. INPUT BAR, FILE UPLOAD (NO VIDEO) & SEND/STOP ====================
function setupChatInputAndTools() {
  const input = document.getElementById("chat-input");
  const sendStopBtn = document.getElementById("send-stop-btn");

  // Auto-resize textarea
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

  // Send / Stop Toggle Button
  sendStopBtn.onclick = () => {
    if (isStreaming && streamAbortController) {
      streamAbortController.abort();
      setStreamingState(false);
    } else {
      sendPromptPipeline();
    }
  };

  // Quick Prompt Cards
  document.querySelectorAll(".quick-prompt").forEach((btn) => {
    btn.onclick = () => sendPromptPipeline(btn.dataset.prompt);
  });

  // 1-Tap Quick Mode Pills
  document.querySelectorAll(".mode-pill").forEach((pill) => {
    pill.onclick = () => {
      activeMode = pill.dataset.mode;
      document.querySelectorAll(".mode-pill").forEach((p) => {
        p.className = "mode-pill px-3 py-1 rounded-full text-[11px] font-medium bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white transition";
      });
      pill.className = "mode-pill px-3 py-1 rounded-full text-[11px] font-medium bg-blue-600/20 text-cyan-300 border border-blue-500/40 transition";
    };
  });

  // File Upload (Blocks Video Strictly)
  document.getElementById("file-input").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      alert("Video files are not supported. Please upload images, PDFs, audio, or code/text files.");
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
      document.getElementById("attachment-type").textContent = isImage ? "Image attached" : "File ready for analysis";
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

    if (isBinaryMultimodal) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  document.getElementById("clear-attachment-btn").onclick = clearAttachment;

  // Magic Prompt Enhancer
  document.getElementById("enhance-prompt-btn").onclick = async () => {
    const raw = input.value.trim();
    if (!raw || isStreaming) return;
    const btn = document.getElementById("enhance-prompt-btn");
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i>`;
    try {
      const enhanced = await callGeminiSingleShot(
        `Rewrite and expand this user prompt to be clearer, richer, and more effective for an AI assistant. Return ONLY the improved prompt text, nothing else:\n\n"${raw}"`
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

// ==================== 7. FAST STREAMING AI PIPELINE ====================
async function sendPromptPipeline(overrideText = null, liveVoiceCallback = null) {
  const input = document.getElementById("chat-input");
  const rawText = (overrideText !== null ? overrideText : input.value).trim();
  if (!rawText && !attachedFile) return;

  input.value = "";
  input.style.height = "auto";

  const filePayload = attachedFile;
  clearAttachment();

  // Create new chat thread in Firestore if needed
  if (!currentChatId) {
    const newChatRef = await addDoc(collection(db, "users", currentUser.uid, "chats"), {
      title: (rawText || filePayload?.name || "New Chat").slice(0, 38),
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

  const displayUserText = rawText || `Analyze attached file: ${filePayload.name}`;
  const userMsgObj = {
    role: "user",
    text: displayUserText,
    attachmentName: filePayload ? filePayload.name : null,
    imageUrl: filePayload?.isImage ? `data:${filePayload.mime};base64,${filePayload.base64}` : null,
    createdAt: serverTimestamp()
  };

  // Remove welcome hero & render user bubble immediately
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

  // Handle /imagine Image Generation
  if (rawText.toLowerCase().startsWith("/imagine ")) {
    const prompt = rawText.slice(9).trim();
    await triggerImageGeneration(prompt, "1024x1024");
    return;
  }

  // Auto-Memory Capture
  autoCaptureMemory(displayUserText);

  await generateAIResponseOnly(displayUserText, filePayload, liveVoiceCallback);
}

async function generateAIResponseOnly(promptText, filePayload, liveVoiceCallback = null) {
  const box = document.getElementById("messages-box");

  // Create Live Streaming AI Bubble
  const aiRow = document.createElement("div");
  aiRow.className = "flex gap-3 max-w-3xl mx-auto justify-start";
  aiRow.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white text-xs shrink-0 mt-1 shadow">
      <i class="fa-solid fa-sparkles"></i>
    </div>
    <div class="flex-1 min-w-0 glass-panel rounded-2xl rounded-tl-sm px-4 py-3.5">
      <div class="prose-mindora streaming-cursor"></div>
    </div>
  `;
  const textTarget = aiRow.querySelector(".prose-mindora");
  box.appendChild(aiRow);
  box.scrollTop = box.scrollHeight;

  setStreamingState(true);
  streamAbortController = new AbortController();

  const modelKey = document.getElementById("model-select").value;
  const modelChain = MINDORA_MODELS[modelKey]?.chain || MINDORA_MODELS.auto.chain;
  const modePrompt = QUICK_MODES[activeMode]?.instruction || "";

  const fullSystemInstruction = `You are MinDora AI, an intelligent, fast, and helpful AI assistant. Respond naturally in the exact language the user writes or speaks in.
Mode Behavior: ${modePrompt}
User Profile: Name is ${currentProfile?.fullName || "User"}, Age ${currentProfile?.age || "N/A"}, Gender ${currentProfile?.gender || "N/A"}.
Saved Memory: ${userMemory || "None yet."}
Custom User Instructions: ${customSystemPrompt || "None."}`;

  let finalUserPrompt = promptText;
  if (filePayload?.textContent) {
    finalUserPrompt += `\n\n--- Attached File (${filePayload.name}) ---\n${filePayload.textContent.slice(0, 25000)}`;
  }

  const userParts = [{ text: finalUserPrompt }];
  if (filePayload?.base64) {
    userParts.push({ inline_data: { mime_type: filePayload.mime, data: filePayload.base64 } });
  }

  const historyContents = currentMessages.slice(-8).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }]
  }));

  const payload = {
    system_instruction: { parts: [{ text: fullSystemInstruction }] },
    contents: [...historyContents, { role: "user", parts: userParts }]
  };

  let accumulatedText = "";
  let succeeded = false;

  for (const modelName of modelChain) {
    if (streamAbortController.signal.aborted) break;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": getApiKey()
        },
        body: JSON.stringify(payload),
        signal: streamAbortController.signal
      });

      if (!response.ok) continue;

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
              if (chunk) {
                accumulatedText += chunk;
                textTarget.innerHTML = marked.parse(accumulatedText);
                box.scrollTop = box.scrollHeight;
              }
            } catch (e) {}
          }
        }
      }

      if (accumulatedText) {
        succeeded = true;
        break;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        succeeded = true;
        break;
      }
    }
  }

  textTarget.classList.remove("streaming-cursor");
  setStreamingState(false);

  if (!succeeded && !accumulatedText) {
    accumulatedText = "Connection interrupted or quota reached. Please try again or check your API key in Settings.";
    textTarget.innerHTML = marked.parse(accumulatedText);
  }

  // Persist AI Reply to Firestore (which refreshes UI with action buttons)
  await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
    role: "model",
    text: accumulatedText,
    createdAt: serverTimestamp()
  });

  // Reload chat snapshot cleanly
  loadChatMessages(currentChatId);

  if (liveVoiceCallback) liveVoiceCallback(accumulatedText);
}

async function callGeminiSingleShot(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`;
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
      document.getElementById("settings-memory-input").value = userMemory;
      await setDoc(doc(db, "users", currentUser.uid, "settings", "personalization"), { memory: userMemory }, { merge: true });
    }
  }
}

// ==================== 8. DEDICATED HD IMAGE STUDIO ====================
async function triggerImageGeneration(prompt, ratio = "1024x1024") {
  const [w, h] = ratio.split("x");
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&seed=${Date.now()}`;
  const caption = `Generated HD artwork for: **"${prompt}"**`;

  await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
    role: "model",
    text: caption,
    imageUrl,
    createdAt: serverTimestamp()
  });

  loadChatMessages(currentChatId);
}

// ==================== 9. MODALS, SETTINGS TABS & LANGUAGE SWITCHER ====================
function setupModalsAndSettings() {
  // Close Settings
  document.getElementById("close-settings-btn").onclick = () => {
    document.getElementById("settings-modal").classList.add("hidden");
  };

  // Switch Settings Tabs
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
    };
  });

  // Save Personalization (Memory + Custom System Prompt)
  document.getElementById("save-personalization-btn").onclick = async () => {
    userMemory = document.getElementById("settings-memory-input").value.trim();
    customSystemPrompt = document.getElementById("settings-custom-prompt").value.trim();

    await setDoc(
      doc(db, "users", currentUser.uid, "settings", "personalization"),
      { memory: userMemory, customPrompt: customSystemPrompt },
      { merge: true }
    );

    const btn = document.getElementById("save-personalization-btn");
    btn.textContent = "Saved!";
    setTimeout(() => (btn.textContent = t("save_changes")), 1400);
  };

  // Security PIN Actions inside Settings
  document.getElementById("open-change-pin-btn").onclick = () => {
    openPinModal(securityPin ? "change" : "setup", () => {
      updatePinStatusUI();
    });
  };

  document.getElementById("open-forgot-pin-btn").onclick = () => {
    openForgotPinVerification(() => {
      openPinModal("setup", () => {
        updatePinStatusUI();
        alert("New Security PIN saved!");
      });
    });
  };

  // Dedicated Imagine Modal
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

  // Live Code Preview Close
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
        : "bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700"
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

// ==================== 10. AUTO-LANGUAGE LIVE VOICE & DICTATION ENGINE ====================
function setupLiveVoiceEngine() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  const orb = document.getElementById("live-orb");
  const statusText = document.getElementById("live-status-text");

  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (isLiveActive) {
        statusText.textContent = `"${transcript}"`;
        sendPromptPipeline(transcript, (aiReply) => {
          speakInLiveMode(aiReply, recognition);
        });
      } else {
        const input = document.getElementById("chat-input");
        input.value = (input.value + " " + transcript).trim();
        input.focus();
      }
    };

    recognition.onend = () => {
      if (isLiveActive && !isLiveMuted && !window.speechSynthesis.speaking) {
        try {
          recognition.start();
        } catch (e) {}
      }
    };
  }

  function speakInLiveMode(text, rec) {
    if (!isLiveSpeakerOn || !window.speechSynthesis) {
      if (isLiveActive && !isLiveMuted && rec) {
        statusText.textContent = "Listening...";
        try { rec.start(); } catch (e) {}
      }
      return;
    }

    window.speechSynthesis.cancel();
    const clean = text.replace(/```[\s\S]*?```/g, " Code ready on screen. ").replace(/[*#`_~>]/g, "");
    const utter = new SpeechSynthesisUtterance(clean);
    const style = VOICE_STYLES[voiceStyleIndex];

    utter.lang = detectSpeechLang(clean);
    utter.pitch = style.pitch;
    utter.rate = style.rate;

    orb.classList.add("speaking");
    utter.onend = () => {
      orb.classList.remove("speaking");
      if (isLiveActive && !isLiveMuted && rec) {
        statusText.textContent = "Listening... Go ahead.";
        try { rec.start(); } catch (e) {}
      }
    };
    window.speechSynthesis.speak(utter);
  }

  // Single-tap Mic Dictation next to Send Button
  document.getElementById("mic-btn").onclick = () => {
    if (!recognition) return alert("Voice recognition is not supported on this browser.");
    recognition.start();
  };

  // Open Full-Screen Live Talk
  document.getElementById("live-talk-btn").onclick = () => {
    if (!recognition) return alert("Live Voice is not supported on this browser.");
    isLiveActive = true;
    isLiveMuted = false;
    orb.classList.remove("muted");
    document.getElementById("live-mute-icon").className = "fa-solid fa-microphone";
    document.getElementById("live-overlay").classList.remove("hidden");
    statusText.textContent = "Listening... Speak in any language.";
    try { recognition.start(); } catch (e) {}
  };

  // Mute Toggle
  document.getElementById("live-mute-btn").onclick = () => {
    isLiveMuted = !isLiveMuted;
    const icon = document.getElementById("live-mute-icon");
    if (isLiveMuted) {
      orb.classList.add("muted");
      icon.className = "fa-solid fa-microphone-slash text-red-400";
      statusText.textContent = "Microphone Muted";
      if (recognition) recognition.stop();
    } else {
      orb.classList.remove("muted");
      icon.className = "fa-solid fa-microphone";
      statusText.textContent = "Listening...";
      if (recognition) try { recognition.start(); } catch (e) {}
    }
  };

  // Speaker Toggle
  document.getElementById("live-speaker-btn").onclick = () => {
    isLiveSpeakerOn = !isLiveSpeakerOn;
    const icon = document.getElementById("live-speaker-icon");
    if (isLiveSpeakerOn) {
      icon.className = "fa-solid fa-volume-high text-cyan-400";
    } else {
      window.speechSynthesis.cancel();
      orb.classList.remove("speaking");
      icon.className = "fa-solid fa-volume-xmark text-slate-500";
    }
  };

  // Voice Style Changer (Natural -> Soft -> Deep -> Fast)
  document.getElementById("live-voice-style-btn").onclick = () => {
    voiceStyleIndex = (voiceStyleIndex + 1) % VOICE_STYLES.length;
    document.getElementById("live-voice-label").textContent = VOICE_STYLES[voiceStyleIndex].name;
  };

  // Close Live Session
  document.getElementById("close-live-btn").onclick = () => {
    isLiveActive = false;
    window.speechSynthesis.cancel();
    orb.classList.remove("speaking");
    if (recognition) recognition.stop();
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
