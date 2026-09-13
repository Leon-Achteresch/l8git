import "./setup-platform";

import React from "react";
import ReactDOM from "react-dom/client";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { MotionProvider } from "@/components/motion/motion-provider";

import "@/lib/i18n";
import { changeAppLanguage } from "@/lib/i18n";
import { useLocalePrefs } from "@/lib/locale-prefs";
import { isAppLocale } from "@/lib/locales";

import "@/index.css";

const AuditScenes = React.lazy(() => import("./audit-scenes"));
const params = new URLSearchParams(window.location.search);
const scene = params.get("scene") ?? "review";
const locale = params.get("lang");

useLocalePrefs.setState({ locale: isAppLocale(locale) ? locale : "en" });
await changeAppLanguage(isAppLocale(locale) ? locale : "en");
if (params.get("theme") === "light") {
  document.documentElement.classList.remove("dark");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HotkeysProvider>
      <MotionProvider>
        <React.Suspense fallback={<p>Loading…</p>}>
          <AuditScenes scene={scene} />
        </React.Suspense>
      </MotionProvider>
    </HotkeysProvider>
  </React.StrictMode>,
);
