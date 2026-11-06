import { structuredDiff, npmDependencyDiff, type DependencyChange, type DependencyClassification, type StructuralChange } from "@/lib/github-expansion/analysis";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { GhMarkdown } from "./gh-markdown";

export type SemanticKind = "markdown" | "json" | "yaml" | "npm-lock";

/** Which semantic views a path supports (in addition to the patch). */
export function semanticKind(file: string): SemanticKind | null {
  const f = file.toLowerCase();
  if (/(^|\/)package-lock\.json$/.test(f)) return "npm-lock";
  if (/\.(md|markdown|mdx)$/.test(f)) return "markdown";
  if (/\.json$/.test(f)) return "json";
  if (/\.ya?ml$/.test(f)) return "yaml";
  return null;
}

const show = (v: unknown) => (v === undefined ? "" : JSON.stringify(v).slice(0, 200));

/** Loads both pinned revisions; a missing side is treated as an empty file (added/deleted). */
function useBoth(path: string, file: string, previousFile: string | undefined, base: string, head: string) {
  const [res, setRes] = useState<{ before: string; after: string; missing: ("before" | "after")[] } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    setRes(null);
    const read = (rev: string, f: string) => invoke<string>("repo_file_content_at", { path, file: f, treeish: rev }).then((x) => ({ ok: true as const, x }), () => ({ ok: false as const, x: "" }));
    void Promise.all([read(base, previousFile ?? file), read(head, file)]).then(([b, a]) => {
      if (!live) return;
      if (!b.ok && !a.ok) return setRes({ error: "both" });
      setRes({ before: b.x, after: a.x, missing: [...(b.ok ? [] : ["before" as const]), ...(a.ok ? [] : ["after" as const])] });
    });
    return () => {
      live = false;
    };
  }, [path, file, previousFile, base, head]);
  return res;
}

export function SemanticDiffView({ path, file, previousFile, base, head, kind }: { path: string; file: string; previousFile?: string; base: string; head: string; kind: SemanticKind }) {
  const { t } = useTranslation();
  const both = useBoth(path, file, previousFile, base, head);
  if (!both) return <Loader2 className="m-6 mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  if ("error" in both) return <p className="p-4 text-xs text-muted-foreground">{t("semantic.unreadable")}</p>;
  const note = both.missing.length > 0 && <p className="border-b border-border/50 px-4 py-1 text-[11px] text-muted-foreground">{t(both.missing[0] === "before" ? "semantic.added" : "semantic.deleted")}</p>;
  if (kind === "markdown") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {note}
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border/60 overflow-hidden">
          {(["before", "after"] as const).map((side) => (
            <section key={side} className="min-h-0 overflow-auto p-4" aria-label={t(`semantic.${side}`)}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t(`semantic.${side}`)}</p>
              <GhMarkdown text={both[side]} />
            </section>
          ))}
        </div>
      </div>
    );
  }
  let changes: StructuralChange[] | DependencyChange[];
  try {
    changes = kind === "npm-lock" ? npmDependencyDiff(both.before || '{"lockfileVersion":3,"packages":{}}', both.after || '{"lockfileVersion":3,"packages":{}}') : structuredDiff(both.before || (kind === "json" ? "null" : ""), both.after || (kind === "json" ? "null" : ""), kind);
  } catch (e) {
    return <p className="p-4 text-xs text-amber-600">{t("semantic.parseFailed", { error: String(e) })}</p>;
  }
  if (changes.length === 0) return <div>{note}<p className="p-4 text-xs text-muted-foreground">{t("semantic.noChange")}</p></div>;
  if (kind === "npm-lock") {
    const classLabel = (c: DependencyClassification) => [c.direct ? t("semantic.direct") : t("semantic.transitive"), c.dev ? t("semantic.devDep") : t("semantic.runtimeDep"), c.optional && t("semantic.optionalDep")].filter(Boolean).join(" · ");
    const classChanged = (d: DependencyChange) => !!d.beforeClassification && !!d.afterClassification && classLabel(d.beforeClassification) !== classLabel(d.afterClassification);
    const deps = (changes as DependencyChange[]).sort((a, b) => Number(b.direct) - Number(a.direct) || a.name.localeCompare(b.name));
    return (
      <div className="h-full overflow-auto">
        {note}
        <p className="px-4 py-1 text-[11px] text-muted-foreground">{t("semantic.depsSummary", { direct: deps.filter((d) => d.direct).length, transitive: deps.filter((d) => !d.direct).length })}</p>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background text-left text-[10px] uppercase text-muted-foreground">
            <tr><th className="px-4 py-1">{t("semantic.package")}</th><th>{t("semantic.before")}</th><th>{t("semantic.after")}</th><th>{t("semantic.kind")}</th></tr>
          </thead>
          <tbody className="font-mono">
            {deps.map((d) => (
              <tr key={d.path} className="border-t border-border/40">
                <td className="px-4 py-0.5" title={d.path}>{d.name}</td>
                <td className="text-rose-500">{d.before ?? "—"}</td>
                <td className="text-emerald-500">{d.after ?? "—"}</td>
                <td className="text-muted-foreground">
                  {classChanged(d) ? (
                    // Same or different version, but how it installs changed (e.g. dev → runtime).
                    <span className="text-amber-500" title={t("semantic.classChanged")}>
                      <span className="line-through opacity-80">{classLabel(d.beforeClassification!)}</span> → {classLabel(d.afterClassification!)}
                    </span>
                  ) : classLabel(d)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto">
      {note}
      <ul className="divide-y divide-border/40 font-mono text-xs">
        {(changes as StructuralChange[]).map((c) => (
          <li key={`${c.kind}${c.path}`} className="px-4 py-1">
            <span className={c.kind === "added" ? "text-emerald-500" : c.kind === "removed" ? "text-rose-500" : "text-amber-500"}>{t(`semantic.${c.kind}Key`)}</span>{" "}
            <span>{c.path}</span>
            {c.kind !== "added" && <span className="ml-2 text-rose-500/80 line-through">{show(c.before)}</span>}
            {c.kind !== "removed" && <span className="ml-2 text-emerald-500">{show(c.after)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
