import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { useJiraStore } from "@/lib/jira/jira-store";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function JiraCard() {
  const { t } = useTranslation();
  const enabled = useJiraStore((state) => state.enabled);
  const setEnabled = useJiraStore((state) => state.setEnabled);
  const allowSearch = useJiraStore((state) => state.allowSearch);
  const setAllowSearch = useJiraStore((state) => state.setAllowSearch);
  const allowComments = useJiraStore((state) => state.allowComments);
  const setAllowComments = useJiraStore((state) => state.setAllowComments);
  const status = useJiraStore((state) => state.status);
  const statusLoaded = useJiraStore((state) => state.statusLoaded);
  const refreshStatus = useJiraStore((state) => state.refreshStatus);
  const saveCredentials = useJiraStore((state) => state.saveCredentials);
  const deleteCredentials = useJiraStore((state) => state.deleteCredentials);
  const testConnection = useJiraStore((state) => state.testConnection);

  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!statusLoaded) return;
    setBaseUrl((current) => current || status.baseUrl);
    setEmail((current) => current || status.email);
  }, [status.baseUrl, status.email, statusLoaded]);

  const canSave = Boolean(baseUrl.trim() && email.trim() && token.trim());

  const save = async () => {
    setBusy("save");
    try {
      await saveCredentials(baseUrl.trim(), email.trim(), token);
      // The token is in the keychain now; drop the plaintext copy from the DOM.
      setToken("");
      setTokenVisible(false);
      toast.success(t("jira.savedToast"));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const account = await testConnection();
      toast.success(t("jira.testOkToast", { name: account.displayName || account.email }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await deleteCredentials();
      setToken("");
      toast.success(t("jira.deletedToast"));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("jira.settingsTitle")}</CardTitle>
        <CardDescription>{t("jira.settingsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="jira-enabled" className="text-sm font-medium text-foreground">
              {t("jira.enabledLabel")}
            </Label>
            <p className="text-xs leading-relaxed text-muted-foreground">{t("jira.enabledHint")}</p>
          </div>
          <Switch id="jira-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="jira-base-url" className="text-sm font-medium">
            {t("jira.baseUrlLabel")}
          </Label>
          <Input
            id="jira-base-url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://acme.atlassian.net"
            className="font-mono text-sm"
            spellCheck={false}
            autoCorrect="off"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">{t("jira.baseUrlHint")}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="jira-email" className="text-sm font-medium">
            {t("jira.emailLabel")}
          </Label>
          <Input
            id="jira-email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="font-mono text-sm"
            spellCheck={false}
            autoCorrect="off"
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="jira-token" className="text-sm font-medium">
            {t("jira.tokenLabel")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="jira-token"
              type={tokenVisible ? "text" : "password"}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={status.configured ? status.tokenHint : t("jira.tokenPlaceholder")}
              className="min-w-0 flex-1 font-mono text-sm"
              spellCheck={false}
              autoCorrect="off"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => setTokenVisible((visible) => !visible)}
              aria-label={tokenVisible ? t("jira.tokenHide") : t("jira.tokenShow")}
            >
              {tokenVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("jira.tokenHint")}</span>
          </p>
        </div>

        {status.configured ? (
          <p className="flex items-center gap-1.5 text-xs text-git-added">
            <CheckCircle2 className="size-3.5" />
            {t("jira.configuredHint", { email: status.email, hint: status.tokenHint })}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {status.configured ? (
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void remove()}>
              <Trash2 className="size-4" />
              {t("jira.deleteButton")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || !status.configured}
            onClick={() => void test()}
          >
            {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("jira.testButton")}
          </Button>
          <Button type="button" disabled={busy !== null || !canSave} onClick={() => void save()}>
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </div>

        <div className="space-y-4 border-t pt-4">
          <p className="text-sm font-medium text-foreground">{t("jira.scopeTitle")}</p>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="jira-allow-comments" className="text-sm font-medium text-foreground">
                {t("jira.allowCommentsLabel")}
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("jira.allowCommentsHint")}
              </p>
            </div>
            <Switch
              id="jira-allow-comments"
              checked={allowComments}
              onCheckedChange={setAllowComments}
              disabled={!enabled}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="jira-allow-search" className="text-sm font-medium text-foreground">
                {t("jira.allowSearchLabel")}
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("jira.allowSearchHint")}
              </p>
            </div>
            <Switch
              id="jira-allow-search"
              checked={allowSearch}
              onCheckedChange={setAllowSearch}
              disabled={!enabled}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("jira.readOnlyNote")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("jira.toolNote")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
