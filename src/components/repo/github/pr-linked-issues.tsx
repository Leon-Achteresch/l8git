import { listLinkedIssues, type LinkedIssue } from "@/lib/github-expansion/api";
import type { GithubTarget } from "@/lib/github-ui/target";
import { CircleDot } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { IssueDetailSheet } from "./issue-detail-sheet";

/** 24: issues this PR closes (GitHub closingIssuesReferences), opened in the internal issue view. */
export function PrLinkedIssues({ target, number, refreshKey }: { target: GithubTarget; number: number; refreshKey: unknown }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<LinkedIssue[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<LinkedIssue | null>(null);
  useEffect(() => {
    let live = true;
    setItems(null);
    listLinkedIssues(target.account, target.fullName, number).then((r) => {
      if (!live) return;
      setItems(r.items);
      setCursor(r.cursor);
      setMore(r.hasMore);
    }, () => live && setItems([]));
    return () => {
      live = false;
    };
  }, [target.account, target.fullName, number, refreshKey]);
  if (!items?.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[0.6875rem]">
      <span className="text-muted-foreground">{t("ghx.closes")}</span>
      {items.map((i) => (
        <button key={i.id} type="button" onClick={() => setOpen(i)} className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 hover:bg-muted" title={i.title}>
          <CircleDot className={`h-3 w-3 ${i.state === "OPEN" ? "text-emerald-500" : "text-violet-500"}`} />
          {i.repository.nameWithOwner !== target.fullName && <span className="text-muted-foreground">{i.repository.nameWithOwner}</span>}#{i.number}
          <span className="max-w-48 truncate">{i.title}</span>
        </button>
      ))}
      {more && (
        <button type="button" className="text-primary hover:underline" onClick={() => void listLinkedIssues(target.account, target.fullName, number, cursor).then((r) => { setItems((p) => [...(p ?? []), ...r.items]); setCursor(r.cursor); setMore(r.hasMore); })}>
          {t("ghx.loadMore")}
        </button>
      )}
      {open && (
        <IssueDetailSheet account={target.account} fullName={open.repository.nameWithOwner} number={open.number} onClose={() => setOpen(null)} onChanged={() => {}} />
      )}
    </div>
  );
}
