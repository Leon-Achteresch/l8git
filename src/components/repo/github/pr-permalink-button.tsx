import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toastError } from "@/lib/error-toast";
import { permanentCodeLink } from "@/lib/github-expansion/api";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** `12`, `12-20`, `L12-L20` → [start, end?]; null when malformed. */
export function parseLineRange(raw: string): [number?, number?] | null {
  const v = raw.trim();
  if (!v) return [];
  const m = /^L?(\d+)(?:\s*-\s*L?(\d+))?$/i.exec(v);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : undefined;
  return a >= 1 && (b === undefined || b >= a) ? [a, b] : null;
}

/** Copies a GitHub blob link pinned to the PR head SHA, optionally with a line range. */
export function PrPermalinkButton({ path, sha, file, removed }: { path: string; sha: string; file: string; removed: boolean }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  const [range, setRange] = useState("");
  if (!isTarget(target) || removed) return null;
  const parsed = parseLineRange(range);
  function copy() {
    if (!isTarget(target) || !parsed) return;
    try {
      const url = permanentCodeLink(target.account, target.fullName, sha, file, parsed[0], parsed[1]);
      void navigator.clipboard.writeText(url).then(() => toast.success(t("ghx.permalinkCopied")));
    } catch (e) {
      toastError(String(e));
    }
  }
  return (
    <div className="flex shrink-0 justify-end border-b border-border/40 px-2 py-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 gap-1 text-[0.6875rem] text-muted-foreground">
            <Link2 className="h-3 w-3" />
            {t("ghx.permalink")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <form onSubmit={(e) => { e.preventDefault(); copy(); }} className="space-y-1.5">
            <label className="block text-[0.6875rem] text-muted-foreground">
              {t("ghx.permalinkLines")}
              <Input autoFocus value={range} onChange={(e) => setRange(e.target.value)} placeholder="L10-L24" className="mt-0.5 h-7 font-mono text-xs" aria-invalid={!parsed} />
            </label>
            <p className="truncate font-mono text-[0.625rem] text-muted-foreground">{sha.slice(0, 12)} · {file}</p>
            <Button type="submit" size="sm" className="h-7 w-full text-xs" disabled={!parsed}>{t("ghx.permalinkCopy")}</Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
