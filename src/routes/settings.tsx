import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  FolderOpen,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Sun,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { AddGitAccount } from "@/components/repo/add-git-account";
import { GitAccountRow } from "@/components/repo/git-account-row";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { useGitAccounts } from "@/lib/git-accounts";
import { useTheme } from "@/lib/use-theme";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function Settings() {
  const { theme, setTheme } = useTheme();
  const {
    accounts,
    helper,
    loading,
    refreshing,
    refresh,
    signIn,
    signInViaCredentialManager,
    signOut,
    addCustomHost,
    removeCustomHost,
  } = useGitAccounts();
  const [addOpen, setAddOpen] = useState(false);
  const messageTemplate = useCommitPrefs((s) => s.messageTemplate);
  const setMessageTemplate = useCommitPrefs((s) => s.setMessageTemplate);
  const [commitTemplateDraft, setCommitTemplateDraft] = useState(
    messageTemplate,
  );

  useEffect(() => {
    setCommitTemplateDraft(messageTemplate);
  }, [messageTemplate]);

  const signedInAccounts = accounts.filter((a) => a.signed_in);
  const commitTemplateDirty = commitTemplateDraft !== messageTemplate;

  const ideLaunchCommand = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const setIdeLaunchCommand = useWorkspacePrefs((s) => s.setIdeLaunchCommand);
  const [ideDraft, setIdeDraft] = useState(ideLaunchCommand);

  useEffect(() => {
    setIdeDraft(ideLaunchCommand);
  }, [ideLaunchCommand]);

  const ideDirty = ideDraft !== ideLaunchCommand;

  async function pickIdeExecutable() {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "IDE-Programm auswählen",
    });
    if (!selected || typeof selected !== "string") return;
    setIdeDraft(selected);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>
            Wähle, wie gitit aussieht. „System“ folgt deiner OS-Einstellung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-3 gap-3"
          >
            {THEMES.map(({ value, label, icon: Icon }) => {
              const active = theme === value;
              return (
                <Button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  variant={active ? "default" : "outline"}
                  onClick={() => setTheme(value)}
                  className={cn(
                    "h-auto flex-col gap-2 py-4",
                    active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm">{label}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commit-Nachricht</CardTitle>
          <CardDescription>
            Standardvorlage für das Commit-Feld in allen Repositories. Leer
            lassen, wenn keine Vorlage verwendet werden soll.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={commitTemplateDraft}
            onChange={(e) => setCommitTemplateDraft(e.target.value)}
            rows={6}
            placeholder={"z. B. kurze Überschrift\n\n- \n"}
            className="font-mono text-sm min-h-[140px]"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!commitTemplateDirty}
              onClick={() => setMessageTemplate(commitTemplateDraft)}
            >
              Speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IDE & Workspace</CardTitle>
          <CardDescription>
            Befehl zum Öffnen des Repository-Ordners in deiner IDE. Der
            Repository-Pfad wird automatisch als letztes Argument angehängt.
            Beispiele:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">cursor</code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">code</code>
            ,{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              open -a Cursor
            </code>{" "}
            (macOS).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={ideDraft}
              onChange={(e) => setIdeDraft(e.target.value)}
              placeholder="cursor"
              className="min-w-0 flex-1 font-mono text-sm"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-2"
              onClick={() => void pickIdeExecutable()}
            >
              <FolderOpen className="size-4" />
              Auswählen
            </Button>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!ideDirty}
              onClick={() => setIdeLaunchCommand(ideDraft)}
            >
              Speichern
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Git-Konten</CardTitle>
          <CardDescription>
            Übersicht deiner angemeldeten Git-Anbieter.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void refresh()}
                aria-label="Aktualisieren"
                disabled={loading || refreshing}
              >
                <RefreshCw
                  className={cn((loading || refreshing) && "animate-spin")}
                />
              </Button>
              <Button
                type="button"
                variant="default"
                size="icon-sm"
                onClick={() => setAddOpen(true)}
                aria-label="Konto hinzufügen"
              >
                <Plus />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {!helper && !loading && !refreshing && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                Kein Git Credential Helper konfiguriert. Setze z. B. mit{" "}
                <code className="rounded bg-background/60 px-1 py-0.5">
                  git config --global credential.helper osxkeychain
                </code>
                , damit Anmeldedaten dauerhaft gespeichert werden.
              </div>
            </div>
          )}

          {helper && (
            <p className="text-xs text-muted-foreground">
              Credential Helper:{" "}
              <code className="rounded bg-muted px-1 py-0.5">{helper}</code>
            </p>
          )}

          {signedInAccounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {loading
                  ? "Lade Konten…"
                  : refreshing
                    ? "Aktualisiere…"
                    : "Keine angemeldeten Git-Konten. Füge eines über das Plus-Symbol hinzu."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {signedInAccounts.map((account) => (
                <GitAccountRow
                  key={account.id}
                  account={account}
                  onSignOut={signOut}
                  onRemoveCustom={
                    account.builtin ? undefined : removeCustomHost
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddGitAccount
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSignIn={signIn}
        onSignInViaCredentialManager={signInViaCredentialManager}
        onAddCustomHost={addCustomHost}
        existingHosts={signedInAccounts.map((a) => a.host)}
      />
    </main>
  );
}
