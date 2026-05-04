import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

import { AppUpdateDialog } from "@/components/app/app-update-dialog";
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
      <AppUpdateDialog />
    </HotkeysProvider>
  </React.StrictMode>,
);
