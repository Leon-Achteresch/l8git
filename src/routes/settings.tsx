import { createFileRoute, useRouter } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  GitCommitHorizontal,
  Monitor,
  Moon,
  Package,
  Palette,
  PanelLeft,
  Plus,
  RefreshCw,
  Sparkles,
  Sun,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { StaggerCard } from "@/components/motion/stagger-card";
import { AddGitAccount } from "@/components/repo/git-account/add-git-account";
import { GitAccountRow } from "@/components/repo/git-account/git-account-row";
import { AnimationsCard } from "@/components/settings/animations-card";
import { SidebarCustomizeSection } from "@/components/settings/sidebar-customize-section";
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
import { DEFAULT_AI_PROMPT_TEMPLATE } from "@/lib/ai-commit";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { useGitAccounts } from "@/lib/git-accounts";
import { useLocalePrefs } from "@/lib/locale-prefs";
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

/* -------------------------------------------------------------------------- */
/*  Section header component                                                   */
/* -------------------------------------------------------------------------- */

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  gradient: string;
  iconColor: string;
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  gradient,
  iconColor,
}: SectionHeaderProps) {
  return (
    <div className="mb-7 flex items-center gap-4">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm ring-1 ring-black/5 dark:ring-white/5",
          gradient,
        )}
      >
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div>
        <h2 className="text-base font-semibold leading-none tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function SectionDivider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-border/40" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Nav item                                                                   */
/* -------------------------------------------------------------------------- */

interface NavItemDef {
  id: string;
  label: string;
  icon: React.ElementType;
  accent: string;
}

interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

interface NavItemProps extends NavItemDef {
  active: boolean;
  onClick: () => void;
}

function SettingsNavItem({ icon: Icon, label, accent, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 text-left",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {active && (
        <span
          className={cn(
            "absolute left-0 inset-y-[20%] w-0.5 rounded-full",
            accent,
          )}
        />
      )}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? accent.replace("bg-", "text-") : "text-muted-foreground/70",
        )}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Settings component                                                    */
/* -------------------------------------------------------------------------- */

function Settings() {
  const { t } = useTranslation();
  const locale = useLocalePrefs((s) => s.locale);
  const setLocale = useLocalePrefs((s) => s.setLocale);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const themeOptions = useMemo(
    () =>
      [
        { value: "light" as const, label: t("settings.themeLight"), icon: Sun },
        { value: "dark" as const, label: t("settings.themeDark"), icon: Moon },
        { value: "system" as const, label: t("settings.themeSystem"), icon: Monitor },
      ] satisfies { value: Theme; label: string; icon: typeof Sun }[],
    [t],
  );

  const repoTerminalOptions = useMemo(
    () =>
      [
        { value: "default" as const, label: t("settings.terminalDefault") },
        { value: "git_bash" as const, label: t("settings.terminalGitBash") },
      ] satisfies { value: RepoTerminalKind; label: string }[],
    [t],
  );

  const navGroups = useMemo<NavGroupDef[]>(
    () => [
      {
        label: t("settings.navGroupInterface"),
        items: [
          { id: "sidebar", label: t("settings.navSidebar"), icon: PanelLeft, accent: "bg-blue-500" },
          { id: "appearance", label: t("settings.navAppearance"), icon: Palette, accent: "bg-purple-500" },
          { id: "animations", label: t("settings.navAnimations"), icon: Zap, accent: "bg-amber-500" },
        ],
      },
      {
        label: t("settings.navGroupCommits"),
        items: [
          { id: "commits", label: t("settings.navCommits"), icon: GitCommitHorizontal, accent: "bg-emerald-500" },
        ],
      },
      {
        label: t("settings.navGroupWorkspace"),
        items: [
          { id: "workspace", label: t("settings.navWorkspace"), icon: Terminal, accent: "bg-orange-500" },
        ],
      },
      {
        label: t("settings.navGroupAccount"),
        items: [
          { id: "accounts", label: t("settings.navAccounts"), icon: Users, accent: "bg-teal-500" },
          { id: "updates", label: t("settings.navUpdates"), icon: Package, accent: "bg-sky-500" },
        ],
      },
    ],
    [t],
  );

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
  const showConventionalCommitIcons = useCommitPrefs((s) => s.showConventionalCommitIcons);
  const setShowConventionalCommitIcons = useCommitPrefs((s) => s.setShowConventionalCommitIcons);
  const showCommitDateGroups = useCommitPrefs((s) => s.showCommitDateGroups);
  const setShowCommitDateGroups = useCommitPrefs((s) => s.setShowCommitDateGroups);
  const aiPromptTemplate = useCommitPrefs((s) => s.aiPromptTemplate);
  const setAiPromptTemplate = useCommitPrefs((s) => s.setAiPromptTemplate);
  const aiOutputLanguage = useCommitPrefs((s) => s.aiOutputLanguage);
  const setAiOutputLanguage = useCommitPrefs((s) => s.setAiOutputLanguage);

  const [commitTemplateDraft, setCommitTemplateDraft] = useState(messageTemplate);
  const [aiPromptDraft, setAiPromptDraft] = useState(aiPromptTemplate);
  const [aiLanguageDraft, setAiLanguageDraft] = useState(aiOutputLanguage);

  useEffect(() => { setCommitTemplateDraft(messageTemplate); }, [messageTemplate]);
  useEffect(() => { setAiPromptDraft(aiPromptTemplate); }, [aiPromptTemplate]);
  useEffect(() => { setAiLanguageDraft(aiOutputLanguage); }, [aiOutputLanguage]);

  const signedInAccounts = accounts.filter((a) => a.signed_in);
  const commitTemplateDirty = commitTemplateDraft !== messageTemplate;
  const aiPromptDirty = aiPromptDraft !== aiPromptTemplate || aiLanguageDraft !== aiOutputLanguage;

  const ideLaunchCommand = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const setIdeLaunchCommand = useWorkspacePrefs((s) => s.setIdeLaunchCommand);
  const repoTerminalKind = useWorkspacePrefs((s) => s.repoTerminalKind);
  const setRepoTerminalKind = useWorkspacePrefs((s) => s.setRepoTerminalKind);
  const hideT3Checkpoints = useWorkspacePrefs((s) => s.hideT3Checkpoints);
  const setHideT3Checkpoints = useWorkspacePrefs((s) => s.setHideT3Checkpoints);
  const [ideDraft, setIdeDraft] = useState(ideLaunchCommand);

  useEffect(() => { setIdeDraft(ideLaunchCommand); }, [ideLaunchCommand]);

  const ideDirty = ideDraft !== ideLaunchCommand;

  const mainRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeSection, setActiveSection] = useState("sidebar");

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
    els.forEach((el) => { if (el) observer.observe(el); });

    return () => observer.disconnect();
  }, []);

  function scrollToSection(id: string) {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  }

  function setRef(id: string) {
    return (el: HTMLElement | null) => { sectionRefs.current[id] = el; };
  }

  async function pickIdeExecutable() {
    const selected = await open({ directory: false, multiple: false, title: t("settings.idePickTitle") });
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

      {/* ═══════════════════════════════════════════════════════════════════
          LEFT SIDEBAR NAV
      ═══════════════════════════════════════════════════════════════════ */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-muted/15">

        {/* Back button */}
        <div className="flex h-14 shrink-0 items-center border-b border-border/50 px-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.history.back()}
            className="-ml-1 gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("settings.back")}
          </Button>
        </div>

        {/* Heading */}
        <div className="px-4 pb-2 pt-5">
          <p className="text-base font-semibold tracking-tight">{t("settings.title")}</p>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 pb-6">
          <div className="space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <SettingsNavItem
                      key={item.id}
                      {...item}
                      active={activeSection === item.id}
                      onClick={() => scrollToSection(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════════════════════ */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl space-y-16 px-10 py-10">

          {/* ── SIDEBAR ───────────────────────────────────────────────── */}
          <section id="sidebar" ref={setRef("sidebar")} className="scroll-mt-10">
            <SectionHeader
              icon={PanelLeft}
              title={t("settings.sidebarSectionTitle")}
              subtitle={t("settings.sidebarSectionSubtitle")}
              gradient="from-blue-500/25 to-indigo-500/25"
              iconColor="text-blue-500"
            />
            <SidebarCustomizeSection />
          </section>

          <SectionDivider />

          {/* ── APPEARANCE ────────────────────────────────────────────── */}
          <section id="appearance" ref={setRef("appearance")} className="scroll-mt-10">
            <SectionHeader
              icon={Palette}
              title={t("settings.appearanceTitle")}
              subtitle={t("settings.appearanceSubtitle")}
              gradient="from-purple-500/25 to-pink-500/25"
              iconColor="text-purple-500"
            />

            <div className="space-y-4">
              <StaggerCard index={0}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.languageTitle")}</CardTitle>
                    <CardDescription>{t("settings.languageSubtitle")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      role="radiogroup"
                      aria-label={t("settings.languageTitle")}
                      className="grid grid-cols-2 gap-3 sm:max-w-xs"
                    >
                      {(
                        [
                          { value: "de" as const, label: t("settings.languageDe") },
                          { value: "en" as const, label: t("settings.languageEn") },
                        ] as const
                      ).map(({ value, label }) => {
                        const active = locale === value;
                        return (
                          <Button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            variant={active ? "default" : "outline"}
                            onClick={() => setLocale(value)}
                            className={cn(
                              "h-auto py-3",
                              active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                            )}
                          >
                            <span className="text-sm">{label}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={1}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.themeTitle")}</CardTitle>
                    <CardDescription>{t("settings.themeDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      role="radiogroup"
                      aria-label={t("settings.themeAria")}
                      className="grid grid-cols-3 gap-3"
                    >
                      {themeOptions.map(({ value, label, icon: Icon }) => {
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
              </StaggerCard>
            </div>
          </section>

          <SectionDivider />

          {/* ── ANIMATIONS ────────────────────────────────────────────── */}
          <section id="animations" ref={setRef("animations")} className="scroll-mt-10">
            <SectionHeader
              icon={Zap}
              title={t("settings.animationsSectionTitle")}
              subtitle={t("settings.animationsSectionSubtitle")}
              gradient="from-amber-500/25 to-yellow-400/25"
              iconColor="text-amber-500"
            />
            <StaggerCard index={2}>
              <AnimationsCard />
            </StaggerCard>
          </section>

          <SectionDivider />

          {/* ── COMMITS ───────────────────────────────────────────────── */}
          <section id="commits" ref={setRef("commits")} className="scroll-mt-10">
            <SectionHeader
              icon={GitCommitHorizontal}
              title={t("settings.commitsSectionTitle")}
              subtitle={t("settings.commitsSectionSubtitle")}
              gradient="from-emerald-500/25 to-green-500/25"
              iconColor="text-emerald-500"
            />

            <div className="space-y-4">
              <StaggerCard index={3}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.historyTitle")}</CardTitle>
                    <CardDescription>{t("settings.historyDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="conventional-commit-icons"
                        checked={showConventionalCommitIcons}
                        onCheckedChange={(v) => setShowConventionalCommitIcons(v === true)}
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor="conventional-commit-icons"
                          className="cursor-pointer text-sm font-medium text-foreground"
                        >
                          {t("settings.conventionalIconsLabel")}
                        </Label>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t("settings.conventionalIconsHint")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="commit-date-groups"
                        checked={showCommitDateGroups}
                        onCheckedChange={(v) => setShowCommitDateGroups(v === true)}
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor="commit-date-groups"
                          className="cursor-pointer text-sm font-medium text-foreground"
                        >
                          {t("settings.dateGroupsLabel")}
                        </Label>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t("settings.dateGroupsHint")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={4}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.graphTitle")}</CardTitle>
                    <CardDescription>{t("settings.graphDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="hide-t3-checkpoints"
                        checked={hideT3Checkpoints}
                        onCheckedChange={(v) => setHideT3Checkpoints(v === true)}
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor="hide-t3-checkpoints"
                          className="cursor-pointer text-sm font-medium text-foreground"
                        >
                          {t("settings.hideT3Label")}
                        </Label>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t("settings.hideT3HintPart1")}
                          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                            refs/t3/checkpoints/*
                          </code>
                          {t("settings.hideT3HintPart2")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={5}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.messageTitle")}</CardTitle>
                    <CardDescription>{t("settings.messageDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={commitTemplateDraft}
                      onChange={(e) => setCommitTemplateDraft(e.target.value)}
                      rows={6}
                      placeholder={t("settings.messagePlaceholder")}
                      className="min-h-[140px] font-mono text-sm"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={!commitTemplateDirty}
                        onClick={() => setMessageTemplate(commitTemplateDraft)}
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={6}>
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-muted-foreground" />
                      <CardTitle>{t("settings.aiTitle")}</CardTitle>
                    </div>
                    <CardDescription>{t("settings.aiDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-language" className="text-sm font-medium">
                        {t("settings.aiOutputLanguage")}
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
                      <p className="text-xs text-muted-foreground">{t("settings.aiOutputHint")}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ai-prompt" className="text-sm font-medium">
                        {t("settings.aiPromptLabel")}
                      </Label>
                      <Textarea
                        id="ai-prompt"
                        value={aiPromptDraft}
                        onChange={(e) => setAiPromptDraft(e.target.value)}
                        rows={8}
                        placeholder={DEFAULT_AI_PROMPT_TEMPLATE}
                        className="min-h-[180px] font-mono text-sm"
                        spellCheck={false}
                      />
                      <p className="text-xs text-muted-foreground">{t("settings.aiPromptHint")}</p>
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
                        {t("common.save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>
            </div>
          </section>

          <SectionDivider />

          {/* ── WORKSPACE ─────────────────────────────────────────────── */}
          <section id="workspace" ref={setRef("workspace")} className="scroll-mt-10">
            <SectionHeader
              icon={Terminal}
              title={t("settings.workspaceSectionTitle")}
              subtitle={t("settings.workspaceSectionSubtitle")}
              gradient="from-orange-500/25 to-amber-500/25"
              iconColor="text-orange-500"
            />

            <StaggerCard index={7}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.ideTitle")}</CardTitle>
                  <CardDescription>{t("settings.ideDesc")}</CardDescription>
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
                      {t("common.select")}
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      disabled={!ideDirty}
                      onClick={() => setIdeLaunchCommand(ideDraft)}
                    >
                      {t("common.save")}
                    </Button>
                  </div>
                  <div className="space-y-2 border-t border-border pt-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("settings.terminalInRepo")}</p>
                      <p className="text-xs text-muted-foreground">{t("settings.terminalInRepoHint")}</p>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={t("settings.terminalAria")}
                      className="grid grid-cols-2 gap-2"
                    >
                      {repoTerminalOptions.map(({ value, label }) => {
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
                              active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
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

          <SectionDivider />

          {/* ── ACCOUNTS ──────────────────────────────────────────────── */}
          <section id="accounts" ref={setRef("accounts")} className="scroll-mt-10">
            <SectionHeader
              icon={Users}
              title={t("settings.accountsSectionTitle")}
              subtitle={t("settings.accountsSectionSubtitle")}
              gradient="from-teal-500/25 to-cyan-500/25"
              iconColor="text-teal-500"
            />

            <StaggerCard index={8}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.accountsCardTitle")}</CardTitle>
                  <CardDescription>{t("settings.accountsCardDesc")}</CardDescription>
                  <CardAction>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void refresh()}
                        aria-label={t("settings.refreshAria")}
                        disabled={loading || refreshing}
                      >
                        <RefreshCw className={cn((loading || refreshing) && "animate-spin")} />
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="icon-sm"
                        onClick={() => setAddOpen(true)}
                        aria-label={t("settings.addAccountAria")}
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
                      <div>{t("settings.noCredentialHelper")}</div>
                    </div>
                  )}

                  {helper && (
                    <p className="text-xs text-muted-foreground">
                      {t("settings.credentialHelper")}
                      <code className="rounded bg-muted px-1 py-0.5">{helper}</code>
                    </p>
                  )}

                  {signedInAccounts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        {loading
                          ? t("settings.accountsLoading")
                          : refreshing
                            ? t("settings.accountsRefreshing")
                            : t("settings.accountsEmpty")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {signedInAccounts.map((account) => (
                        <GitAccountRow
                          key={account.id}
                          account={account}
                          onSignOut={signOut}
                          onRemoveCustom={account.builtin ? undefined : removeCustomHost}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </StaggerCard>
          </section>

          <SectionDivider />

          {/* ── UPDATES ───────────────────────────────────────────────── */}
          <section id="updates" ref={setRef("updates")} className="scroll-mt-10 pb-10">
            <SectionHeader
              icon={Package}
              title={t("settings.updatesSectionTitle")}
              subtitle={t("settings.updatesSectionSubtitle")}
              gradient="from-sky-500/25 to-blue-500/25"
              iconColor="text-sky-500"
            />

            <StaggerCard index={9}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.updatesCardTitle")}</CardTitle>
                  <CardDescription>{t("settings.updatesCardDesc")}</CardDescription>
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
                    {t("settings.checkUpdates")}
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
