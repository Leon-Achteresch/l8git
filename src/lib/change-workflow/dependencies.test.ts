import { describe, expect, it } from "vitest";
import { sourceDependencies, staticRelativeImports } from "./dependencies";

describe("evidence-based static import extraction", () => {
  it("extracts real declarations and literal import/require calls while ignoring comments and strings", () => {
    const source = [
      "// import fake from './comment'",
      "/* export * from './block' */",
      "const text = \"import nope from './text'\";",
      String.raw`const pattern = /import\('\.\/regex'\)/;`,
      "import type { A, B } from './types';",
      "export { value } from '../shared';",
      "import './styles.css';",
      "const lazy = import('./lazy');",
      "const cjs = require('./common');",
      "const member = object.require('./not-module');",
      "const templated = import(`./${name}`);",
    ].join("\n");
    expect(staticRelativeImports(source)).toEqual(["./types", "../shared", "./styles.css", "./lazy", "./common"]);
  });

  it("resolves only known files inside the repository and reports missing targets", () => {
    const result = sourceDependencies([{ path: "src/a.ts", text: "import './b'; export * from '../lib'; import '../../outside'; import './missing'; import 'external';" }], ["src/a.ts", "src/b.ts", "lib/index.js"]);
    expect(result.dependencies).toEqual([
      { from: "src/a.ts", to: "src/b.ts", source: "import" },
      { from: "src/a.ts", to: "lib/index.js", source: "import" },
    ]);
    expect(result.unresolved).toEqual([{ from: "src/a.ts", specifier: "../../outside" }, { from: "src/a.ts", specifier: "./missing" }]);
  });

  it("retains exact extension/query targets and omits computed or escaped specifiers", () => {
    const result = sourceDependencies([{ path: "a.js", text: "import './b.ts?raw'; import './b.ts#x'; import('./' + name); import './\\u0062.ts';" }], ["a.js", "b.ts"]);
    expect(result.dependencies).toEqual([{ from: "a.js", to: "b.ts", source: "import" }]);
    expect(result.unresolved).toEqual([]);
  });

  it("explicitly excludes JSX/TSX instead of interpreting rendered text as an import", () => {
    const result = sourceDependencies([
      { path: "App.tsx", text: "export const App = () => <p>import('./server')</p>;" },
      { path: "App.jsx", text: "export default <p>require('./server')</p>;" },
      { path: "entry.ts", text: "import './App';" },
    ], ["App.tsx", "App.jsx", "server.ts", "entry.ts"]);
    expect(result.dependencies).toEqual([{ from: "entry.ts", to: "App.tsx", source: "import" }]);
    expect(result.unsupported).toEqual(["App.tsx", "App.jsx"]);
    expect(result.supported).toBe("static-relative-js-ts-without-jsx");
  });
});
