// lang.js — Multi-Language UI Dictionary & Dynamic Translator

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "ja", name: "Japanese", native: "日本語" }
];

const TRANSLATIONS = {
  en: {
    welcome_title: "Welcome to MinDora AI",
    welcome_sub: "Multimodal Intelligence • Encrypted Vault • Live Voice",
    continue_google: "Continue with Google",
    continue_apple: "Continue with Apple",
    tab_signin: "Sign In",
    tab_signup: "Sign Up",
    identifier_label: "Username or Email",
    password_label: "Password",
    forgot_password: "Forgot password?",
    signin_btn: "Sign In",
    fullname_label: "Full Name",
    username_label: "Username",
    email_label: "Email Address",
    signup_btn: "Create Account",
    verify_title: "Verify Your Email",
    verify_desc: "We sent a verification link to your inbox. Click the link, then tap below to continue.",
    ive_verified: "I've Verified My Email",
    resend_email: "Resend Link",
    onboard_title: "Complete Your Profile",
    onboard_sub: "Set up your identity to personalize MinDora AI",
    age_label: "Age",
    gender_label: "Gender",
    set_pass_label: "Set Account Password (Optional)",
    finish_setup: "Enter MinDora AI",
    new_chat: "New Chat",
    search_chats: "Search conversations...",
    recent_chats: "Recent Chats",
    hidden_vault: "Hidden Vault",
    hero_title: "How can MinDora help you today?",
    hero_sub: "Upload files, generate HD images, preview live code, or talk hands-free.",
    input_placeholder: "Message MinDora AI or /imagine...",
    create_image: "Create Image",
    live_voice: "Live Talk",
    settings_title: "System & Settings",
    tab_account: "Account",
    tab_personalization: "Personalization",
    tab_security: "Security & PIN",
    tab_language: "Language",
    save_changes: "Save Changes",
    sign_out: "Sign Out",
    memory_title: "Auto & Custom Memory",
    custom_prompt_title: "Custom System Instructions",
    pin_title: "Security PIN",
    change_pin: "Change PIN",
    forgot_pin: "Forgot PIN? Reset via Account",
    language_title: "Interface Language"
  },
  hi: {
    welcome_title: "MinDora AI में स्वागत है",
    welcome_sub: "मल्टीमोडल इंटेलिजेंस • एन्क्रिप्टेड वॉल्ट • लाइव वॉयस",
    continue_google: "Google के साथ जारी रखें",
    continue_apple: "Apple के साथ जारी रखें",
    tab_signin: "साइन इन",
    tab_signup: "साइन अप",
    identifier_label: "यूज़रनेम या ईमेल",
    password_label: "पासवर्ड",
    forgot_password: "पासवर्ड भूल गए?",
    signin_btn: "साइन इन करें",
    fullname_label: "पूरा नाम",
    username_label: "यूज़रनेम",
    email_label: "ईमेल पता",
    signup_btn: "अकाउंट बनाएं",
    verify_title: "अपना ईमेल सत्यापित करें",
    verify_desc: "हमने आपके ईमेल पर एक वेरिफिकेशन लिंक भेजा है। लिंक पर क्लिक करें और नीचे दबाएं।",
    ive_verified: "मैंने ईमेल वेरिफाई कर लिया है",
    resend_email: "लिंक फिर से भेजें",
    onboard_title: "अपनी प्रोफ़ाइल पूरी करें",
    onboard_sub: "MinDora AI को पर्सनलाइज़ करने के लिए जानकारी भरें",
    age_label: "उम्र",
    gender_label: "लिंग",
    set_pass_label: "अकाउंट पासवर्ड सेट करें",
    finish_setup: "MinDora AI शुरू करें",
    new_chat: "नई चैट",
    search_chats: "चैट खोजें...",
    recent_chats: "हालिया चैट",
    hidden_vault: "हिडन वॉल्ट",
    hero_title: "आज MinDora आपकी क्या मदद कर सकता है?",
    hero_sub: "फ़ाइलें अपलोड करें, HD इमेज बनाएं, लाइव कोड देखें या बात करें।",
    input_placeholder: "MinDora AI को मैसेज लिखें या /imagine...",
    create_image: "इमेज बनाएं",
    live_voice: "लाइव टॉक",
    settings_title: "सिस्टम और सेटिंग्स",
    tab_account: "अकाउंट",
    tab_personalization: "पर्सनलाइज़ेशन",
    tab_security: "सुरक्षा और PIN",
    tab_language: "भाषा",
    save_changes: "बदलाव सेव करें",
    sign_out: "लॉग आउट",
    memory_title: "ऑटो और कस्टम मेमोरी",
    custom_prompt_title: "कस्टम निर्देश (System Prompt)",
    pin_title: "सुरक्षा PIN",
    change_pin: "PIN बदलें",
    forgot_pin: "PIN भूल गए? अकाउंट से रीसेट करें",
    language_title: "ऐप की भाषा"
  },
  bn: {
    welcome_title: "MinDora AI-তে স্বাগতম",
    welcome_sub: "মাল্টিমোডাল ইন্টেলিজেন্স • সিকিউর ভল্ট • লাইভ ভয়েস",
    continue_google: "Google দিয়ে এগিয়ে যান",
    continue_apple: "Apple দিয়ে এগিয়ে যান",
    tab_signin: "লগইন",
    tab_signup: "সাইন আপ",
    identifier_label: "ইউজারনেম বা ইমেইল",
    password_label: "পাসওয়ার্ড",
    forgot_password: "পাসওয়ার্ড ভুলে গেছেন?",
    signin_btn: "লগইন করুন",
    fullname_label: "পুরো নাম",
    username_label: "ইউজারনেম",
    email_label: "ইমেইল অ্যাড্রেস",
    signup_btn: "অ্যাকাউন্ট তৈরি করুন",
    verify_title: "ইমেইল ভেরিফাই করুন",
    verify_desc: "আপনার ইমেইলে একটি ভেরিফিকেশন লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে নিচে ট্যাপ করুন।",
    ive_verified: "ইমেইল ভেরিফাই হয়ে গেছে",
    resend_email: "আবার লিংক পাঠান",
    onboard_title: "প্রোফাইল সম্পূর্ণ করুন",
    onboard_sub: "MinDora AI সেটআপ করতে নিচের তথ্যগুলো দিন",
    age_label: "বয়স",
    gender_label: "জেন্ডার",
    set_pass_label: "পাসওয়ার্ড সেট করুন",
    finish_setup: "MinDora AI শুরু করুন",
    new_chat: "নতুন চ্যাট",
    search_chats: "চ্যাট খুঁজুন...",
    recent_chats: "সাম্প্রতিক চ্যাট",
    hidden_vault: "হিডেন ভল্ট",
    hero_title: "আজ MinDora কীভাবে সাহায্য করতে পারে?",
    hero_sub: "ফাইল আপলোড করুন, HD ছবি তৈরি করুন, কোড রান করুন বা লাইভ কথা বলুন।",
    input_placeholder: "MinDora AI-কে লিখুন বা /imagine...",
    create_image: "ছবি তৈরি",
    live_voice: "লাইভ টক",
    settings_title: "সিস্টেম ও সেটিংস",
    tab_account: "অ্যাকাউন্ট",
    tab_personalization: "পার্সোনালাইজেশন",
    tab_security: "সিকিউরিটি ও PIN",
    tab_language: "ভাষা",
    save_changes: "সেভ করুন",
    sign_out: "সাইন আউট",
    memory_title: "অটো ও কাস্টম মেমোরি",
    custom_prompt_title: "কাস্টম ইন্সট্রাকশন প্রম্পট",
    pin_title: "সিকিউরিটি PIN",
    change_pin: "PIN পরিবর্তন করুন",
    forgot_pin: "PIN ভুলে গেছেন? অ্যাকাউন্ট দিয়ে রিসেট করুন",
    language_title: "অ্যাপের ভাষা"
  },
  ta: {
    welcome_title: "MinDora AI-க்கு வரவேற்கிறோம்",
    continue_google: "Google மூலம் தொடரவும்",
    continue_apple: "Apple மூலம் தொடரவும்",
    new_chat: "புதிய அரட்டை",
    settings_title: "அமைப்புகள்",
    language_title: "மொழி"
  },
  te: {
    welcome_title: "MinDora AI కి స్వాగతం",
    continue_google: "Google తో కొనసాగండి",
    continue_apple: "Apple తో కొనసాగండి",
    new_chat: "కొత్త చాట్",
    settings_title: "సెట్టింగ్‌లు",
    language_title: "భాష"
  },
  mr: {
    welcome_title: "MinDora AI मध्ये स्वागत आहे",
    continue_google: "Google सह सुरू ठेवा",
    continue_apple: "Apple सह सुरू ठेवा",
    new_chat: "नवीन चॅट",
    settings_title: "सेटिंग्ज",
    language_title: "भाषा"
  },
  gu: {
    welcome_title: "MinDora AI માં સ્વાગત છે",
    continue_google: "Google સાથે ચાલુ રાખો",
    continue_apple: "Apple સાથે ચાલુ રાખો",
    new_chat: "નવી ચેટ",
    settings_title: "સેટિંગ્સ",
    language_title: "ભાષા"
  },
  kn: {
    welcome_title: "MinDora AI ಗೆ ಸುಸ್ವಾಗತ",
    continue_google: "Google ನೊಂದಿಗೆ ಮುಂದುವರಿಯಿರಿ",
    continue_apple: "Apple ನೊಂದಿಗೆ ಮುಂದುವರಿಯಿರಿ",
    new_chat: "ಹೊಸ ಚಾಟ್",
    settings_title: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
    language_title: "ಭಾಷೆ"
  },
  ml: {
    welcome_title: "MinDora AI-യിലേക്ക് സ്വാഗതം",
    continue_google: "Google ഉപയോഗിച്ച് തുടരുക",
    continue_apple: "Apple ഉപയോഗിച്ച് തുടരുക",
    new_chat: "പുതിയ ചാറ്റ്",
    settings_title: "ക്രമീകരണങ്ങൾ",
    language_title: "ഭാഷ"
  },
  pa: {
    welcome_title: "MinDora AI ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ",
    continue_google: "Google ਨਾਲ ਜਾਰੀ ਰੱਖੋ",
    continue_apple: "Apple ਨਾਲ ਜਾਰੀ ਰੱਖੋ",
    new_chat: "ਨਵੀਂ ਗੱਲਬਾਤ",
    settings_title: "ਸੈਟਿੰਗਾਂ",
    language_title: "ਭਾਸ਼ਾ"
  },
  ur: {
    welcome_title: "MinDora AI میں خوش آمدید",
    continue_google: "Google کے ساتھ جاری رکھیں",
    continue_apple: "Apple کے ساتھ جاری رکھیں",
    new_chat: "نئی چیٹ",
    settings_title: "سیٹنگز",
    language_title: "زبان"
  },
  es: {
    welcome_title: "Bienvenido a MinDora AI",
    continue_google: "Continuar con Google",
    continue_apple: "Continuar con Apple",
    new_chat: "Nuevo chat",
    settings_title: "Configuración",
    language_title: "Idioma"
  },
  fr: {
    welcome_title: "Bienvenue sur MinDora AI",
    continue_google: "Continuer avec Google",
    continue_apple: "Continuer avec Apple",
    new_chat: "Nouvelle discussion",
    settings_title: "Paramètres",
    language_title: "Langue"
  },
  ar: {
    welcome_title: "مرحبًا بك في MinDora AI",
    continue_google: "المتابعة باستخدام Google",
    continue_apple: "المتابعة باستخدام Apple",
    new_chat: "محادثة جديدة",
    settings_title: "الإعدادات",
    language_title: "اللغة"
  },
  ja: {
    welcome_title: "MinDora AI へようこそ",
    continue_google: "Google で続行",
    continue_apple: "Apple で続行",
    new_chat: "新しいチャット",
    settings_title: "設定",
    language_title: "言語"
  }
};

export function getCurrentLang() {
  return localStorage.getItem("mindora_ui_lang") || "en";
}

export function t(key) {
  const lang = getCurrentLang();
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.en[key] || key;
}

export function applyLanguage(langCode) {
  localStorage.setItem("mindora_ui_lang", langCode);
  document.documentElement.lang = langCode;
  document.documentElement.dir = (langCode === "ur" || langCode === "ar") ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key));
  });
}
