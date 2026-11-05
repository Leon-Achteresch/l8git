import type { MapDependency } from "./model";

interface Token { kind: "word" | "string" | "punct"; text: string }

/** Static JS/TS import subset. Templates/computed specifiers are deliberately omitted. */
function tokens(source: string): Token[] {
  const result: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index++; continue; }
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      const quote = char;
      let text = "";
      let escaped = false;
      let closed = false;
      index++;
      while (index < source.length) {
        const next = source[index++];
        if (next === "\\") { escaped = true; index++; continue; }
        if (next === quote) { closed = true; break; }
        text += next;
      }
      // Escaped strings require full JS decoding. Do not guess a target path.
      result.push({ kind: quote !== "`" && closed && !escaped ? "string" : "punct", text: quote !== "`" && !escaped ? text : "<literal>" });
      continue;
    }
    if (char === "/") {
      const last = result[result.length - 1];
      const startsExpression = !last || ["=", "(", "[", "{", ",", ":", ";", "!", "?", "&&", "||", "return", "throw", "=>"].includes(last.text);
      if (startsExpression) {
        let inClass = false;
        index++;
        while (index < source.length) {
          const next = source[index++];
          if (next === "\\") { index++; continue; }
          if (next === "[") inClass = true;
          else if (next === "]") inClass = false;
          else if (next === "/" && !inClass || next === "\n") break;
        }
        while (/[a-z]/i.test(source[index] ?? "") && index < source.length) index++;
        result.push({ kind: "punct", text: "<regex>" });
        continue;
      }
    }
    if (/[\w$]/.test(char)) {
      const start = index++;
      while (index < source.length && /[\w$]/.test(source[index])) index++;
      result.push({ kind: "word", text: source.slice(start, index) });
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (["&&", "||", "=>", "?."].includes(pair)) {
      result.push({ kind: "punct", text: pair }); index += 2;
    } else { result.push({ kind: "punct", text: char }); index++; }
  }
  return result;
}

export function staticRelativeImports(source: string): string[] {
  const stream = tokens(source);
  const imports = new Set<string>();
  for (let index = 0; index < stream.length; index++) {
    const token = stream[index];
    if (token.kind !== "word" || !["import", "export", "require"].includes(token.text)) continue;
    if ([".", "?."].includes(stream[index - 1]?.text)) continue;
    const next = stream[index + 1];
    let specifier: Token | undefined;
    if (token.text === "require" || next?.text === "(") {
      if (next?.text === "(" && stream[index + 3]?.text === ")") specifier = stream[index + 2];
    } else if (token.text === "import" && next?.kind === "string") specifier = next;
    else {
      for (let at = index + 1; at < Math.min(index + 200, stream.length); at++) {
        if ([";", "import", "export", "="].includes(stream[at].text)) break;
        if (stream[at].text === "from") { specifier = stream[at + 1]; break; }
      }
    }
    if (specifier?.kind === "string" && (specifier.text.startsWith("./") || specifier.text.startsWith("../"))) imports.add(specifier.text);
  }
  return [...imports];
}

function normalizedTarget(from: string, specifier: string): string | null {
  const parts = from.split("/").slice(0, -1);
  for (const part of specifier.split(/[?#]/, 1)[0].split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  return parts.join("/");
}

export interface SourceDocument { path: string; text: string }

/** JSX/TSX require a JSX-aware parser; do not treat rendered text as executable imports. */
export function sourceDependencies(documents: readonly SourceDocument[], repositoryPaths: readonly string[]) {
  const paths = new Set(repositoryPaths);
  const edges = new Map<string, MapDependency>();
  const unresolved: { from: string; specifier: string }[] = [];
  const unsupported: string[] = [];
  for (const document of documents) {
    if (!/\.[cm]?[jt]s$/i.test(document.path)) { unsupported.push(document.path); continue; }
    for (const specifier of staticRelativeImports(document.text)) {
      const target = normalizedTarget(document.path, specifier);
      const candidates = target ? [target, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"].map(suffix => target + suffix)] : [];
      const resolved = candidates.find(path => paths.has(path));
      if (!resolved) { unresolved.push({ from: document.path, specifier }); continue; }
      if (document.path !== resolved) edges.set(JSON.stringify([document.path, resolved]), { from: document.path, to: resolved, source: "import" });
    }
  }
  return { dependencies: [...edges.values()], unresolved, unsupported, supported: "static-relative-js-ts-without-jsx" as const };
}
