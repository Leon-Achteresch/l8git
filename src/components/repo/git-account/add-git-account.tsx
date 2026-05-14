import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toastError } from "@/lib/error-toast";
import { cn } from "@/lib/utils";

type Provider = { id: string; name: string; host: string; builtin: boolean };

const PROVIDERS: Provider[] = [
  { id: "github", name: "GitHub", host: "github.com", builtin: true },
  { id: "github-enterprise", name: "GitHub Enterprise", host: "", builtin: false },
  { id: "gitlab", name: "GitLab", host: "gitlab.com", builtin: true },
  { id: "bitbucket", name: "Bitbucket", host: "bitbucket.org", builtin: true },
  { id: "azure", name: "Azure DevOps", host: "dev.azure.com", builtin: true },
  { id: "custom", name: "custom", host: "", builtin: false },
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
  const { t } = useTranslation();
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

  function providerLabel(p: Provider) {
    return p.id === "custom" ? t("gitAccount.customHostLabel") : p.name;
  }

  function providerSubtitle(p: Provider) {
    if (p.host) return p.host;
    if (p.id === "custom") return t("gitAccount.customHostSubtitle");
    return t("gitAccount.customHostSubtitle");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) return;
    const host = provider.builtin ? provider.host : customHost.trim();
    if (!host) {
      toastError(t("gitAccount.hostRequired"));
      return;
    }
    setBusy(true);
    try {
      if (!provider.builtin) {
        onAddCustomHost(
          customName || (provider.id === "custom" ? host : provider.name),
          host,
        );
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
      toastError(t("gitAccount.hostFirstHint"));
      return;
    }
    setBusy(true);
    try {
      if (!provider.builtin) {
        onAddCustomHost(
          customName || (provider.id === "custom" ? host : provider.name),
          host,
        );
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
      aria-label={t("gitAccount.dialogAria")}
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
                aria-label={t("gitAccount.backAria")}
              >
                <ArrowLeft />
              </Button>
            )}
            <h2 className="font-heading text-base font-medium">
              {provider ? t("gitAccount.signInAt", { name: providerLabel(provider) }) : t("gitAccount.chooseProvider")}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            aria-label={t("gitAccount.closeAria")}
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
                    {providerLabel(p).slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{providerLabel(p)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {providerSubtitle(p)}
                    </div>
                  </div>
                  {already && (
                    <span className="text-xs text-muted-foreground">
                      {t("gitAccount.alreadySignedIn")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {provider && (
          <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-3">
            {!provider.builtin && (
              <>
                <div className="grid gap-1">
                  <Label htmlFor="add-custom-name">{t("workspaceDialogs.nameLabel")}</Label>
                  <Input
                    id="add-custom-name"
                    autoComplete="off"
                    spellCheck={false}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={
                      provider.id === "github-enterprise"
                        ? provider.name
                        : t("gitAccount.providerSelfHostedExample")
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="add-custom-host">{t("gitAccount.customHostLabel")}</Label>
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
                {t("gitAccount.signInViaGcm")}
              </Button>
              <p className="text-[0.7rem] text-muted-foreground">{t("gitAccount.gcmHint")}</p>
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <Separator className="flex-1" />
              <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                {t("gitAccount.orToken")}
              </span>
              <Separator className="flex-1" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="add-user">{t("gitAccount.username")}</Label>
              <Input
                id="add-user"
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("gitAccount.usernamePlaceholder")}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="add-token">{t("gitAccount.tokenLabel")}</Label>
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
              <p className="text-[0.7rem] text-muted-foreground">{t("gitAccount.tokenSavedHint")}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={dismiss}
                disabled={busy}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? t("gitAccount.submitting") : t("gitAccount.signIn")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
