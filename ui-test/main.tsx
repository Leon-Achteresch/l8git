import "./setup-platform";

import React from "react";
import ReactDOM from "react-dom/client";

import "@/lib/i18n";
import { changeAppLanguage } from "@/lib/i18n";
import { AgentsUiRoot } from "@/components/agents/test-harness/agents-ui-root";
import { seedAgentUi } from "@/components/agents/test-harness/seed-agent-ui";

import "@/index.css";
import "@/components/agents/agents.css";

const scene = new URLSearchParams(window.location.search).get("scene") ?? "chat";

await changeAppLanguage("en");
seedAgentUi(scene);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AgentsUiRoot scene={scene} />
  </React.StrictMode>,
);
