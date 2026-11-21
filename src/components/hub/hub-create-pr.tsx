import { invoke } from "@tauri-apps/api/core";
import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hubApi } from "@/lib/hub/api";
import { accountKey, hubRepoPath, useHubStore } from "@/lib/hub/store";
import type { HubAccount, HubRepoDetail } from "@/lib/hub/types";
import { useHubQuery } from "@/lib/hub/use-hub-query";

async function branchSuggestions(account: HubAccount, repo: string) {
  const parts = repo.split("/").map(encodeURIComponent).join("/");
  if (account.provider === "bitbucket") {
    const page = await hubApi<{ values: { name: string }[] }>(
      account,
      "GET",
      `/repositories/${parts}/refs/branches?pagelen=100`,
    );
    return page.values;
  }
  const path =
    account.provider === "gitlab"
      ? `/projects/${encodeURIComponent(repo)}/repository/branches`
      : `/repos/${parts}/branches`;
  return hubApi<{ name: string }[]>(account, "GET", path + "?per_page=100");
}

export function HubCreatePr({
  account,
  repo,
  onClose,
  onCreated,
}: {
  account: HubAccount;
  repo: Pick<HubRepoDetail, "fullName" | "defaultBranch">;
  onClose: () => void;
  onCreated: (number: number) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const suggestions = useHubQuery(account, "branches:" + repo.fullName, (_, a) =>
    branchSuggestions(a, repo.fullName),
  );
  const [base, setBase] = useState(repo.defaultBranch ?? "");
  const [head, setHead] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = title.trim() && head.trim() && base.trim() && head.trim() !== base.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const pr = await invoke<{ number: number }>("pr_create", {
        path: hubRepoPath(account, repo.fullName),
        title: title.trim(),
        body,
        head: head.trim(),
        base: base.trim(),
        draft,
      });
      useHubStore.getState().refresh();
      toast.success(t("pr.createdToast", { number: pr.number }));
      if (useHubStore.getState().activeKey === accountKey(account)) onCreated(pr.number);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogTitle>{t("pr.createTitle")}</DialogTitle>
        <form className="grid gap-4" onSubmit={submit}>
          <fieldset disabled={busy} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">
                {t("pr.compareLabel")}
                <Input list={listId} value={head} onChange={(e) => setHead(e.target.value)} required />
              </label>
              <label className="grid gap-1 text-xs">
                {t("pr.baseLabel")}
                <Input list={listId} value={base} onChange={(e) => setBase(e.target.value)} required />
              </label>
              <datalist id={listId}>
                {suggestions.data?.map((b) => (
                  <option key={b.name} value={b.name} />
                ))}
              </datalist>
            </div>
            <label className="grid gap-1 text-xs">
              {t("pr.titleLabel")}
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs">
              {t("pr.descriptionLabel")}
              <Textarea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("pr.bodyPlaceholder")}
              />
            </label>
            {account.provider !== "bitbucket" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
                {t("pr.draftLabel")}
              </label>
            )}
          </fieldset>
          {head.trim() && head.trim() === base.trim() && (
            <p className="text-xs text-muted-foreground">{t("pr.branchesDistinctToast")}</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="justify-self-end" disabled={busy || !valid}>
            {busy ? t("pr.createSubmitBusy") : t("pr.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
