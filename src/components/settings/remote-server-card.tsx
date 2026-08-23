import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@tauri-apps/api/core";
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

export function RemoteServerCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [port, setPort] = useState("");
  const [relay, setRelay] = useState("");
  const [busy, setBusy] = useState(false);

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
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {status?.binary
            ? t("remoteServer.binary", { path: status.binary })
            : t("remoteServer.binaryMissing")}
          {status?.roots.length
            ? ` · ${t("remoteServer.roots", { count: status.roots.length })}`
            : ` · ${t("remoteServer.noRoots")}`}
        </p>
      </CardContent>
    </Card>
  );
}
