import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { listTemplates, readTemplate, type GithubTemplate } from "@/lib/github-expansion/api";
import { accountScope, useGithubWorkspace } from "@/lib/github-expansion/store";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { FileText, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/** 13: repository PR templates; 3: offer "Closes #n" when the head branch was started from an issue. */
export function PrCreateAssist({ path, head, base, body, onBody }: { path: string; head: string; base: string; body: string; onBody: (b: string) => void }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  const gh = isTarget(target) ? target : null;
  const [templates, setTemplates] = useState<GithubTemplate[] | null>(null);
  const subjects = useGithubWorkspace((s) => s.subjects);

  useEffect(() => {
    if (!gh) return;
    let live = true;
    listTemplates(gh.account, gh.fullName, base || undefined).then((r) => live && setTemplates(r), () => live && setTemplates([]));
    return () => {
      live = false;
    };
  }, [gh?.account, gh?.fullName, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const issue = useMemo(() => {
    if (!gh) return null;
    const scope = accountScope(gh.account, gh.fullName);
    for (const [key, s] of Object.entries(subjects)) {
      if (s.workspace?.branch !== head) continue;
      try {
        const [sc, kind, n] = JSON.parse(key) as [string, string, number];
        if (sc === scope && kind === "issue") return n;
      } catch {
        // foreign key shape
      }
    }
    return null;
  }, [gh, subjects, head]);

  if (!gh) return null;
  const closes = issue !== null && new RegExp(`\\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${issue}\\b`, "i").test(body);

  async function apply(tp: GithubTemplate) {
    if (!gh) return;
    if (body.trim() && !window.confirm(t("prCreate.replaceBody"))) return;
    try {
      onBody(await readTemplate(gh.account, gh.fullName, tp.path, base || undefined));
    } catch (e) {
      toastError(String(e));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {templates?.map((tp) => (
        <Button key={tp.path} type="button" variant="outline" size="xs" className="h-6 text-[0.625rem]" title={tp.path} onClick={() => void apply(tp)}>
          <FileText className="h-3 w-3" />{templates.length === 1 ? t("prCreate.useTemplate") : tp.name.replace(/\.md$/i, "")}
        </Button>
      ))}
      {issue !== null && !closes && (
        <Button type="button" variant="outline" size="xs" className="h-6 text-[0.625rem]" onClick={() => onBody(`${body.trimEnd()}${body.trim() ? "\n\n" : ""}Closes #${issue}`)}>
          <Link2 className="h-3 w-3" />{t("prCreate.linkIssue", { number: issue })}
        </Button>
      )}
    </div>
  );
}
