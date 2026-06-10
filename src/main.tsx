import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { routeTree } from "./routeTree.gen";
import "./lib/i18n";
import "./index.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

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
