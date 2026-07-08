import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from './translations.js';

const LangContext = createContext(null);
const SUPPORTED = ['ru', 'ky', 'en'];
const STORAGE_KEY = 'aim-lang';

function readInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(nav)) return nav;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'ru';
}

/** Wraps the app, holds the current language and exposes { lang, setLang, t }. */
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitial);

  useEffect(() => {
    document.documentElement.lang = lang;

    // Keep the tab title and meta description in the active language too.
    const meta = translations[lang]?.meta;
    if (meta) {
      document.title = meta.title;
      const el = document.querySelector('meta[name="description"]');
      if (el) el.setAttribute('content', meta.description);
    }

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore write failures (private mode etc.) */
    }
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang: (l) => SUPPORTED.includes(l) && setLangState(l),
      t: translations[lang],
    }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within <LanguageProvider>');
  return ctx;
}
