import { createFileRoute, useRouter } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  FolderOpen,
  Monitor,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  Sun,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { StaggerCard } from "@/components/motion/stagger-card";
import { AddGitAccount } from "@/components/repo/git-account/add-git-account";
import { GitAccountRow } from "@/components/repo/git-account/git-account-row";
import { AnimationsCard } from "@/components/settings/animations-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkForAppUpdate } from "@/lib/app-updater";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { DEFAULT_AI_PROMPT_TEMPLATE } from "@/lib/ai-commit";
import { useGitAccounts } from "@/lib/git-accounts";
import type { Theme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";
import {
  useWorkspacePrefs,
  type RepoTerminalKind,
} from "@/lib/workspace-prefs";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const REPO_TERMINAL_OPTIONS: { value: RepoTerminalKind; label: string }[] = [
  { value: "default", label: "Standard-Terminal" },
  { value: "git_bash", label: "Git Bash" },
];

const NAV_ITEMS = [
  { id: "darstellung", label: "Darstellung", icon: Palette },
  { id: "animationen", label: "Animationen", icon: Zap },
  { id: "commits", label: "Commits", icon: FileText },
  { id: "workspace", label: "Workspace", icon: Terminal },
  { id: "konten", label: "Git-Konten", icon: Users },
  { id: "updates", label: "Updates", icon: Download },
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
  const aiPromptTemplate = useCommitPrefs((s) => s.aiPromptTemplate);
  const setAiPromptTemplate = useCommitPrefs((s) => s.setAiPromptTemplate);
  const aiOutputLanguage = useCommitPrefs((s) => s.aiOutputLanguage);
  const setAiOutputLanguage = useCommitPrefs((s) => s.setAiOutputLanguage);

  const [commitTemplateDraft, setCommitTemplateDraft] =
    useState(messageTemplate);
  const [aiPromptDraft, setAiPromptDraft] = useState(aiPromptTemplate);
  const [aiLanguageDraft, setAiLanguageDraft] = useState(aiOutputLanguage);

  useEffect(() => {
    setCommitTemplateDraft(messageTemplate);
  }, [messageTemplate]);

  useEffect(() => {
    setAiPromptDraft(aiPromptTemplate);
  }, [aiPromptTemplate]);

  useEffect(() => {
    setAiLanguageDraft(aiOutputLanguage);
  }, [aiOutputLanguage]);

  const signedInAccounts = accounts.filter((a) => a.signed_in);
  const commitTemplateDirty = commitTemplateDraft !== messageTemplate;
  const aiPromptDirty = aiPromptDraft !== aiPromptTemplate || aiLanguageDraft !== aiOutputLanguage;

  const ideLaunchCommand = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const setIdeLaunchCommand = useWorkspacePrefs((s) => s.setIdeLaunchCommand);
  const repoTerminalKind = useWorkspacePrefs((s) => s.repoTerminalKind);
  const setRepoTerminalKind = useWorkspacePrefs((s) => s.setRepoTerminalKind);
  const [ideDraft, setIdeDraft] = useState(ideLaunchCommand);

  useEffect(() => {
    setIdeDraft(ideLaunchCommand);
  }, [ideLaunchCommand]);

  const ideDirty = ideDraft !== ideLaunchCommand;

  const mainRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeSection, setActiveSection] = useState("darstellung");

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { root: main, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );

    const els = Object.values(sectionRefs.current);
    els.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  function scrollToSection(id: string) {
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setActiveSection(id);
  }

  function setRef(id: string) {
    return (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    };
  }

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
    <div className="flex h-full overflow-hidden bg-background">
      <aside className="w-56 shrink-0 border-r border-border flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.history.back()}
            className="gap-1.5 text-muted-foreground hover:text-foreground -ml-1 h-8"
          >
            <ArrowLeft className="size-3.5" />
            Zurück
          </Button>
        </div>

        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Einstellungen
          </p>
        </div>

        <nav className="flex-1 px-2 pb-4 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToSection(id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                activeSection === id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="px-10 py-10 space-y-14 max-w-4xl">
          <section
            id="darstellung"
            ref={setRef("darstellung")}
            className="scroll-mt-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Palette className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-none">
                  Darstellung
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Erscheinungsbild der App anpassen
                </p>
              </div>
            </div>

            <StaggerCard index={0}>
              <Card>
                <CardHeader>
                  <CardTitle>Theme</CardTitle>
                  <CardDescription>
                    „System" folgt deiner OS-Einstellung.
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
          </section>

          <div className="border-t border-border/50" />

          <section
            id="animationen"
            ref={setRef("animationen")}
            className="scroll-mt-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Zap className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-none">
                  Animationen
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Übergänge und Bewegungseffekte
                </p>
              </div>
            </div>

            <StaggerCard index={1}>
              <AnimationsCard />
            </StaggerCard>
          </section>

          <div className="border-t border-border/50" />

          <section
            id="commits"
            ref={setRef("commits")}
            className="scroll-mt-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <FileText className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-none">
                  Commits
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Commit-Darstellung und Nachrichtenvorlage
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <StaggerCard index={2}>
                <Card>
                  <CardHeader>
                    <CardTitle>Commit-Historie</CardTitle>
                    <CardDescription>
                      Optionale Kennzeichnung nach Conventional Commits
                      (Typ-Icons, BREAKING CHANGE /{" "}
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
                          Wenn ausgeschaltet, werden in der Commit-Liste keine
                          Typ- oder Breaking-Hinweise als Symbole gerendert.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={3}>
                <Card>
                  <CardHeader>
                    <CardTitle>Commit-Nachricht</CardTitle>
                    <CardDescription>
                      Standardvorlage für das Commit-Feld in allen
                      Repositories. Die KI übernimmt dieselbe Struktur bei der
                      automatischen Commit-Nachricht, wenn gesetzt. Leer lassen,
                      wenn keine Vorlage verwendet werden soll.
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

              <StaggerCard index={4}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-muted-foreground" />
                      <CardTitle>AI Commit-Nachricht</CardTitle>
                    </div>
                    <CardDescription>
                      Anweisungen und Ausgabesprache für die automatische
                      Commit-Generierung. Leer lassen, um die Standard-Vorlage
                      zu verwenden.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-language" className="text-sm font-medium">
                        Ausgabesprache
                      </Label>
                      <Input
                        id="ai-language"
                        value={aiLanguageDraft}
                        onChange={(e) => setAiLanguageDraft(e.target.value)}
                        placeholder="English"
                        className="font-mono text-sm"
                        spellCheck={false}
                        autoCorrect="off"
                      />
                      <p className="text-xs text-muted-foreground">
                        z. B. „German", „Deutsch", „French", „English" (Standard)
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-prompt" className="text-sm font-medium">
                        System-Prompt
                      </Label>
                      <Textarea
                        id="ai-prompt"
                        value={aiPromptDraft}
                        onChange={(e) => setAiPromptDraft(e.target.value)}
                        rows={8}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATE}
                        className="font-mono text-sm min-h-[180px]"
                        spellCheck={false}
                      />
                      <p className="text-xs text-muted-foreground">
                        Leer lassen, um den Standard-Prompt zu verwenden.
                        Ausgabesprache und Commit-Vorlage werden zusätzlich als
                        feste Vorgaben ergänzt.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={!aiPromptDirty}
                        onClick={() => {
                          setAiPromptTemplate(aiPromptDraft);
                          setAiOutputLanguage(aiLanguageDraft);
                        }}
                      >
                        Speichern
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>
            </div>
          </section>

          <div className="border-t border-border/50" />

          <section
            id="workspace"
            ref={setRef("workspace")}
            className="scroll-mt-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Terminal className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-none">
                  Workspace
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  IDE-Befehl und Terminal-Einstellungen
                </p>
              </div>
            </div>

            <StaggerCard index={4}>
              <Card>
                <CardHeader>
                  <CardTitle>IDE & Workspace</CardTitle>
                  <CardDescription>
                    Befehl zum Öffnen des Repository-Ordners in deiner IDE. Der
                    Repository-Pfad wird automatisch als letztes Argument
                    angehängt. Beispiele:{" "}
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
                  <div className="space-y-2 border-t border-border pt-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Terminal im Repository
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Wird von der Schaltfläche „Terminal" in der
                        Remote-Ansicht verwendet. Git Bash bezieht sich auf die
                        Installation von Git for Windows; auf macOS und Linux
                        bleibt es beim Standard-Terminal.
                      </p>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Repository-Terminal"
                      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                      {REPO_TERMINAL_OPTIONS.map(({ value, label }) => {
                        const active = repoTerminalKind === value;
                        return (
                          <Button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            variant={active ? "default" : "outline"}
                            onClick={() => setRepoTerminalKind(value)}
                            className={cn(
                              "h-auto justify-center py-3",
                              active &&
                                "ring-2 ring-ring ring-offset-2 ring-offset-background",
                            )}
                          >
                            <span className="text-sm">{label}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </StaggerCard>
          </section>

          <div className="border-t border-border/50" />

          <section
            id="konten"
            ref={setRef("konten")}
            className="scroll-mt-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Users className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-none">
                  Git-Konten
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Angemeldete Git-Anbieter verwalten
                </p>
              </div>
            </div>

            <StaggerCard index={5}>
              <Card>
                <CardHeader>
                  <CardTitle>Verbundene Konten</CardTitle>
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
                          className={cn(
                            (loading || refreshing) && "animate-spin",
                          )}
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
                        Kein Git Credential Helper konfiguriert. Setze z. B.
                        mit{" "}
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
                      <code className="rounded bg-muted px-1 py-0.5">
                        {helper}
                      </code>
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
          </section>

          <div className="border-t border-border/50" />

          <section
            id="updates"
            ref={setRef("updates")}
            className="scroll-mt-10 pb-10"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                <Download className="size-4 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold leading-none">
                  Updates
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  App-Versionen prüfen und installieren
                </p>
              </div>
            </div>

            <StaggerCard index={6}>
              <Card>
                <CardHeader>
                  <CardTitle>App-Updates</CardTitle>
                  <CardDescription>
                    Releases werden automatisch über GitHub bereitgestellt. Neue
                    Versionen können direkt aus der App heruntergeladen und
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
                      className={cn(
                        "size-4",
                        checkingForUpdates && "animate-spin",
                      )}
                    />
                    Nach Updates suchen
                  </Button>
                </CardContent>
              </Card>
            </StaggerCard>
          </section>
        </div>
      </main>

      <AddGitAccount
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSignIn={signIn}
        onSignInViaCredentialManager={signInViaCredentialManager}
        onAddCustomHost={addCustomHost}
        existingHosts={signedInAccounts.map((a) => a.host)}
      />
    </div>
  );
}
