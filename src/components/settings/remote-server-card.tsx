import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@tauri-apps/api/core";
import { open as pickDirectory } from "@tauri-apps/plugin-dialog";
import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type RemoteStatus = {
  running: boolean;
  managed: boolean;
  port: number;
  relay: string | null;
  roots: string[];
  binary: string | null;
  configPath: string | null;
};

type Pairing = { qr: string; json: string };

export function RemoteServerCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [port, setPort] = useState("");
  const [relay, setRelay] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<Pairing | null>(null);

  const apply = useCallback((next: RemoteStatus) => {
    setStatus(next);
    setPort(String(next.port));
    setRelay(next.relay ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const next = await invoke<RemoteStatus>("remote_status");
      if (active) setStatus(next);
    };
    void invoke<RemoteStatus>("remote_status").then((next) => {
      if (active) apply(next);
    });
    const id = setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [apply]);

  const run = async (cmd: string, args?: Record<string, unknown>) => {
    setBusy(true);
    try {
      apply(await invoke<RemoteStatus>(cmd, args));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const addRoot = async () => {
    const picked = await pickDirectory({ directory: true, multiple: false });
    if (typeof picked === "string") await run("remote_add_root", { path: picked });
  };

  const showPairing = async () => {
    setBusy(true);
    try {
      setPairing(await invoke<Pairing>("remote_pair"));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("remoteServer.title")}
          <Badge variant={status?.running ? "default" : "secondary"}>
            {status?.running ? t("remoteServer.running") : t("remoteServer.stopped")}
          </Badge>
        </CardTitle>
        <CardDescription>{t("remoteServer.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="remote-server-port">{t("remoteServer.portLabel")}</Label>
            <Input
              id="remote-server-port"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remote-server-relay">{t("remoteServer.relayLabel")}</Label>
            <Input
              id="remote-server-relay"
              placeholder="wss://relay.example"
              value={relay}
              onChange={(e) => setRelay(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("remoteServer.rootsLabel")}</Label>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void addRoot()}>
              <Plus />
              {t("remoteServer.addRoot")}
            </Button>
          </div>
          {status?.roots.length ? (
            <ul className="space-y-1">
              {status.roots.map((root) => (
                <li
                  key={root}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1"
                >
                  <span className="truncate font-mono text-xs text-foreground">{root}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("remoteServer.removeRoot")}
                    disabled={busy}
                    onClick={() => void run("remote_remove_root", { path: root })}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t("remoteServer.noRoots")}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run("remote_set_config", {
                port: Number(port) || 0,
                relay: relay.trim() || null,
              })
            }
          >
            {t("remoteServer.save")}
          </Button>
          {status?.running ? (
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !status.managed}
              title={status.managed ? undefined : t("remoteServer.external")}
              onClick={() => void run("remote_stop")}
            >
              {t("remoteServer.stop")}
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={() => void run("remote_start")}>
              {t("remoteServer.start")}
            </Button>
          )}
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void showPairing()}>
            {t("remoteServer.pair")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {status?.binary
            ? t("remoteServer.binary", { path: status.binary })
            : t("remoteServer.binaryMissing")}
        </p>

        <Dialog open={pairing !== null} onOpenChange={(open) => !open && setPairing(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("remoteServer.pairTitle")}</DialogTitle>
              <DialogDescription>{t("remoteServer.pairDesc")}</DialogDescription>
            </DialogHeader>
            <pre className="overflow-auto rounded-md bg-black p-3 text-center font-mono text-[8px] leading-[8px] text-white">
              {pairing?.qr}
            </pre>
            <p className="break-all font-mono text-[10px] text-muted-foreground">{pairing?.json}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(pairing?.json ?? "");
                toast.success(t("remoteServer.copied"));
              }}
            >
              {t("remoteServer.copyJson")}
            </Button>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
