import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toastError } from "@/lib/error-toast";
import { permanentCodeLink } from "@/lib/github-expansion/api";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { invoke } from "@tauri-apps/api/core";
import { CircleDot } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IssueCreateDialog } from "./issue-create-dialog";
import { parseLineRange } from "./pr-permalink-button";

/** Fenced snippet + SHA-pinned permalink for an issue body. Fence grows past any backticks in the code. */
export function issueBodyFromCode(file: string, sha: string, url: string, start: number, end: number, code: string): string {
  const fence = "`".repeat(Math.max(3, ...(code.match(/`+/g) ?? []).map((f) => f.length + 1)));
  const ext = /\.([A-Za-z0-9]+)$/.exec(file)?.[1] ?? "";
  return [`${url}`, "", `\`${file}\` L${start}${end !== start ? `-L${end}` : ""} @ \`${sha.slice(0, 12)}\``, "", `${fence}${ext}`, code, fence].join("\n");
}

/** 29: create a GitHub issue from selected lines of a pinned revision. */
export function IssueFromDiffButton({ path, file, sha }: { path: string; file: string; sha: string }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  const [range, setRange] = useState("");
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  if (!isTarget(target) || !/^[0-9a-f]{40,64}$/i.test(sha)) return null;
  const parsed = parseLineRange(range);
  async function prepare() {
    if (!isTarget(target) || !parsed?.[0]) return;
    const [start, end = start] = parsed as [number, number?];
    try {
      const text = await invoke<string>("repo_file_content_at", { path, file, treeish: sha });
      const lines = text.split("\n");
      if (end > lines.length) throw new Error(t("issueDiff.outOfRange", { lines: lines.length }));
      const url = permanentCodeLink(target.account, target.fullName, sha, file, start, end === start ? undefined : end);
      setDraft({ title: "", body: issueBodyFromCode(file, sha, url, start, end, lines.slice(start - 1, end).join("\n")) });
    } catch (e) {
      toastError(String(e));
    }
  }
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" title={t("issueDiff.create")}>
            <CircleDot className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); void prepare(); }}>
            <p className="text-xs font-medium">{t("issueDiff.create")}</p>
            <label className="block text-[11px] text-muted-foreground">
              {t("issueDiff.lines")}
              <Input autoFocus value={range} onChange={(e) => setRange(e.target.value)} placeholder="L10-L24" className="mt-0.5 h-7 font-mono text-xs" />
            </label>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{sha.slice(0, 12)} · {file}</p>
            <Button type="submit" size="sm" className="h-7 w-full text-xs" disabled={!parsed?.[0]}>{t("issueDiff.compose")}</Button>
          </form>
        </PopoverContent>
      </Popover>
      {draft && (
        <IssueCreateDialog account={target.account} fullName={target.fullName} open onOpenChange={(o) => !o && setDraft(null)} initialTitle={draft.title} initialBody={draft.body} />
      )}
    </>
  );
}
