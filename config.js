// config.js — Core Configuration, Firebase Init & MinDora Model Engine
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase Configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAQSNDMA1JLHll5mMjSwXDSa0cAmjw8Bo4",
  authDomain: "my-website-login-10b06.firebaseapp.com",
  projectId: "my-website-login-10b06",
  storageBucket: "my-website-login-10b06.firebasestorage.app",
  messagingSenderId: "1058420080529",
  appId: "1:1058420080529:web:1440b3f78f8853268b2430",
  measurementId: "G-WCV8VCP27D"
};

// Initialize Firebase Services
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Default Pre-Configured Gemini Auth Key
const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6LrOs8jPFU2_CNyCh7WcpuoJQXeo-HNqa2CRRi2SByn6g";

export function getApiKey() {
  return localStorage.getItem("mindora_api_key") || DEFAULT_GEMINI_KEY;
}

export function setApiKey(newKey) {
  if (newKey && newKey.trim()) {
    localStorage.setItem("mindora_api_key", newKey.trim());
  }
}

// MinDora Model Mapping (Maps UI aliases to real Gemini models with smart fallbacks)
export const MINDORA_MODELS = {
  auto: {
    label: "MinDora Auto",
    badge: "Smart",
    desc: "Automatically picks the fastest & smartest model",
    chain: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"]
  },
  "mindora-1": {
    label: "MinDora 1",
    badge: "Lite • 3.5",
    desc: "Ultra-fast responses & highest daily free limit",
    chain: ["gemini-3.5-flash-lite", "gemini-flash-latest"]
  },
  "mindora-2": {
    label: "MinDora 2",
    badge: "Pro • 3.8",
    desc: "Next-gen multimodal reasoning, vision & coding",
    chain: ["gemini-3.8-flash", "gemini-flash-latest"]
  },
  "mindora-3": {
    label: "MinDora 3",
    badge: "Next • 4",
    desc: "Experimental Gemini 4 Hydrogen with auto-fallback",
    chain: ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-flash-latest"]
  }
};

// 1-Tap Quick Personality Modes
export const QUICK_MODES = {
  default: {
    label: "Default",
    icon: "fa-sparkles",
    instruction: "Be helpful, clear, natural, and concise."
  },
  coder: {
    label: "Coder",
    icon: "fa-code",
    instruction: "Act as a senior software engineer. Provide clean, production-ready, well-structured code with brief explanations."
  },
  study: {
    label: "Study",
    icon: "fa-graduation-cap",
    instruction: "Act as a friendly tutor. Break down complex concepts step-by-step with simple examples."
  },
  creative: {
    label: "Creative",
    icon: "fa-wand-magic-sparkles",
    instruction: "Be imaginative, expressive, and original in brainstorming, writing, and visual prompt ideas."
  }
};
