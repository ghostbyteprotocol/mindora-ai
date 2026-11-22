// app.js — MinDora AI Core Engine (Complete Clean Build)
import { db, getApiKey, MINDORA_MODELS, STUDIO_VOICES, QUICK_MODES } from "./config.js";
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

let attachedFile = null;
let isStreaming = false;
let streamAbortController = null;
let activeAudioPlayer = null;
let activeAudioBtn = null;

let targetContextChat = null;
let unlockedChatsSession = new Set();

let isLiveActive = false;
let isLiveMuted = false;
let isLiveSpeakerOn = true;
let studioVoiceIndex = 0;

if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

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

// ==================== 2. SIDEBAR, SWIPE GESTURES & 5-SEC HOLD ====================
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
  }

  document.addEventListener("click", (e) => {
    const ctx = document.getElementById("chat-context-menu");
    const vctx = document.getElementById("vault-context-menu");
    if (ctx && !ctx.contains(e.target)) ctx.classList.add("hidden");
    if (vctx && !vctx.contains(e.target)) vctx.classList.add("hidden");
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
  const newTitle = prompt("Rename conversation:", targetContextChat.title || "");
  if (newTitle && newTitle.trim()) {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", targetContextChat.id), { title: newTitle.trim() });
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
  });
};

document.getElementById("ctx-hide-btn").onclick = () => {
  if (!targetContextChat) return;
  const chat = targetContextChat;
  const mode = securityPin ? "verify" : "setup";
  openPinModal(mode, async () => {
    await updateDoc(doc(db, "users", currentUser.uid, "chats", chat.id), { hidden: true });
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
    row.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <i class="fa-solid fa-eye-slash text-purple-400"></i>
        <span class="truncate font-medium">${escapeHtml(chat.title || "Hidden Chat")}</span>
      </div>
      <span class="text-[10px] text-slate-500">Hold for options</span>
    `;

    let vHoldTimer = null;
    let vLongPressed = false;

    const startVHold = (e) => {
      vLongPressed = false;
      vHoldTimer = setTimeout(() => {
        vLongPressed = true;
        openVaultContextMenu(e.touches ? e.touches[0] : e, chat);
      }, 550);
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
    openPinModal("setup", () => alert("New Security PIN set!"));
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

// ==================== 6. NEURAL STUDIO VOICE ENGINE ====================
function stopCurrentSpeech() {
  if (activeAudioPlayer) {
    activeAudioPlayer.pause();
    activeAudioPlayer = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (activeAudioBtn) {
    activeAudioBtn.classList.remove("speaking-active");
    activeAudioBtn.querySelector("span").textContent = "Listen";
    activeAudioBtn = null;
  }
}

function pcmBase64ToWavUrl(base64Pcm, sampleRate = 24000) {
  const binaryStr = atob(base64Pcm);
  const pcmLength = binaryStr.length;
  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcmLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcmLength, true);

  const bytes = new Uint8Array(wavBuffer, 44);
  for (let i = 0; i < pcmLength; i++) bytes[i] = binaryStr.charCodeAt(i);

  return URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
}

async function fetchGeminiNeuralAudioUrl(text, voiceName) {
  const cleanSpeechText = text
    .replace(/```[\s\S]*?```/g, " Code block is shown on screen. ")
    .replace(/\$\$[\s\S]*?\$\$/g, " equation ")
    .replace(/\$/g, "")
    .replace(/[*#`_~>]/g, "")
    .trim()
    .slice(0, 1500);

  if (!cleanSpeechText) return null;

  const ttsModels = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
  for (const model of ttsModels) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": getApiKey()
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: cleanSpeechText }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } }
            }
          }
        })
      });

      const data = await res.json();
      const inlineData = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (inlineData?.data) {
        return pcmBase64ToWavUrl(inlineData.data, 24000);
      }
    } catch (e) {}
  }
  return null;
}

function getBestHumanBrowserVoice(langCode) {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  const prefix = langCode.split("-")[0];
  return (
    voices.find((v) => v.lang.startsWith(prefix) && /google|natural|online|neural/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith(prefix)) ||
    null
  );
}

function detectFallbackLang(text) {
  if (/[\u0980-\u09FF]/.test(text)) return "bn-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0600-\u06FF]/.test(text)) return "ar-SA";
  return "en-IN";
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

  const voiceName = STUDIO_VOICES[studioVoiceIndex]?.id || "Zephyr";
  const wavUrl = await fetchGeminiNeuralAudioUrl(text, voiceName);

  if (activeAudioBtn !== btnEl) return;

  if (wavUrl) {
    btnEl.querySelector("span").textContent = "Stop";
    const audio = new Audio(wavUrl);
    activeAudioPlayer = audio;
    audio.onended = () => stopCurrentSpeech();
    audio.onerror = () => stopCurrentSpeech();
    audio.play();
  } else if (window.speechSynthesis) {
    btnEl.querySelector("span").textContent = "Stop";
    const clean = text.replace(/```[\s\S]*?```/g, "").replace(/[*#`_~>$]/g, "");
    const utter = new SpeechSynthesisUtterance(clean);
    const langCode = detectFallbackLang(clean);
    utter.lang = langCode;
    const bestVoice = getBestHumanBrowserVoice(langCode);
    if (bestVoice) utter.voice = bestVoice;
    utter.onend = () => stopCurrentSpeech();
    window.speechSynthesis.speak(utter);
  } else {
    stopCurrentSpeech();
  }
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
      alert("Video files are not allowed. Upload images, PDFs, audio, or code/text files.");
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

// ==================== 8. SMOOTH TYPEWRITER STREAMING & MULTI-MODEL FALLBACK ====================
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
  if (!rawText && !attachedFile) return;

  input.value = "";
  input.style.height = "auto";

  const filePayload = attachedFile;
  clearAttachment();

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
    return;
  }

  autoCaptureMemory(displayUserText);
  await generateAIResponseOnly(displayUserText, filePayload, liveVoiceCallback);
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

  const systemGuide = `You are MinDora AI, a sharp, friendly, and intelligent personal AI assistant. Respond naturally in the exact language the user writes or speaks in.
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

  for (const modelName of modelSpec.chain) {
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
        finalReply = await animateTextStream(textTarget, rawReply, box, streamAbortController.signal);
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
    finalReply = `**Error:** ${lastApiError || "Unable to connect. Please check your API key in Settings."}`;
    textTarget.innerHTML = marked.parse(finalReply);
  }

  await addDoc(collection(db, "users", currentUser.uid, "chats", currentChatId, "messages"), {
    role: "model",
    text: finalReply,
    createdAt: serverTimestamp()
  });

  loadChatMessages(currentChatId);

  if (liveVoiceCallback && succeeded) liveVoiceCallback(finalReply);
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

// ==================== 9. HD IMAGE STUDIO ====================
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

// ==================== 10. MODALS, SETTINGS & LANGUAGE ====================
function setupModalsAndSettings() {
  document.getElementById("close-settings-btn").onclick = () => {
    document.getElementById("settings-modal").classList.add("hidden");
  };

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

  document.getElementById("open-change-pin-btn").onclick = () => {
    openPinModal(securityPin ? "change" : "setup", () => updatePinStatusUI());
  };

  document.getElementById("open-forgot-pin-btn").onclick = () => {
    openForgotPinVerification(() => {
      openPinModal("setup", () => {
        updatePinStatusUI();
        alert("New Security PIN saved!");
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

// ==================== 11. GEMINI LIVE PROFESSIONAL VOICE ENGINE (ZERO ECHO LOOP) ====================
function setupLiveVoiceEngine() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  const orb = document.getElementById("live-orb");
  const statusText = document.getElementById("live-status-text");
  const userCaption = document.getElementById("live-user-caption");
  const stateBadge = document.getElementById("live-state-badge");
  const stateDot = document.getElementById("live-state-dot");
  const interruptBtn = document.getElementById("live-interrupt-btn");
  const settingsVoiceSelect = document.getElementById("settings-voice-select");

  let liveAudioObj = null;
  let isAiSpeakingTurn = false;
  let isWaitingForAiReply = false;

  const savedVoiceIdx = parseInt(localStorage.getItem("mindora_voice_idx") || "0", 10);
  studioVoiceIndex = isNaN(savedVoiceIdx) ? 0 : savedVoiceIdx % STUDIO_VOICES.length;
  const voiceLabelEl = document.getElementById("live-voice-label");
  if (voiceLabelEl) voiceLabelEl.textContent = STUDIO_VOICES[studioVoiceIndex].label.split(" ")[0];

  if (settingsVoiceSelect) {
    settingsVoiceSelect.value = String(studioVoiceIndex);
    settingsVoiceSelect.onchange = () => {
      studioVoiceIndex = parseInt(settingsVoiceSelect.value, 10) || 0;
      localStorage.setItem("mindora_voice_idx", String(studioVoiceIndex));
      if (voiceLabelEl) voiceLabelEl.textContent = STUDIO_VOICES[studioVoiceIndex].label.split(" ")[0];
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

  function safeStartMic() {
    if (!recognition || !isLiveActive || isLiveMuted || isAiSpeakingTurn || isWaitingForAiReply) return;
    try {
      const lang = getCurrentLang();
      recognition.lang = lang === "bn" ? "bn-IN" : lang === "hi" ? "hi-IN" : "en-IN";
      recognition.start();
      setLiveTurnUI("listening");
    } catch (e) {}
  }

  function stopAllLiveAudio() {
    isAiSpeakingTurn = false;
    if (liveAudioObj) {
      liveAudioObj.pause();
      liveAudioObj.src = "";
      liveAudioObj = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  if (recognition) {
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      if (isAiSpeakingTurn || isWaitingForAiReply) return;

      let interim = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += txt;
        else interim += txt;
      }

      if (isLiveActive) {
        if (interim && userCaption) userCaption.textContent = `"${interim}..."`;
        if (finalTranscript.trim()) {
          isWaitingForAiReply = true;
          try { recognition.stop(); } catch (e) {}
          if (userCaption) userCaption.textContent = `You: "${finalTranscript.trim()}"`;
          if (statusText) statusText.textContent = "Thinking...";
          setLiveTurnUI("thinking");

          sendPromptPipeline(finalTranscript.trim(), (aiReply) => {
            isWaitingForAiReply = false;
            speakInLiveMode(aiReply);
          });
        }
      } else if (finalTranscript.trim()) {
        const input = document.getElementById("chat-input");
        input.value = (input.value + " " + finalTranscript).trim();
        input.focus();
      }
    };

    recognition.onerror = () => {
      if (isLiveActive && !isLiveMuted && !isAiSpeakingTurn && !isWaitingForAiReply) {
        setTimeout(safeStartMic, 450);
      }
    };

    recognition.onend = () => {
      if (isLiveActive && !isLiveMuted && !isAiSpeakingTurn && !isWaitingForAiReply) {
        setTimeout(safeStartMic, 350);
      }
    };
  }

  async function speakInLiveMode(text) {
    const finishSpeakingTurn = () => {
      isAiSpeakingTurn = false;
      if (!isLiveActive) return;
      if (isLiveMuted) {
        setLiveTurnUI("muted");
      } else {
        if (statusText) statusText.textContent = "Listening... Go ahead.";
        setTimeout(safeStartMic, 450);
      }
    };

    if (statusText) statusText.textContent = text.replace(/[*#`_~>$]/g, "").slice(0, 220);

    if (!isLiveSpeakerOn || !isLiveActive) {
      finishSpeakingTurn();
      return;
    }

    stopCurrentSpeech();
    stopAllLiveAudio();
    isAiSpeakingTurn = true;
    try { recognition.abort(); } catch (e) {}
    setLiveTurnUI("speaking");

    const voiceName = STUDIO_VOICES[studioVoiceIndex]?.id || "Zephyr";
    const wavUrl = await fetchGeminiNeuralAudioUrl(text, voiceName);

    if (!isLiveActive || !isLiveSpeakerOn || !isAiSpeakingTurn) {
      finishSpeakingTurn();
      return;
    }

    if (wavUrl) {
      liveAudioObj = new Audio(wavUrl);
      liveAudioObj.onended = () => {
        liveAudioObj = null;
        finishSpeakingTurn();
      };
      liveAudioObj.onerror = () => {
        liveAudioObj = null;
        finishSpeakingTurn();
      };
      liveAudioObj.play().catch(finishSpeakingTurn);
    } else if (window.speechSynthesis) {
      const clean = text.replace(/```[\s\S]*?```/g, "").replace(/[*#`_~>$]/g, "");
      const utter = new SpeechSynthesisUtterance(clean);
      const langCode = detectFallbackLang(clean);
      utter.lang = langCode;
      const bestVoice = getBestHumanBrowserVoice(langCode);
      if (bestVoice) utter.voice = bestVoice;
      utter.onend = finishSpeakingTurn;
      utter.onerror = finishSpeakingTurn;
      window.speechSynthesis.speak(utter);
    } else {
      finishSpeakingTurn();
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
    if (!recognition) return alert("Voice recognition is not supported on this browser.");
    recognition.start();
  };

  document.getElementById("live-talk-btn").onclick = () => {
    if (!recognition) return alert("Live Voice is not supported on this browser.");
    stopCurrentSpeech();
    stopAllLiveAudio();
    isLiveActive = true;
    isLiveMuted = false;
    isWaitingForAiReply = false;
    if (userCaption) userCaption.textContent = "";
    if (statusText) statusText.textContent = "Listening... Speak naturally.";
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
      try { recognition.abort(); } catch (e) {}
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
      icon.className = "fa-solid fa-volume-high text-cyan-400";
    } else {
      stopAllLiveAudio();
      icon.className = "fa-solid fa-volume-xmark text-slate-500";
      if (!isLiveMuted) safeStartMic();
    }
  };

  document.getElementById("live-voice-style-btn").onclick = () => {
    studioVoiceIndex = (studioVoiceIndex + 1) % STUDIO_VOICES.length;
    localStorage.setItem("mindora_voice_idx", String(studioVoiceIndex));
    if (voiceLabelEl) voiceLabelEl.textContent = STUDIO_VOICES[studioVoiceIndex].label.split(" ")[0];
    if (settingsVoiceSelect) settingsVoiceSelect.value = String(studioVoiceIndex);
  };

  document.getElementById("close-live-btn").onclick = () => {
    isLiveActive = false;
    isWaitingForAiReply = false;
    stopAllLiveAudio();
    orb.classList.remove("speaking", "muted");
    try { recognition.abort(); } catch (e) {}
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
