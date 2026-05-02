import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toastError } from "@/lib/error-toast";
import { useGitAccounts } from "@/lib/git-accounts";
import type { RemoteRepo } from "@/lib/remote-repo";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { ChevronLeft, FolderOpen, Github, Gitlab, Link2, Loader2, Server, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CloneRemoteRepoList } from "./clone-remote-repo-list";

const SPINNER_DELAY_MS = 200;

function defaultFolderFromUrl(url: string): string {
  const u = url.trim().replace(/\.git$/i, "").replace(/\/$/, "");
  const noQuery = u.split("?")[0] ?? u;
  const parts = noQuery.split(/[/:]/).filter(Boolean);
  const last = parts[parts.length - 1];
  return last && last.length > 0 ? last : "repo";
}

type Mode = "pick" | "url" | "remote" | "dest";

const API_HOSTS = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
} as const;

const BUILTIN_API_HOSTS = new Set<string>(Object.values(API_HOSTS));

type PlatformCardProps = {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  onClick: () => void;
};

function PlatformCard({ icon, label, sublabel, disabled, onClick }: PlatformCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-border/80 hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground transition-colors group-hover:bg-muted/80">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {sublabel && (
          <span className="block truncate text-xs text-muted-foreground">{sublabel}</span>
        )}
      </span>
      {disabled && (
        <span className="shrink-0 text-xs text-muted-foreground">nicht angemeldet</span>
      )}
    </button>
  );
}

export function CloneRepoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { accounts, refresh } = useGitAccounts();
  const cloneRepo = useRepoStore((s) => s.cloneRepo);

  const [mode, setMode] = useState<Mode>("pick");
  const [cloneUrl, setCloneUrl] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [folderName, setFolderName] = useState("repo");
  const [apiHost, setApiHost] = useState<string | null>(null);
  const [repos, setRepos] = useState<RemoteRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [pickedRepo, setPickedRepo] = useState<RemoteRepo | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  const customRemoteAccounts = accounts.filter(
    (a) => a.signed_in && !BUILTIN_API_HOSTS.has(a.host),
  );

  const reset = useCallback(() => {
    setMode("pick");
    setCloneUrl("");
    setParentDir("");
    setFolderName("repo");
    setApiHost(null);
    setRepos([]);
    setReposLoading(false);
    setPickedRepo(null);
    setBusy(false);
    setShowSpinner(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    void refresh({ silent: true });
  }, [open, refresh, reset]);

  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setShowSpinner(false);
    };
  }, [busy]);

  useEffect(() => {
    if (!open || mode !== "remote" || !apiHost) return;
    let cancel = false;
    setReposLoading(true);
    void (async () => {
      try {
        const list = await invoke<RemoteRepo[]>("list_remote_repos", {
          host: apiHost,
        });
        if (!cancel) setRepos(list);
      } catch (e) {
        if (!cancel) {
          toastError(String(e));
          setRepos([]);
        }
      } finally {
        if (!cancel) setReposLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, mode, apiHost]);

  const signed = (host: string) =>
    accounts.some((a) => a.host === host && a.signed_in);

  async function pickParent() {
    const selected = await pickDirectory({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    setParentDir(selected);
  }

  async function runClone() {
    const url = pickedRepo?.clone_url ?? cloneUrl.trim();
    if (!url) {
      toastError("Clone-URL fehlt.");
      return;
    }
    if (!parentDir.trim()) {
      toastError("Bitte Ziel-Ordner wählen.");
      return;
    }
    const name = folderName.trim() || defaultFolderFromUrl(url);
    let dest: string;
    try {
      dest = await join(parentDir.trim(), name);
    } catch (e) {
      toastError(String(e));
      return;
    }
    setBusy(true);
    try {
      const out = await cloneRepo(url, dest);
      toast.success(out.trim() || "Repository geklont.");
      reset();
      onClose();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (busy) return;
    reset();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Repository klonen"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      onClick={dismiss}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Repository klonen</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            disabled={busy}
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {mode === "pick" && (
            <div className="grid gap-2">
              <p className="mb-1 text-xs text-muted-foreground">
                Quelle wählen — für Git-Host-Listen zuerst unter Einstellungen anmelden.
              </p>
              <PlatformCard
                icon={<Link2 className="h-4 w-4" />}
                label="Per URL"
                sublabel="Beliebige Git-Remote-URL"
                onClick={() => setMode("url")}
              />
              <PlatformCard
                icon={<Github className="h-4 w-4" />}
                label="GitHub"
                sublabel="github.com"
                disabled={!signed(API_HOSTS.github)}
                onClick={() => {
                  setApiHost(API_HOSTS.github);
                  setMode("remote");
                }}
              />
              <PlatformCard
                icon={<Gitlab className="h-4 w-4" />}
                label="GitLab"
                sublabel="gitlab.com"
                disabled={!signed(API_HOSTS.gitlab)}
                onClick={() => {
                  setApiHost(API_HOSTS.gitlab);
                  setMode("remote");
                }}
              />
              <PlatformCard
                icon={<Server className="h-4 w-4" />}
                label="Bitbucket"
                sublabel="bitbucket.org"
                disabled={!signed(API_HOSTS.bitbucket)}
                onClick={() => {
                  setApiHost(API_HOSTS.bitbucket);
                  setMode("remote");
                }}
              />
              {customRemoteAccounts.map((account) => (
                <PlatformCard
                  key={account.host}
                  icon={<Server className="h-4 w-4" />}
                  label={account.name}
                  sublabel={account.host}
                  onClick={() => {
                    setApiHost(account.host);
                    setMode("remote");
                  }}
                />
              ))}
            </div>
          )}

          {mode === "url" && (
            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => setMode("pick")}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" />
                Zurück
              </button>
              <div className="grid gap-1.5">
                <Label htmlFor="clone-url">Remote-URL</Label>
                <Input
                  id="clone-url"
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  placeholder="https://github.com/org/repo.git"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <Separator />
              <div className="grid gap-1.5">
                <Label>Zielordner</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void pickParent()}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Ordner wählen
                  </Button>
                </div>
                {parentDir && (
                  <p className="truncate text-xs text-muted-foreground" title={parentDir}>
                    {parentDir}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="clone-folder">Ordnername</Label>
                <Input
                  id="clone-folder"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>
                  Abbrechen
                </Button>
                <Button type="button" onClick={() => void runClone()} disabled={busy}>
                  {busy && showSpinner ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Klonen"
                  )}
                </Button>
              </div>
            </div>
          )}

          {mode === "remote" && (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode("pick");
                  setApiHost(null);
                  setRepos([]);
                }}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" />
                Zurück
              </button>
              {reposLoading ? (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs">Repositories laden…</span>
                </div>
              ) : (
                <CloneRemoteRepoList
                  repos={repos}
                  onPick={(r) => {
                    setPickedRepo(r);
                    setCloneUrl(r.clone_url);
                    setFolderName(r.name || defaultFolderFromUrl(r.clone_url));
                    setMode("dest");
                  }}
                />
              )}
            </div>
          )}

          {mode === "dest" && (
            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => {
                  setPickedRepo(null);
                  setMode("remote");
                }}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" />
                Zurück
              </button>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Repository</p>
                <p className="truncate text-sm font-medium">{pickedRepo?.full_name}</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Zielordner</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => void pickParent()}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Ordner wählen
                </Button>
                {parentDir && (
                  <p className="truncate text-xs text-muted-foreground" title={parentDir}>
                    {parentDir}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dest-folder">Ordnername</Label>
                <Input
                  id="dest-folder"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>
                  Abbrechen
                </Button>
                <Button type="button" onClick={() => void runClone()} disabled={busy}>
                  {busy && showSpinner ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Klonen"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
