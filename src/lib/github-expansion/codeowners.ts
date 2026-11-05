import type { HubAccount } from "@/lib/hub/types";
import { enc, hubApi } from "@/lib/hub/api";
import { readTemplate } from "./api";

export type CodeownerRule = { line: number; pattern: string; owners: string[] };
export type CodeownerError = { line: number; column?: number; kind: string; message: string; path?: string };
type Token = { kind: "literal"; value: string } | { kind: "star" } | { kind: "any" };
function componentTokens(component: string): Token[] {
  const chars = Array.from(component), tokens: Token[] = [];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === "\\") {
      if (++i >= chars.length) throw new Error("Trailing escape in pattern.");
      tokens.push({ kind: "literal", value: chars[i] });
    } else if (char === "*") tokens.push({ kind: "star" });
    else if (char === "?") tokens.push({ kind: "any" });
    else tokens.push({ kind: "literal", value: char });
  }
  return tokens;
}
function componentMatches(tokens: Token[], name: string): boolean {
  const chars = Array.from(name);
  let row = new Array<boolean>(chars.length + 1).fill(false); row[0] = true;
  for (const token of tokens) {
    const next = new Array<boolean>(chars.length + 1).fill(false);
    next[0] = token.kind === "star" && row[0];
    for (let i = 1; i <= chars.length; i++) next[i] = token.kind === "star" ? row[i] || next[i - 1] : row[i - 1] && (token.kind === "any" || token.value === chars[i - 1]);
    row = next;
  }
  return row[chars.length];
}
const matchers = new WeakMap<CodeownerRule, (path: string) => boolean>();
function compile(pattern: string): (path: string) => boolean {
  if (pattern.length > 4096) throw new Error("Pattern exceeds the 4,096-character local matching limit.");
  const rooted = pattern.startsWith("/") || pattern.replace(/\/$/, "").includes("/");
  const directory = pattern.endsWith("/");
  const value = pattern.replace(/^\//, "").replace(/\/$/, "");
  const segments = value.split("/"), tokens = segments.map(componentTokens);
  const descendants = directory || tokens[tokens.length - 1].every(token => token.kind === "literal");
  return path => {
    const parts = path.split("/");
    // Dynamic programming avoids catastrophic regex backtracking from repository patterns.
    const starts = rooted ? [0] : Array.from({ length: parts.length }, (_, i) => i);
    for (const start of starts) {
      let row = new Array<boolean>(parts.length + 1).fill(false); row[start] = true;
      for (let p = 0; p < segments.length; p++) {
        const next = new Array<boolean>(parts.length + 1).fill(false);
        for (let i = start; i <= parts.length; i++) {
          if (segments[p] === "**") {
            const requiresChild = p === segments.length - 1 && p > 0;
            next[i] = (row[i] && !requiresChild) || i > start && (row[i - 1] || next[i - 1]);
          } else if (i > start && row[i - 1]) next[i] = componentMatches(tokens[p], parts[i - 1]);
        }
        row = next;
      }
      const below = row.some((matched, i) => matched && i < parts.length);
      if (directory ? below : row[parts.length] || descendants && below) return true;
    }
    return false;
  };
}

function splitRule(raw: string): { pattern: string; owners: string[] } | null {
  const text = raw.trimStart();
  if (!text || text.startsWith("#")) return null;
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\\" && index + 1 < text.length) { index += 2; continue; }
    if (/\s/.test(text[index])) break;
    index++;
  }
  const pattern = text.slice(0, index);
  const tokens = text.slice(index).trim().split(/\s+/).filter(Boolean);
  const comment = tokens.findIndex(token => token.startsWith("#"));
  return { pattern, owners: comment < 0 ? tokens : tokens.slice(0, comment) };
}
export function parseCodeowners(raw: string): { rules: CodeownerRule[]; errors: CodeownerError[] } {
  if (new TextEncoder().encode(raw).length >= 3 * 1024 * 1024) throw new Error("CODEOWNERS exceeds GitHub's 3 MiB limit.");
  const rules: CodeownerRule[] = [], errors: CodeownerError[] = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const entry = splitRule(line);
    if (!entry) return;
    try {
      if (entry.pattern.startsWith("!") || entry.pattern.startsWith("\\#") || /(^|[^\\])\[/.test(entry.pattern) || entry.pattern.includes("***")) throw new Error("Pattern uses syntax unsupported by GitHub CODEOWNERS.");
      if (entry.owners.some(owner => !/^@[^\s@]+$/.test(owner) && !/^[^\s@]+@[^\s@]+$/.test(owner))) throw new Error("Invalid owner token.");
      const rule = { line: index + 1, ...entry };
      matchers.set(rule, compile(entry.pattern)); rules.push(rule);
    } catch (error) { errors.push({ line: index + 1, kind: "Invalid syntax", message: String(error) }); }
  });
  return { rules, errors };
}
export function matchCodeowners(rules: CodeownerRule[], files: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const file of files) {
    let match: CodeownerRule | undefined;
    for (const rule of rules) {
      let matches = matchers.get(rule);
      if (!matches) { matches = compile(rule.pattern); matchers.set(rule, matches); }
      if (matches(file)) match = rule;
    }
    for (const owner of match?.owners ?? []) result.set(owner, [...result.get(owner) ?? [], file]);
  }
  return result;
}
export async function listCodeowners(a: HubAccount, repo: string, ref: string): Promise<{ path: string | null; ref: string; rules: CodeownerRule[]; errors: CodeownerError[]; validationError: string | null }> {
  if (a.provider !== "github" || !/^[^/\s?#\\]+\/[^/\s?#\\]+$/.test(repo)) throw new Error("Expected GitHub owner/repository.");
  let raw: string | null = null, path: string | null = null;
  for (const candidate of [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) {
    try { raw = await readTemplate(a, repo, candidate, ref); path = candidate; break; }
    catch (error) { if (!/(?:^|\s)404(?:\s|:|$)/.test(String(error))) throw error; }
  }
  if (raw === null) return { path: null, ref, rules: [], errors: [], validationError: "No accessible CODEOWNERS file was found at this ref." };
  const parsed = parseCodeowners(raw);
  let providerErrors: CodeownerError[] = [], validationError: string | null = null;
  try { providerErrors = (await hubApi<{ errors: CodeownerError[] }>(a, "GET", `/repos/${repo.split("/").map(enc).join("/")}/codeowners/errors?ref=${enc(ref)}`)).errors; }
  catch (error) { validationError = String(error); }
  const invalidLines = new Set(providerErrors.filter(error => !error.path || error.path === path).map(error => error.line));
  return { path, ref, rules: parsed.rules.filter(rule => !invalidLines.has(rule.line)), errors: [...parsed.errors, ...providerErrors], validationError };
}
