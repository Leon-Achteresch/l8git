import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "ui-test"),
  publicDir: false,
  build: { outDir: path.resolve(import.meta.dirname, 'dist-ui-test'), emptyOutDir: true },
  worker: { format: 'es' },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@tauri-apps/api/core": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-core.ts"),
      "@tauri-apps/api/event": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-event.ts"),
      "@tauri-apps/api/window": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-window.ts"),
      "@tauri-apps/api/webview": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-webview.ts"),
      "@tauri-apps/api/app": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-app.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-dialog.ts"),
      "@tauri-apps/plugin-opener": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-opener.ts"),
      "@tauri-apps/plugin-notification": path.resolve(import.meta.dirname, "ui-test/stubs/tauri-notification.ts"),
    },
  },
  server: {
    warmup: { clientFiles: ["./main.tsx", "./audit-scenes.tsx"] },
    port: 4173,
    strictPort: true,
    host: "127.0.0.1",
    fs: {
      allow: [path.resolve(import.meta.dirname)],
    },
  },
});
