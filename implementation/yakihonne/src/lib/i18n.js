import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

import { supportedLanguageKeys } from "@/Content/SupportedLanguages";

const isBrowser = typeof window !== "undefined";

if (!i18n.isInitialized) {
  // On the server, avoid i18next-http-backend fetching relative URLs like
  // "/locales/en/common.json" (Node fetch requires absolute URLs).
  // We initialize a minimal instance server-side, then the browser loads
  // real translations from /public/locales via HttpBackend.
  if (isBrowser) {
    i18n
      .use(HttpBackend)
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        fallbackLng: "en",
        supportedLngs: supportedLanguageKeys,
        ns: ["common"],
        defaultNS: "common",
        debug: process.env.NODE_ENV === "development",
        backend: {
          loadPath: "/locales/{{lng}}/{{ns}}.json",
        },
        detection: {
          order: ["cookie", "localStorage", "navigator"],
          caches: ["cookie"],
        },
        react: {
          useSuspense: false,
        },
      });
  } else {
    i18n.use(initReactI18next).init({
      lng: "en",
      fallbackLng: "en",
      supportedLngs: supportedLanguageKeys,
      ns: ["common"],
      defaultNS: "common",
      resources: {},
      react: { useSuspense: false },
    });
  }
}

export default i18n;
