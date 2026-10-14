import { invoke } from "@tauri-apps/api/core";
import { Globe, KeyRound, Loader2, Terminal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastError } from "@/lib/error-toast";
import { useHubStore, type ConnectMethod } from "@/lib/hub/store";
import type { HubAccount, HubProviderId } from "@/lib/hub/types";
import { cn } from "@/lib/utils";

import { openExternal, ProviderMark } from "./hub-bits";

type Choice = { id: string; provider: HubProviderId | null; host: string; label: string };

const CHOICES: Choice[] = [
  { id: "github", provider: "github", host: "github.com", label: "GitHub" },
  { id: "gitlab", provider: "gitlab", host: "gitlab.com", label: "GitLab" },
  { id: "bitbucket", provider: "bitbucket", host: "bitbucket.org", label: "Bitbucket" },
  { id: "custom", provider: null, host: "", label: "" },
];

function tokenUrl(provider: HubProviderId | null, host: string): string | null {
  if (provider === "github" || host.includes("github"))
    return `https://${host}/settings/tokens/new?description=l8git&scopes=repo,read:org,read:user,user:email,workflow,notifications,gist`;
  if (provider === "gitlab" || host.includes("gitlab"))
    return `https://${host}/-/user_settings/personal_access_tokens?name=l8git&scopes=api,read_user`;
  if (provider === "bitbucket") return "https://bitbucket.org/account/settings/app-passwords/new";
  return null;
}

type Device = { device_code: string; user_code: string; verification_uri: string; interval: number; expires_in: number };

export function HubConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const connect = useHubStore((s) => s.connect);
  const addAccounts = useHubStore((s) => s.addAccounts);
  const [choice, setChoice] = useState<Choice>(CHOICES[0]);
  const [customHost, setCustomHost] = useState("");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [oauth, setOauth] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const pollRef = useRef<number | null>(null);
  // Bumped on close so an in-flight poll cannot reschedule itself.
  const genRef = useRef(0);

  const host = choice.id === "custom" ? customHost.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : choice.host;
  const isGithub = choice.provider === "github" || (choice.id === "custom" && host.includes("github"));

  useEffect(() => {
    void invoke<boolean>("hub_oauth_available").then(setOauth, () => setOauth(false));
  }, []);

  const stopPolling = () => {
    genRef.current++;
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      stopPolling();
      setDevice(null);
      setBusy(null);
      setToken("");
    }
    return stopPolling;
  }, [open]);

  function done(list: HubAccount[]) {
    toast.success(t("hub.connect.connected", { names: list.map((a) => a.login).join(", ") }));
    onOpenChange(false);
  }

  async function run(method: ConnectMethod) {
    if (!host) return;
    setBusy(method);
    try {
      if (method === "git") {
        // Opens the credential manager's browser login when nothing is stored yet.
        await invoke("git_sign_in_via_credential_manager", { host });
      }
      done(await connect(host, method, token, username));
    } catch (e) {
      const msg = String(e);
      if (msg.includes("__GH_MISSING__")) {
        toast.error(t("hub.connect.ghMissing"), {
          action: { label: t("hub.connect.ghInstall"), onClick: () => openExternal("https://cli.github.com") },
        });
      } else toastError(msg);
    } finally {
      setBusy(null);
    }
  }

  async function startOauth() {
    setBusy("oauth");
    try {
      const d = await invoke<Device>("hub_oauth_start");
      setDevice(d);
      void navigator.clipboard?.writeText(d.user_code).catch(() => {});
      openExternal(d.verification_uri);
      const deadline = Date.now() + d.expires_in * 1000;
      const interval = d.interval;
      const gen = genRef.current;
      const tick = async () => {
        if (gen !== genRef.current) return;
        if (Date.now() > deadline) {
          setDevice(null);
          setBusy(null);
          toastError(t("hub.connect.oauthExpired"));
          return;
        }
        try {
          const acc = await invoke<HubAccount | null>("hub_oauth_poll", { deviceCode: d.device_code });
          if (acc) {
            addAccounts([acc]);
            setDevice(null);
            setBusy(null);
            done([acc]);
            return;
          }
        } catch (e) {
          setDevice(null);
          setBusy(null);
          toastError(String(e));
          return;
        }
        if (gen !== genRef.current) return;
        pollRef.current = window.setTimeout(() => void tick(), interval * 1000);
      };
      pollRef.current = window.setTimeout(() => void tick(), interval * 1000);
    } catch (e) {
      setBusy(null);
      toastError(String(e));
    }
  }

  const tokenLink = tokenUrl(choice.provider, host);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hub.connect.title")}</DialogTitle>
          <DialogDescription>{t("hub.connect.lead")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-1.5">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChoice(c)}
              aria-pressed={choice.id === c.id}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs transition-colors",
                choice.id === c.id ? "border-foreground/40 bg-muted" : "border-border/60 text-muted-foreground hover:bg-muted/50",
              )}
            >
              {c.provider ? <ProviderMark provider={c.provider} className="size-5" /> : <Globe className="size-5" />}
              {c.provider ? c.label : t("hub.connect.customHost")}
            </button>
          ))}
        </div>

        {choice.id === "custom" && (
          <div className="grid gap-1.5">
            <Label htmlFor="hub-host">{t("hub.connect.hostLabel")}</Label>
            <Input id="hub-host" value={customHost} onChange={(e) => setCustomHost(e.target.value)} placeholder="git.example.com" spellCheck={false} />
          </div>
        )}

        {device ? (
          <div className="grid place-items-center gap-3 rounded-xl border border-border/60 bg-muted/30 p-5 text-center">
            <p className="text-xs text-muted-foreground">{t("hub.connect.oauthEnterCode")}</p>
            <code className="font-mono text-2xl tracking-[0.3em]">{device.user_code}</code>
            <Button variant="outline" size="sm" onClick={() => openExternal(device.verification_uri)}>
              {device.verification_uri}
            </Button>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("hub.connect.oauthWaiting")}
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {isGithub && choice.id === "github" && oauth && (
              <Method icon={<ProviderMark provider="github" className="size-4" />} title={t("hub.connect.oauth")} hint={t("hub.connect.oauthHint")} busy={busy === "oauth"} disabled={!!busy} onClick={startOauth} primary />
            )}
            {isGithub && (
              <Method icon={<Terminal className="size-4" />} title={t("hub.connect.gh")} hint={t("hub.connect.ghHint")} busy={busy === "gh"} disabled={!!busy || !host} onClick={() => run("gh")} />
            )}
            <Method icon={<Globe className="size-4" />} title={t("hub.connect.browser")} hint={t("hub.connect.browserHint")} busy={busy === "git"} disabled={!!busy || !host} onClick={() => run("git")} />

            <form
              className="mt-1 grid gap-2 rounded-xl border border-border/60 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run("token");
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <KeyRound className="size-4" />
                  {t("hub.connect.token")}
                </span>
                {tokenLink && (
                  <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => openExternal(tokenLink)}>
                    {t("hub.connect.createToken")}
                  </button>
                )}
              </div>
              {choice.provider === "bitbucket" && (
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("hub.connect.bitbucketUser")} autoComplete="off" spellCheck={false} />
              )}
              <div className="flex gap-2">
                <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("hub.connect.tokenPlaceholder")} autoComplete="off" spellCheck={false} />
                <Button type="submit" disabled={!!busy || !token.trim() || !host}>
                  {busy === "token" ? <Loader2 className="size-4 animate-spin" /> : t("hub.connect.connect")}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Method({ icon, title, hint, busy, disabled, onClick, primary }: { icon: ReactNode; title: string; hint: string; busy: boolean; disabled: boolean; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50",
        primary ? "border-foreground/20 bg-foreground text-background hover:bg-foreground/90" : "border-border/60 hover:bg-muted/50",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted/20">{busy ? <Loader2 className="size-4 animate-spin" /> : icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className={cn("block text-xs", primary ? "text-background/70" : "text-muted-foreground")}>{hint}</span>
      </span>
    </button>
  );
}
