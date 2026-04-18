import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toastError } from "@/lib/error-toast";
import { cn } from "@/lib/utils";

type Provider = { id: string; name: string; host: string; builtin: boolean };

const PROVIDERS: Provider[] = [
  { id: "github", name: "GitHub", host: "github.com", builtin: true },
  { id: "gitlab", name: "GitLab", host: "gitlab.com", builtin: true },
  { id: "bitbucket", name: "Bitbucket", host: "bitbucket.org", builtin: true },
  { id: "azure", name: "Azure DevOps", host: "dev.azure.com", builtin: true },
  { id: "custom", name: "Anderer Host", host: "", builtin: false },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSignIn: (host: string, username: string, token: string) => Promise<void>;
  onSignInViaCredentialManager: (host: string) => Promise<void>;
  onAddCustomHost: (name: string, host: string) => void;
  existingHosts: string[];
};

export function AddGitAccount({
  open,
  onClose,
  onSignIn,
  onSignInViaCredentialManager,
  onAddCustomHost,
  existingHosts,
}: Props) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [customName, setCustomName] = useState("");
  const [customHost, setCustomHost] = useState("");
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function reset() {
    setProvider(null);
    setCustomName("");
    setCustomHost("");
    setUsername("");
    setToken("");
  }

  function finish() {
    reset();
    onClose();
  }

  function dismiss() {
    if (busy) return;
    finish();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) return;
    const host = provider.builtin ? provider.host : customHost.trim();
    if (!host) {
      toastError("Host darf nicht leer sein");
      return;
    }
    setBusy(true);
    try {
      if (!provider.builtin) {
        onAddCustomHost(customName || host, host);
      }
      await onSignIn(host, username.trim(), token);
      finish();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleHelperSignIn() {
    if (!provider) return;
    const host = provider.builtin ? provider.host : customHost.trim();
    if (!host) {
      toastError("Bitte zuerst den Host angeben.");
      return;
    }
    setBusy(true);
    try {
      if (!provider.builtin) {
        onAddCustomHost(customName || host, host);
      }
      await onSignInViaCredentialManager(host);
      finish();
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Git-Konto hinzufügen"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {provider && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                onClick={() => {
                  setProvider(null);
                }}
                aria-label="Zurück"
              >
                <ArrowLeft />
              </Button>
            )}
            <h2 className="font-heading text-base font-medium">
              {provider ? `Bei ${provider.name} anmelden` : "Anbieter auswählen"}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label="Schließen"
          >
            <X />
          </Button>
        </header>

        {!provider && (
          <div className="grid gap-1.5">
            {PROVIDERS.map((p) => {
              const already =
                p.builtin && existingHosts.includes(p.host);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={already}
                  onClick={() => setProvider(p)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-border bg-background/40 p-2.5 text-left transition-colors hover:bg-muted",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                >
                  <div
                    className="grid size-8 place-items-center rounded-md border border-border bg-muted text-xs font-semibold uppercase text-muted-foreground"
                    aria-hidden
                  >
                    {p.name.slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.host || "Benutzerdefinierter Host"}
                    </div>
                  </div>
                  {already && (
                    <span className="text-xs text-muted-foreground">
                      bereits angemeldet
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {provider && (
          <form onSubmit={handleSubmit} className="grid gap-3">
            {!provider.builtin && (
              <>
                <div className="grid gap-1">
                  <Label htmlFor="add-custom-name">Name</Label>
                  <Input
                    id="add-custom-name"
                    autoComplete="off"
                    spellCheck={false}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Self-hosted GitLab"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="add-custom-host">Host</Label>
                  <Input
                    id="add-custom-host"
                    autoComplete="off"
                    spellCheck={false}
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    placeholder="git.example.com"
                    required
                  />
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void handleHelperSignIn()}
              >
                Über Credential Manager anmelden
              </Button>
              <p className="text-[0.7rem] text-muted-foreground">
                Öffnet den Git Credential Manager (z. B. Browser-Login bei GitLab).
              </p>
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <Separator className="flex-1" />
              <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                oder Token
              </span>
              <Separator className="flex-1" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="add-user">Benutzername</Label>
              <Input
                id="add-user"
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="z. B. octocat"
                required
                autoFocus
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="add-token">Personal Access Token</Label>
              <Input
                id="add-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                required
              />
              <p className="text-[0.7rem] text-muted-foreground">
                Der Token wird im Git Credential Helper gespeichert.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={dismiss}
                disabled={busy}
              >
                Abbrechen
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Speichere…" : "Anmelden"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
