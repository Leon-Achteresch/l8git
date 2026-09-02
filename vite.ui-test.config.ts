import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: path.resolve(__dirname, "ui-test"),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tauri-apps/api/core": path.resolve(__dirname, "ui-test/stubs/tauri-core.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "ui-test/stubs/tauri-event.ts"),
      "@tauri-apps/api/window": path.resolve(__dirname, "ui-test/stubs/tauri-window.ts"),
      "@tauri-apps/api/webview": path.resolve(__dirname, "ui-test/stubs/tauri-webview.ts"),
      "@tauri-apps/api/app": path.resolve(__dirname, "ui-test/stubs/tauri-app.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "ui-test/stubs/tauri-dialog.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "ui-test/stubs/tauri-opener.ts"),
      "@tauri-apps/plugin-notification": path.resolve(__dirname, "ui-test/stubs/tauri-notification.ts"),
    },
  },
  server: {
    port: 4173,
    strictPort: true,
    host: "127.0.0.1",
    fs: {
      allow: [path.resolve(__dirname)],
    },
  },
});
