// config.js — Core Configuration, Firebase Init & Secure Apps Script Proxy
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAQSNDMA1JLHll5mMjSwXDSa0cAmjw8Bo4",
  authDomain: "my-website-login-10b06.firebaseapp.com",
  projectId: "my-website-login-10b06",
  storageBucket: "my-website-login-10b06.firebasestorage.app",
  messagingSenderId: "1058420080529",
  appId: "1:1058420080529:web:1440b3f78f8853268b2430",
  measurementId: "G-WCV8VCP27D"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Secure Google Apps Script Proxy (Hides your Gemini API Key safely)
export const PROXY_URL = "https://script.google.com/macros/s/AKfycbyJtouDUtiyK0OaKXdkgnfU0pp-nnyhY_UlnpU9wn1al-9okxqj6sGEBSDBz6rbP7Qi/exec";

export function getApiKey() {
  return localStorage.getItem("mindora_api_key") || "";
}

export function setApiKey(newKey) {
  if (newKey && newKey.trim()) {
    localStorage.setItem("mindora_api_key", newKey.trim());
  }
}

export const MINDORA_MODELS = {
  auto: {
    label: "MinDora Auto",
    chain: ["gemini-flash-latest", "gemini-3.8-flash"],
    styleHint: ""
  },
  "mindora-1": {
    label: "MinDora 1",
    chain: ["gemini-flash-lite-latest", "gemini-flash-latest"],
    styleHint: "Respond ultra-fast, concisely, and directly."
  },
  "mindora-2": {
    label: "MinDora 2",
    chain: ["gemini-3.8-flash", "gemini-flash-latest"],
    styleHint: "Provide thorough, well-structured, high-precision reasoning and code."
  },
  "mindora-3": {
    label: "MinDora 3",
    chain: ["gemini-pro-latest", "gemini-3.8-flash", "gemini-flash-latest"],
    styleHint: "Use deep analytical reasoning with clear step-by-step structure."
  }
};

export const STUDIO_VOICES = [
  { id: "Zephyr", label: "Zephyr • Warm" },
  { id: "Kore", label: "Kore • Clear" },
  { id: "Puck", label: "Puck • Energetic" },
  { id: "Fenrir", label: "Fenrir • Deep" },
  { id: "Aoede", label: "Aoede • Expressive" }
];

export const QUICK_MODES = {
  default: {
    label: "Default",
    instruction: "Be helpful, clear, natural, and concise."
  },
  coder: {
    label: "Coder",
    instruction: "Act as a senior software engineer. Provide clean, production-ready, well-structured code with brief explanations."
  },
  study: {
    label: "Study",
    instruction: "Act as a friendly tutor. Break down complex concepts step-by-step with simple examples."
  },
  creative: {
    label: "Creative",
    instruction: "Be imaginative, expressive, and original in brainstorming, writing, and visual prompt ideas."
  }
};
