import "./setup-platform";

import React from "react";
import ReactDOM from "react-dom/client";

import "@/lib/i18n";
import { changeAppLanguage } from "@/lib/i18n";
import { AgentsUiRoot } from "@/components/agents/test-harness/agents-ui-root";
import { seedAgentUi } from "@/components/agents/test-harness/seed-agent-ui";
import { MonocodeApp } from "@/monocode/MonocodeApp";

import "@/index.css";
import "@/components/agents/agents.css";

window.addEventListener("error", (e) => console.error("UIERR", e.error?.stack ?? e.message));
window.addEventListener("unhandledrejection", (e) => console.error("UIREJ", (e.reason as Error)?.stack ?? String(e.reason)));

const scene = new URLSearchParams(window.location.search).get("scene") ?? "chat";

await changeAppLanguage("en");
seedAgentUi(scene);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {scene === "monocode" ? (
      <div className="h-screen w-screen">
        <MonocodeApp />
      </div>
    ) : (
      <AgentsUiRoot scene={scene} />
    )}
  </React.StrictMode>,
);
