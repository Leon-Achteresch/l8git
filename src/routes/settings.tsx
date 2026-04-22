import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  Sun,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { StaggerCard } from "@/components/motion/stagger-card";
import { AddGitAccount } from "@/components/repo/git-account/add-git-account";
import { GitAccountRow } from "@/components/repo/git-account/git-account-row";
import { AnimationsCard } from "@/components/settings/animations-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkForAppUpdate } from "@/lib/app-updater";
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
  const router = useRouter();
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
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const messageTemplate = useCommitPrefs((s) => s.messageTemplate);
  const setMessageTemplate = useCommitPrefs((s) => s.setMessageTemplate);
  const showConventionalCommitIcons = useCommitPrefs(
    (s) => s.showConventionalCommitIcons,
  );
  const setShowConventionalCommitIcons = useCommitPrefs(
    (s) => s.setShowConventionalCommitIcons,
  );
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

  async function handleUpdateCheck() {
    setCheckingForUpdates(true);
    try {
      await checkForAppUpdate({ manual: true });
    } finally {
      setCheckingForUpdates(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => router.history.back()}
          aria-label="Zurück"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">Einstellungen</h1>
      </div>

      <StaggerCard index={0}>
        <Card>
          <CardHeader>
            <CardTitle>Darstellung</CardTitle>
            <CardDescription>
              Wähle, wie l8git aussieht. „System“ folgt deiner OS-Einstellung.
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
                      active &&
                        "ring-2 ring-ring ring-offset-2 ring-offset-background",
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
      </StaggerCard>

      <StaggerCard index={1}>
        <AnimationsCard />
      </StaggerCard>

      <StaggerCard index={2}>
        <Card>
          <CardHeader>
            <CardTitle>App-Updates</CardTitle>
            <CardDescription>
              Releases werden automatisch ueber GitHub bereitgestellt. Neue
              Versionen koennen direkt aus der App heruntergeladen und
              installiert werden.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={checkingForUpdates}
              onClick={() => void handleUpdateCheck()}
            >
              <RefreshCw
                className={cn("size-4", checkingForUpdates && "animate-spin")}
              />
              Nach Updates suchen
            </Button>
          </CardContent>
        </Card>
      </StaggerCard>

      <StaggerCard index={3}>
        <Card>
          <CardHeader>
            <CardTitle>Commit-Historie</CardTitle>
            <CardDescription>
              Optionale Kennzeichnung nach Conventional Commits (Typ-Icons,
              BREAKING CHANGE /{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                !
              </code>{" "}
              vor dem Doppelpunkt).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <Checkbox
                id="conventional-commit-icons"
                checked={showConventionalCommitIcons}
                onCheckedChange={(v) =>
                  setShowConventionalCommitIcons(v === true)
                }
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="conventional-commit-icons"
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  Conventional-Commit-Symbole anzeigen
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Wenn ausgeschaltet, werden in der Commit-Liste keine Typ-
                  oder Breaking-Hinweise als Symbole gerendert.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </StaggerCard>

      <StaggerCard index={4}>
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
      </StaggerCard>

      <StaggerCard index={5}>
        <Card>
          <CardHeader>
            <CardTitle>IDE & Workspace</CardTitle>
            <CardDescription>
              Befehl zum Öffnen des Repository-Ordners in deiner IDE. Der
              Repository-Pfad wird automatisch als letztes Argument angehängt.
              Beispiele:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                cursor
              </code>
              ,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                code
              </code>
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
      </StaggerCard>

      <StaggerCard index={6}>
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
      </StaggerCard>

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
