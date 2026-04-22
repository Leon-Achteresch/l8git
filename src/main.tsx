import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { checkForAppUpdate } from "@/lib/app-updater";

import { routeTree } from "./routeTree.gen";
import "./index.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

if (isTauri()) {
  void listen<string>("menu-navigate", (e) => {
    void router.navigate({ to: e.payload });
  });
  void checkForAppUpdate();
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
