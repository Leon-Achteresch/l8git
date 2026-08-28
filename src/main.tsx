import "./lib/platform/tauri";

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import "./lib/i18n";
import "./index.css";
import { isIslandWindow } from "./lib/island/bridge";
import { router } from "./lib/router";

const island = isIslandWindow();

/** The AI provider key lives in the OS keyring, never in localStorage. */
function loadAiKey() {
  return import("@/lib/secure-storage").then(({ secureGet, AI_KEY_KEYRING_KEY }) =>
    secureGet(AI_KEY_KEYRING_KEY)
      .then((key) => {
        if (!key) return;
        return import("@/lib/commit-prefs").then(({ useCommitPrefs }) => {
          useCommitPrefs.getState().setAiProviderApiKey(key);
        });
      })
      .catch(() => {}),
  );
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (island) {
  document.documentElement.classList.add("island-window");
  void import("./components/island/island-window-app").then(({ IslandWindowApp }) => {
    root.render(
      <React.StrictMode>
        <IslandWindowApp />
      </React.StrictMode>,
    );
  });
} else {
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

    void loadAiKey();
  }

  void import("./lib/agents-desktop");

  root.render(
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
}
