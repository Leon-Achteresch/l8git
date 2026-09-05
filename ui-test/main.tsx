import "./setup-platform";

import React from "react";
import ReactDOM from "react-dom/client";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { MotionProvider } from "@/components/motion/motion-provider";

import "@/lib/i18n";
import { changeAppLanguage } from "@/lib/i18n";
import { isAppLocale } from "@/lib/locales";
import { AgentsUiRoot } from "@/components/agents/test-harness/agents-ui-root";
import { seedAgentUi } from "@/components/agents/test-harness/seed-agent-ui";

import "@/index.css";

const params = new URLSearchParams(window.location.search);
const scene = params.get("scene") ?? "chat";
const locale = params.get("lang");

await changeAppLanguage(isAppLocale(locale) ? locale : "en");
seedAgentUi(scene);
if (params.get("theme") === "light") {
  document.documentElement.classList.remove("dark");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HotkeysProvider>
      <MotionProvider>
        <AgentsUiRoot scene={scene} />
      </MotionProvider>
    </HotkeysProvider>
  </React.StrictMode>,
);
