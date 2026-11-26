import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import CssWorker from "monaco-editor/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker.js?worker";

// Vite emits separate local assets. Each language starts its worker on demand
// so diagnostics and diff computation stay off the input thread, also offline.
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    switch (label) {
      case "typescript":
      case "javascript": return new TypeScriptWorker();
      case "json": return new JsonWorker();
      case "css":
      case "scss":
      case "less": return new CssWorker();
      case "html":
      case "handlebars":
      case "razor": return new HtmlWorker();
      default: return new EditorWorker();
    }
  },
};
loader.config({ monaco });

monaco.editor.defineTheme("l8-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: { "editor.background": "#fcfbf8", "editorGutter.background": "#fcfbf8" },
});
monaco.editor.defineTheme("l8-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: { "editor.background": "#15151b", "editorGutter.background": "#15151b" },
});
