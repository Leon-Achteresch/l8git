import "./lib/platform/tauri";

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import "./lib/i18n";
import "./lib/agents-desktop";
import "./index.css";
import { router } from "./lib/router";

if (isTauri()) {
  void invoke("pty_close_all").catch(() => {});

  const whenIdle =
    typeof requestIdleCallback === "function"
      ? (cb: () => void) => requestIdleCallback(cb, { timeout: 5000 })
      : (cb: () => void) => setTimeout(cb, 3000);
  whenIdle(() => {
    void import("@/lib/app-updater").then((m) => m.checkForAppUpdate());
    void import("@/lib/notifications-wiring").then((m) => m.armNotifications());
  });

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
