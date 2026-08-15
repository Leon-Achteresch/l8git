import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toastError } from "@/lib/error-toast";
import { useGitAccounts, type GitAccount } from "@/lib/git-accounts";
import { runRemoteOp } from "@/lib/remote-ops";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Check,
  Globe,
  Loader2,
  Lock,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type CreatedRepo = {
  clone_url: string;
  ssh_url: string | null;
  full_name: string;
  web_url: string | null;
};

// Per-provider accent so the picker reads like a polished launcher rather than
// a flat list. Falls back to a neutral style for self-hosted / custom hosts.
const BRAND: Record<string, { label: string; gradient: string }> = {
  "github.com": { label: "GitHub", gradient: "from-zinc-700 to-zinc-900" },
  "gitlab.com": { label: "GitLab", gradient: "from-git-modified to-git-removed" },
  "bitbucket.org": { label: "Bitbucket", gradient: "from-git-branch to-git-branch" },
};

const UNSUPPORTED_HOSTS = new Set(["dev.azure.com"]);

function brandFor(account: GitAccount) {
  const brand = BRAND[account.host];
  return {
    label: brand?.label ?? account.name,
    gradient: brand?.gradient ?? "from-slate-500 to-slate-700",
  };
}

function deriveRepoName(path: string): string {
  const cleaned = path.replace(/[\\/]+$/, "");
  const base = cleaned.split(/[\\/]/).pop() ?? "";
  return base.trim();
}

export function CreateRemoteRepoDialog({
  open,
  onClose,
  path,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  path: string;
  onCreated?: (repo: CreatedRepo) => void;
}) {
  const { t } = useTranslation();
  const { accounts } = useGitAccounts();
  const reload = useRepoStore((s) => s.reload);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);

  const [account, setAccount] = useState<GitAccount | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [pushAfter, setPushAfter] = useState(true);
  const [busy, setBusy] = useState(false);

  const signedIn = useMemo(
    () => accounts.filter((a) => a.signed_in),
    [accounts],
  );

  useEffect(() => {
    if (open) {
      setAccount(null);
      setName(deriveRepoName(path));
      setDescription("");
      setIsPrivate(true);
      setPushAfter(true);
      setBusy(false);
    }
  }, [open, path]);

  if (!open) return null;

  function dismiss() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    if (!account) return;
    const repoName = name.trim();
    if (!repoName) {
      toastError(t("createRemote.nameRequired"));
      return;
    }
    setBusy(true);
    try {
      const created = await invoke<CreatedRepo>("create_remote_repo", {
        host: account.host,
        name: repoName,
        private: isPrivate,
        description: description.trim() || null,
      });
      await invoke<string>("add_git_remote", {
        path,
        name: "origin",
        url: created.clone_url,
      });

      if (pushAfter) {
        try {
          await runRemoteOp("push", path, (opId) =>
            invoke<string>("git_push", {
              path,
              setUpstream: true,
              forceMode: null,
              tagsMode: null,
              atomic: false,
              noVerify: false,
              dryRun: false,
              opId,
            }),
          );
          toast.success(
            t("createRemote.createdAndPushed", { name: created.full_name }),
          );
        } catch (pushErr) {
          // Remote exists; only the push failed (e.g. no commits yet). Keep the
          // remote and surface the push problem without rolling anything back.
          toast.warning(
            t("createRemote.createdPushFailed", {
              name: created.full_name,
              error: String(pushErr),
            }),
          );
        }
      } else {
        toast.success(t("createRemote.created", { name: created.full_name }));
      }

      await Promise.all([reload(path), reloadStatus(path)]);
      onCreated?.(created);
      onClose();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const fullNamePreview = account
    ? `${account.username ? `${account.username}/` : ""}${name.trim() || deriveRepoName(path)}`
    : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("createRemote.dialogAria")}
      className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        dismiss();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2">
            {account && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                onClick={() => setAccount(null)}
                aria-label={t("createRemote.backAria")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="font-heading text-base font-semibold leading-tight">
                {account
                  ? t("createRemote.titleConfigure")
                  : t("createRemote.titleChoose")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {account
                  ? t("createRemote.subtitleConfigure", {
                      provider: brandFor(account).label,
                    })
                  : t("createRemote.subtitleChoose")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label={t("createRemote.closeAria")}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="px-5 py-4">
          {!account ? (
            signedIn.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background/40 px-4 py-8 text-center">
                <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {t("createRemote.noAccountsTitle")}
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {t("createRemote.noAccountsHint")}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {signedIn.map((a) => {
                  const brand = brandFor(a);
                  const unsupported = UNSUPPORTED_HOSTS.has(a.host);
                  return (
                    <Button
                      key={a.id}
                      type="button"
                      variant="outline"
                      disabled={unsupported}
                      onClick={() => setAccount(a)}
                      className={cn(
                        "group h-auto w-full justify-start gap-3 rounded-xl border-border bg-background/50 p-3 text-left transition-all",
                        "hover:border-primary/40 hover:bg-muted hover:shadow-sm",
                        "disabled:pointer-events-none disabled:opacity-50",
                      )}
                    >
                      <div
                        className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-sm font-bold uppercase text-white shadow-inner",
                          brand.gradient,
                        )}
                        aria-hidden
                      >
                        {brand.label.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{brand.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.username ? `${a.username} · ${a.host}` : a.host}
                        </div>
                      </div>
                      {unsupported && (
                        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                          {t("createRemote.soon")}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            )
          ) : (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="crr-name">{t("createRemote.nameLabel")}</Label>
                <Input
                  id="crr-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-awesome-project"
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                  disabled={busy}
                />
                {fullNamePreview && (
                  <p className="truncate text-xs text-muted-foreground">
                    {t("createRemote.willCreate")}{" "}
                    <span className="font-medium text-foreground">
                      {fullNamePreview}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="crr-desc">
                  {t("createRemote.descriptionLabel")}
                </Label>
                <Textarea
                  id="crr-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("createRemote.descriptionPlaceholder")}
                  rows={2}
                  disabled={busy}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  aria-pressed={isPrivate}
                  onClick={() => setIsPrivate(true)}
                  className={cn(
                    "h-auto items-start justify-start gap-2 rounded-lg p-3 text-left transition-colors",
                    isPrivate
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-background/40 hover:bg-muted",
                  )}
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium">
                      {t("createRemote.private")}
                      {isPrivate && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">
                      {t("createRemote.privateHint")}
                    </div>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  aria-pressed={!isPrivate}
                  onClick={() => setIsPrivate(false)}
                  className={cn(
                    "h-auto items-start justify-start gap-2 rounded-lg p-3 text-left transition-colors",
                    !isPrivate
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-background/40 hover:bg-muted",
                  )}
                >
                  <Globe className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium">
                      {t("createRemote.public")}
                      {!isPrivate && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                    <div className="text-[0.7rem] text-muted-foreground">
                      {t("createRemote.publicHint")}
                    </div>
                  </div>
                </Button>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {t("createRemote.pushLabel")}
                  </div>
                  <div className="text-[0.7rem] text-muted-foreground">
                    {t("createRemote.pushHint")}
                  </div>
                </div>
                <Switch
                  checked={pushAfter}
                  onCheckedChange={(v) => setPushAfter(!!v)}
                  disabled={busy}
                />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={dismiss}
                  disabled={busy}
                >
                  {t("createRemote.cancel")}
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {busy
                    ? t("createRemote.creating")
                    : t("createRemote.createButton")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
