import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

// Without this, @monaco-editor/react downloads Monaco from the jsdelivr CDN at
// runtime — slow first diff, broken offline. Use the bundled ESM build instead;
// workers come from vite-plugin-monaco-editor. Import this module from every
// component that renders an <Editor>/<DiffEditor> (they are all lazy chunks,
// so Monaco stays out of the startup path).
loader.config({ monaco });
