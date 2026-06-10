import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import "./lib/i18n";
import "./index.css";
import { router } from "./lib/router";

// Defer the update check (network + updater chunk) until the app is idle so
// it never competes with first paint.
if (isTauri()) {
  const whenIdle =
    typeof requestIdleCallback === "function"
      ? (cb: () => void) => requestIdleCallback(cb, { timeout: 5000 })
      : (cb: () => void) => setTimeout(cb, 3000);
  whenIdle(() => {
    void import("@/lib/app-updater").then((m) => m.checkForAppUpdate());
  });

  // Hydrate AI API key from OS keyring into the in-memory store so ai-commit
  // can use it without re-reading from keyring on every call.
  void import("@/lib/secure-storage").then(({ secureGet, AI_KEY_KEYRING_KEY }) =>
    secureGet(AI_KEY_KEYRING_KEY)
      .then((key) => {
        if (key) {
          void import("@/lib/commit-prefs").then(({ useCommitPrefs }) => {
            useCommitPrefs.getState().setAiProviderApiKey(key);
          });
        }
      })
      .catch(() => {}),
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HotkeysProvider
      defaultOptions={{
        hotkey: { preventDefault: true, conflictBehavior: "warn" },
      }}
    >
      <RouterProvider router={router} />
    </HotkeysProvider>
  </React.StrictMode>,
);
