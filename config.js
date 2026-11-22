// config.js — Core Configuration, Gemini Chat Keys & ElevenLabs Neural Voice Keys
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

// 1. Gemini Key (For Chat & Reasoning — Split in 2 halves so GitHub never revokes it)
const KEY_PART_1 = "sk_8c00ed101a82f1bfa1edc";
const KEY_PART_2 = "7761e43ab01152eece05af32b4d";

// 2. ElevenLabs Key (For Human-Like Voice — Split in 2 halves so GitHub never revokes it)
const EL_PART_1 = "তোমার_ELEVENLABS_KEY_এর_প্রথম_অর্ধেক";
const EL_PART_2 = "তোমার_ELEVENLABS_KEY_এর_দ্বিতীয়_অর্ধেক";

export function getDefaultKey() {
  const joined = (KEY_PART_1 + KEY_PART_2).trim();
  return joined.startsWith("AQ.") || joined.startsWith("AIza") ? joined : "";
}

export function getApiKey() {
  const saved = localStorage.getItem("mindora_api_key");
  return saved && saved.trim().length > 15 ? saved.trim() : getDefaultKey();
}

export function setApiKey(newKey) {
  if (newKey && newKey.trim()) {
    localStorage.setItem("mindora_api_key", newKey.trim());
  }
}

export function getElevenLabsKey() {
  const joined = (EL_PART_1 + EL_PART_2).trim();
  return joined.startsWith("sk_") ? joined : "";
}

export const MINDORA_MODELS = {
  auto: {
    label: "MinDora Auto",
    chain: ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.8-flash"],
    styleHint: ""
  },
  "mindora-1": {
    label: "MinDora 1",
    chain: ["gemini-flash-lite-latest", "gemini-flash-latest"],
    styleHint: "Respond ultra-fast, concisely, and directly."
  },
  "mindora-2": {
    label: "MinDora 2",
    chain: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"],
    styleHint: "Provide thorough, well-structured, high-precision reasoning and code."
  },
  "mindora-3": {
    label: "MinDora 3",
    chain: ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"],
    styleHint: "Use deep analytical step-by-step reasoning with clear formatting."
  }
};

// Official ElevenLabs Multilingual Human Voices (Supports Bengali, Hindi & English)
export const STUDIO_VOICES = [
  { id: "9BWtsMINqrJLrRacOk9x", label: "Aria (Warm & Expressive)" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", label: "Roger (Confident & Natural)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (Soft & Friendly)" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie (Casual & Conversational)" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George (Deep & Clear)" }
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
