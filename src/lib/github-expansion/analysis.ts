import { parseRepositoryYaml } from "./forms";

export type StructuralChange = { path: string; kind: "added" | "removed" | "changed"; before?: unknown; after?: unknown };
const mapping = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** JSON Pointer paths remain unambiguous for keys containing slashes or tildes. */
export function structuredDiff(before: string, after: string, format: "json" | "yaml"): StructuralChange[] {
  if (before.length + after.length > 512_000) throw new Error("Structured comparison exceeds the 512 KB limit.");
  const parse = format === "json" ? JSON.parse : parseRepositoryYaml;
  const left: unknown = parse(before), right: unknown = parse(after), changes: StructuralChange[] = [];
  const walk = (a: unknown, b: unknown, path: string, depth: number) => {
    if (depth > 100 || changes.length > 10_000) throw new Error("Structured comparison is too complex.");
    if (Object.is(a, b)) return;
    if (mapping(a) && mapping(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        const child = `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
        if (!Object.prototype.hasOwnProperty.call(a, key)) changes.push({ path: child, kind: "added", after: b[key] });
        else if (!Object.prototype.hasOwnProperty.call(b, key)) changes.push({ path: child, kind: "removed", before: a[key] });
        else walk(a[key], b[key], child, depth + 1);
      }
    } else if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i >= a.length) changes.push({ path: `${path}/${i}`, kind: "added", after: b[i] });
        else if (i >= b.length) changes.push({ path: `${path}/${i}`, kind: "removed", before: a[i] });
        else walk(a[i], b[i], `${path}/${i}`, depth + 1);
      }
    } else changes.push({ path: path || "/", kind: "changed", before: a, after: b });
  };
  walk(left, right, "", 0);
  return changes;
}

type PackageLock = { lockfileVersion?: number; packages?: Record<string, { version?: string; dev?: boolean; optional?: boolean; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }> };
export type DependencyClassification = { direct: boolean; dev: boolean; optional: boolean };
export type DependencyChange = { path: string; name: string; before: string | null; after: string | null; direct: boolean; dev: boolean; optional: boolean; beforeClassification: DependencyClassification | null; afterClassification: DependencyClassification | null };
/** npm package-lock v2/v3 only; other ecosystems fail explicitly. */
export function npmDependencyDiff(before: string, after: string): DependencyChange[] {
  if (before.length + after.length > 10_000_000) throw new Error("Dependency comparison exceeds the 10 MB limit.");
  const parse = (raw: string): PackageLock => {
    const data = JSON.parse(raw) as PackageLock;
    if (!data || ![2, 3].includes(data.lockfileVersion ?? 0) || !mapping(data.packages)) throw new Error("Only npm package-lock versions 2 and 3 are supported.");
    for (const pkg of Object.values(data.packages)) if (!mapping(pkg) || pkg.version !== undefined && typeof pkg.version !== "string") throw new Error("Invalid package-lock entry.");
    return data;
  };
  const a = parse(before).packages!, b = parse(after).packages!;
  const classify = (packages: NonNullable<PackageLock["packages"]>, path: string, name: string): DependencyClassification | null => {
    if (!Object.prototype.hasOwnProperty.call(packages, path)) return null;
    const root = packages[""];
    const direct = path === `node_modules/${name}` && [root?.dependencies, root?.devDependencies, root?.optionalDependencies].some(deps => deps && Object.prototype.hasOwnProperty.call(deps, name));
    return { direct, dev: packages[path].dev === true, optional: packages[path].optional === true };
  };
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(path => path.includes("node_modules/")).flatMap(path => {
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const beforeClassification = classify(a, path, name), afterClassification = classify(b, path, name);
    const before = a[path]?.version ?? null, after = b[path]?.version ?? null;
    if (before === after && JSON.stringify(beforeClassification) === JSON.stringify(afterClassification)) return [];
    const classification = afterClassification ?? beforeClassification!;
    return [{ path, name, before, after, ...classification, beforeClassification, afterClassification }];
  });
}
