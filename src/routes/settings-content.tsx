import { ListRow } from "@/components/ui/list-row";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Bot,
  Brain,
  Eye,
  EyeOff,
  FolderOpen,
  GitCommitHorizontal,
  Globe2,
  HardDrive,
  Keyboard,
  Link2,
  Monitor,
  Moon,
  Package,
  Palette,
  PanelLeft,
  Plus,
  RefreshCw,
  ShieldCheck,
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
import { BranchCleanupCard } from "@/components/settings/branch-cleanup-card";
import { RemoteServerCard } from "@/components/settings/remote-server-card";
import { GitSigningCard } from "@/components/settings/git-signing-card";
import { HotkeysSection } from "@/components/settings/hotkeys-section";
import { InterfaceElementsCard } from "@/components/settings/interface-elements-card";
import { NotificationsCard } from "@/components/settings/notifications-card";
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
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { checkForAppUpdate } from "@/lib/app-updater";
import { AiPromptSettings } from "@/components/ai/ai-prompt-settings";
import { useCommitPrefs, AI_PROVIDER_DEFAULT_MODELS, type AiProviderType } from "@/lib/commit-prefs";
import { useGitAccounts } from "@/lib/git-accounts";
import { useLocalePrefs } from "@/lib/locale-prefs";
import { APP_LOCALES } from "@/lib/locales";
import type { Theme } from "@/lib/theme";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";
import {
  useWorkspacePrefs,
  type RepoTerminalKind,
} from "@/lib/workspace-prefs";
import { SpinIcon } from "@/components/motion/kit";

const UI_SCALE_STEPS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5] as const;

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
    <ListRow
      active={active}
      onClick={onClick}
      className="group gap-3 rounded-lg px-3 py-2 hover:bg-accent/50 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
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
    </ListRow>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Settings component                                                    */
/* -------------------------------------------------------------------------- */

export function Settings() {
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
          { id: "sidebar", label: t("settings.navSidebar"), icon: PanelLeft, accent: "bg-git-branch" },
          { id: "appearance", label: t("settings.navAppearance"), icon: Palette, accent: "bg-git-merge" },
          { id: "animations", label: t("settings.navAnimations"), icon: Zap, accent: "bg-git-modified" },
          { id: "notifications", label: t("settings.navNotifications"), icon: Bell, accent: "bg-git-merge" },
          { id: "hotkeys", label: t("settings.navHotkeys"), icon: Keyboard, accent: "bg-git-added" },
        ],
      },
      {
        label: t("settings.navGroupCommits"),
        items: [
          { id: "commits", label: t("settings.navCommits"), icon: GitCommitHorizontal, accent: "bg-git-added" },
          { id: "signing", label: t("settings.navSigning"), icon: ShieldCheck, accent: "bg-git-branch" },
          { id: "ai", label: t("settings.navAi"), icon: Sparkles, accent: "bg-git-merge" },
        ],
      },
      {
        label: t("settings.navGroupWorkspace"),
        items: [
          { id: "workspace", label: t("settings.navWorkspace"), icon: Terminal, accent: "bg-git-modified" },
        ],
      },
      {
        label: t("settings.navGroupAccount"),
        items: [
          { id: "accounts", label: t("settings.navAccounts"), icon: Users, accent: "bg-git-added" },
          { id: "updates", label: t("settings.navUpdates"), icon: Package, accent: "bg-git-branch" },
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
  const aiOutputLanguage = useCommitPrefs((s) => s.aiOutputLanguage);
  const setAiOutputLanguage = useCommitPrefs((s) => s.setAiOutputLanguage);
  const aiProviderType = useCommitPrefs((s) => s.aiProviderType);
  const setAiProviderType = useCommitPrefs((s) => s.setAiProviderType);
  const aiProviderApiKey = useCommitPrefs((s) => s.aiProviderApiKey);
  const setAiProviderApiKey = useCommitPrefs((s) => s.setAiProviderApiKey);
  const aiProviderModel = useCommitPrefs((s) => s.aiProviderModel);
  const setAiProviderModel = useCommitPrefs((s) => s.setAiProviderModel);
  const aiProviderBaseUrl = useCommitPrefs((s) => s.aiProviderBaseUrl);
  const setAiProviderBaseUrl = useCommitPrefs((s) => s.setAiProviderBaseUrl);
  const graphLanePxMin = useCommitPrefs((s) => s.graphLanePxMin);
  const setGraphLanePxMin = useCommitPrefs((s) => s.setGraphLanePxMin);
  const graphLanePxMax = useCommitPrefs((s) => s.graphLanePxMax);
  const setGraphLanePxMax = useCommitPrefs((s) => s.setGraphLanePxMax);

  const [commitTemplateDraft, setCommitTemplateDraft] = useState(messageTemplate);
  const [aiLanguageDraft, setAiLanguageDraft] = useState(aiOutputLanguage);
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState(aiProviderApiKey);
  const [aiModelDraft, setAiModelDraft] = useState(aiProviderModel);
  const [aiBaseUrlDraft, setAiBaseUrlDraft] = useState(aiProviderBaseUrl);
  const [aiApiKeyVisible, setAiApiKeyVisible] = useState(false);

  useEffect(() => { setCommitTemplateDraft(messageTemplate); }, [messageTemplate]);
  useEffect(() => { setAiLanguageDraft(aiOutputLanguage); }, [aiOutputLanguage]);
  useEffect(() => { setAiApiKeyDraft(aiProviderApiKey); }, [aiProviderApiKey]);
  // Load the API key from the OS keyring when the settings page mounts.
  useEffect(() => {
    void import("@/lib/secure-storage").then(({ secureGet, AI_KEY_KEYRING_KEY }) =>
      secureGet(AI_KEY_KEYRING_KEY).then((v) => {
        if (v != null) {
          setAiProviderApiKey(v);
          setAiApiKeyDraft(v);
        }
      }).catch(() => {}),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setAiModelDraft(aiProviderModel); }, [aiProviderModel]);
  useEffect(() => { setAiBaseUrlDraft(aiProviderBaseUrl); }, [aiProviderBaseUrl]);

  const signedInAccounts = accounts.filter((a) => a.signed_in);
  const commitTemplateDirty = commitTemplateDraft !== messageTemplate;
  const aiLanguageDirty = aiLanguageDraft !== aiOutputLanguage;
  const aiProviderDirty = aiApiKeyDraft !== aiProviderApiKey || aiModelDraft !== aiProviderModel || aiBaseUrlDraft !== aiProviderBaseUrl;

  const ideLaunchCommand = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const setIdeLaunchCommand = useWorkspacePrefs((s) => s.setIdeLaunchCommand);
  const repoTerminalKind = useWorkspacePrefs((s) => s.repoTerminalKind);
  const setRepoTerminalKind = useWorkspacePrefs((s) => s.setRepoTerminalKind);
  const hideT3Checkpoints = useWorkspacePrefs((s) => s.hideT3Checkpoints);
  const setHideT3Checkpoints = useWorkspacePrefs((s) => s.setHideT3Checkpoints);
  const embeddedTerminalCommand = useWorkspacePrefs(
    (s) => s.embeddedTerminalCommand,
  );
  const setEmbeddedTerminalCommand = useWorkspacePrefs(
    (s) => s.setEmbeddedTerminalCommand,
  );
  const terminalButtonMode = useWorkspacePrefs((s) => s.terminalButtonMode);
  const setTerminalButtonMode = useWorkspacePrefs(
    (s) => s.setTerminalButtonMode,
  );
  const uiScale = useWorkspacePrefs((s) => s.uiScale);
  const setUiScale = useWorkspacePrefs((s) => s.setUiScale);
  const [ideDraft, setIdeDraft] = useState(ideLaunchCommand);
  const [embeddedShellDraft, setEmbeddedShellDraft] = useState(
    embeddedTerminalCommand,
  );

  useEffect(() => { setIdeDraft(ideLaunchCommand); }, [ideLaunchCommand]);
  useEffect(() => {
    setEmbeddedShellDraft(embeddedTerminalCommand);
  }, [embeddedTerminalCommand]);

  const ideDirty = ideDraft !== ideLaunchCommand;
  const embeddedShellDirty = embeddedShellDraft !== embeddedTerminalCommand;

  const mainRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeSection, setActiveSection] = useState("sidebar");
  const locationHash = useRouterState({ select: (s) => s.location.hash });

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

  useEffect(() => {
    const id = locationHash.replace(/^#/, "");
    if (!id) return;
    const frame = window.requestAnimationFrame(() => {
      const target = sectionRefs.current[id];
      if (!target) return;
      target.scrollIntoView({ block: "start" });
      setActiveSection(id);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [locationHash]);

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
              gradient="from-git-branch/25 to-git-branch/25"
              iconColor="text-git-branch"
            />
            <SidebarCustomizeSection />
          </section>

          {/* ── APPEARANCE ────────────────────────────────────────────── */}
          <section id="appearance" ref={setRef("appearance")} className="scroll-mt-10">
            <SectionHeader
              icon={Palette}
              title={t("settings.appearanceTitle")}
              subtitle={t("settings.appearanceSubtitle")}
              gradient="from-git-merge/25 to-pink-500/25"
              iconColor="text-git-merge"
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
                      className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:max-w-2xl"
                    >
                      {APP_LOCALES.map(({ code, nativeName }) => {
                        const active = locale === code;
                        return (
                          <Button
                            key={code}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            lang={code}
                            variant={active ? "default" : "outline"}
                            onClick={() => setLocale(code)}
                            className={cn(
                              "h-auto py-3",
                              active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                            )}
                          >
                            <span className="text-sm">{nativeName}</span>
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

              <StaggerCard index={2}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.uiScaleTitle")}</CardTitle>
                    <CardDescription>{t("settings.uiScaleDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-foreground">
                          {t("settings.uiScaleLabel")}
                        </Label>
                        <span className="tabular-nums text-sm font-semibold text-foreground">
                          {Math.round(uiScale * 100)}&thinsp;%
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={UI_SCALE_STEPS.length - 1}
                        step={1}
                        value={[Math.max(0, UI_SCALE_STEPS.indexOf(UI_SCALE_STEPS.reduce((a, b) => Math.abs(b - uiScale) < Math.abs(a - uiScale) ? b : a)))]}
                        onValueChange={([i]: number[]) => setUiScale(UI_SCALE_STEPS[i])}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[11px] text-muted-foreground/60 select-none">
                        <span>70%</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setUiScale(1.0)}
                        >
                          {t("settings.uiScaleReset")}
                        </Button>
                        <span>150%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={3}>
                <InterfaceElementsCard />
              </StaggerCard>
            </div>
          </section>

          {/* ── ANIMATIONS ────────────────────────────────────────────── */}
          <section id="animations" ref={setRef("animations")} className="scroll-mt-10">
            <SectionHeader
              icon={Zap}
              title={t("settings.animationsSectionTitle")}
              subtitle={t("settings.animationsSectionSubtitle")}
              gradient="from-git-modified/25 to-git-modified/25"
              iconColor="text-git-modified"
            />
            <StaggerCard index={2}>
              <AnimationsCard />
            </StaggerCard>
          </section>

          {/* ── NOTIFICATIONS ─────────────────────────────────────────── */}
          <section id="notifications" ref={setRef("notifications")} className="scroll-mt-10">
            <SectionHeader
              icon={Bell}
              title={t("settings.notificationsSectionTitle")}
              subtitle={t("settings.notificationsSectionSubtitle")}
              gradient="from-git-merge/25 to-git-merge/25"
              iconColor="text-git-merge"
            />
            <StaggerCard index={2}>
              <NotificationsCard />
            </StaggerCard>
          </section>

          {/* ── HOTKEYS ───────────────────────────────────────────────── */}
          <section id="hotkeys" ref={setRef("hotkeys")} className="scroll-mt-10">
            <SectionHeader
              icon={Keyboard}
              title={t("settings.hotkeysSectionTitle")}
              subtitle={t("settings.hotkeysSectionSubtitle")}
              gradient="from-git-added/25 to-git-added/25"
              iconColor="text-git-added"
            />
            <StaggerCard index={3}>
              <HotkeysSection />
            </StaggerCard>
          </section>

          {/* ── COMMITS ───────────────────────────────────────────────── */}
          <section id="commits" ref={setRef("commits")} className="scroll-mt-10">
            <SectionHeader
              icon={GitCommitHorizontal}
              title={t("settings.commitsSectionTitle")}
              subtitle={t("settings.commitsSectionSubtitle")}
              gradient="from-git-added/25 to-git-added/25"
              iconColor="text-git-added"
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
                    <CardTitle>{t("settings.graphLaneWidthTitle")}</CardTitle>
                    <CardDescription>{t("settings.graphLaneWidthDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-foreground">
                          {t("settings.graphLaneWidthLabel")}
                        </Label>
                        <span className="tabular-nums text-sm font-semibold text-foreground">
                          {graphLanePxMin}&thinsp;–&thinsp;{graphLanePxMax}&thinsp;px
                        </span>
                      </div>
                      <Slider
                        min={20}
                        max={240}
                        step={4}
                        minStepsBetweenThumbs={2}
                        value={[graphLanePxMin, graphLanePxMax]}
                        onValueChange={([min, max]: number[]) => {
                          setGraphLanePxMin(min);
                          setGraphLanePxMax(max);
                        }}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[11px] text-muted-foreground/60 select-none">
                        <span>20 px</span>
                        <span className="text-center text-muted-foreground/50 text-[10px]">
                          {t("settings.graphLaneWidthHint")}
                        </span>
                        <span>240 px</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={6}>
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
                    <p className="text-xs text-muted-foreground">{t("settings.aiPromptMovedHint")}</p>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={!aiLanguageDirty}
                        onClick={() => setAiOutputLanguage(aiLanguageDraft)}
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>
            </div>
          </section>

          {/* ── SIGNING ───────────────────────────────────────────────── */}
          <section id="signing" ref={setRef("signing")} className="scroll-mt-10">
            <SectionHeader
              icon={ShieldCheck}
              title={t("settings.signingSectionTitle")}
              subtitle={t("settings.signingSectionSubtitle")}
              gradient="from-git-branch/25 to-git-added/25"
              iconColor="text-git-branch"
            />

            <StaggerCard index={0}>
              <GitSigningCard />
            </StaggerCard>
          </section>

          {/* ── AI ────────────────────────────────────────────────────── */}
          <section id="ai" ref={setRef("ai")} className="scroll-mt-10">
            <SectionHeader
              icon={Sparkles}
              title={t("settings.aiSectionTitle")}
              subtitle={t("settings.aiSectionSubtitle")}
              gradient="from-git-merge/25 to-git-merge/25"
              iconColor="text-git-merge"
            />

            <div className="space-y-4">
              <StaggerCard index={0}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.aiProviderTitle")}</CardTitle>
                    <CardDescription>{t("settings.aiProviderDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div
                      role="radiogroup"
                      aria-label={t("settings.aiProviderTitle")}
                      className="grid grid-cols-2 gap-3 sm:grid-cols-3"
                    >
                      {(
                        [
                          { id: "openai" as const, label: "OpenAI", desc: t("settings.aiProviderOpenAiDesc"), icon: Bot },
                          { id: "anthropic" as const, label: "Anthropic", desc: t("settings.aiProviderAnthropicDesc"), icon: Brain },
                          { id: "google" as const, label: "Google", desc: t("settings.aiProviderGoogleDesc"), icon: Sparkles },
                          { id: "openrouter" as const, label: "OpenRouter", desc: t("settings.aiProviderOpenRouterDesc"), icon: Globe2 },
                          { id: "ollama" as const, label: "Ollama", desc: t("settings.aiProviderOllamaDesc"), icon: HardDrive },
                          { id: "compatible" as const, label: t("settings.aiProviderCompatibleLabel"), desc: t("settings.aiProviderCompatibleDesc"), icon: Link2 },
                        ] satisfies { id: AiProviderType; label: string; desc: string; icon: typeof Bot }[]
                      ).map(({ id, label, desc, icon: Icon }) => {
                        const active = aiProviderType === id;
                        return (
                          <ListRow
                            key={id}
                            variant="card"
                            role="radio"
                            aria-checked={active}
                            active={active}
                            onClick={() => setAiProviderType(id)}
                            className="flex-col items-start gap-2.5 p-4"
                          >
                            <Icon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
                            <div>
                              <div className="text-sm font-semibold">{label}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                            </div>
                          </ListRow>
                        );
                      })}
                    </div>

                    {aiProviderType !== "ollama" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="ai-api-key" className="text-sm font-medium">
                          {t("settings.aiApiKeyLabel")}
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="ai-api-key"
                            type={aiApiKeyVisible ? "text" : "password"}
                            value={aiApiKeyDraft}
                            onChange={(e) => setAiApiKeyDraft(e.target.value)}
                            placeholder={t("settings.aiApiKeyPlaceholder")}
                            className="min-w-0 flex-1 font-mono text-sm"
                            spellCheck={false}
                            autoCorrect="off"
                            autoComplete="off"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setAiApiKeyVisible((v) => !v)}
                            aria-label={aiApiKeyVisible ? t("settings.aiApiKeyHide") : t("settings.aiApiKeyShow")}
                            className="shrink-0"
                          >
                            {aiApiKeyVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="ai-model" className="text-sm font-medium">
                        {t("settings.aiModelLabel")}
                      </Label>
                      <Input
                        id="ai-model"
                        value={aiModelDraft}
                        onChange={(e) => setAiModelDraft(e.target.value)}
                        placeholder={AI_PROVIDER_DEFAULT_MODELS[aiProviderType]}
                        className="font-mono text-sm"
                        spellCheck={false}
                        autoCorrect="off"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("settings.aiModelHint", { default: AI_PROVIDER_DEFAULT_MODELS[aiProviderType] })}
                      </p>
                    </div>

                    {(aiProviderType === "ollama" || aiProviderType === "compatible") && (
                      <div className="space-y-1.5">
                        <Label htmlFor="ai-base-url" className="text-sm font-medium">
                          {t("settings.aiBaseUrlLabel")}
                        </Label>
                        <Input
                          id="ai-base-url"
                          value={aiBaseUrlDraft}
                          onChange={(e) => setAiBaseUrlDraft(e.target.value)}
                          placeholder={
                            aiProviderType === "ollama"
                              ? "http://localhost:11434/v1"
                              : "https://api.example.com/v1"
                          }
                          className="font-mono text-sm"
                          spellCheck={false}
                          autoCorrect="off"
                        />
                        <p className="text-xs text-muted-foreground">{t("settings.aiBaseUrlHint")}</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={!aiProviderDirty}
                        onClick={() => {
                          const trimmedKey = aiApiKeyDraft.trim();
                          setAiProviderApiKey(trimmedKey);
                          setAiProviderModel(aiModelDraft.trim());
                          setAiProviderBaseUrl(aiBaseUrlDraft.trim());
                          // Persist key to OS keyring instead of localStorage.
                          void import("@/lib/secure-storage").then(({ secureSet, secureDelete, AI_KEY_KEYRING_KEY }) =>
                            trimmedKey
                              ? secureSet(AI_KEY_KEYRING_KEY, trimmedKey)
                              : secureDelete(AI_KEY_KEYRING_KEY),
                          );
                        }}
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={1}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.aiOutputTitle")}</CardTitle>
                    <CardDescription>{t("settings.aiOutputDesc")}</CardDescription>
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
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={!aiLanguageDirty}
                        onClick={() => setAiOutputLanguage(aiLanguageDraft)}
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={2}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.aiPromptsTitle")}</CardTitle>
                    <CardDescription>{t("settings.aiPromptsDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AiPromptSettings />
                  </CardContent>
                </Card>
              </StaggerCard>
            </div>
          </section>

          {/* ── WORKSPACE ─────────────────────────────────────────────── */}
          <section id="workspace" ref={setRef("workspace")} className="scroll-mt-10">
            <SectionHeader
              icon={Terminal}
              title={t("settings.workspaceSectionTitle")}
              subtitle={t("settings.workspaceSectionSubtitle")}
              gradient="from-git-modified/25 to-git-modified/25"
              iconColor="text-git-modified"
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
                  <div className="space-y-2 mt-4">
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

            <StaggerCard index={8}>
              <Card>
                <CardHeader>
                  <CardTitle>{t("settings.embeddedTerminalTitle")}</CardTitle>
                  <CardDescription>
                    {t("settings.embeddedTerminalDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="embedded-shell"
                      className="text-sm font-medium"
                    >
                      {t("settings.embeddedTerminalCommandLabel")}
                    </Label>
                    <Input
                      id="embedded-shell"
                      value={embeddedShellDraft}
                      onChange={(e) => setEmbeddedShellDraft(e.target.value)}
                      placeholder="/bin/zsh -l"
                      className="font-mono text-sm"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("settings.embeddedTerminalCommandHint")}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        disabled={!embeddedShellDirty}
                        onClick={() =>
                          setEmbeddedTerminalCommand(embeddedShellDraft)
                        }
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 mt-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("settings.terminalButtonModeLabel")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.terminalButtonModeHint")}
                      </p>
                    </div>
                    <div
                      role="radiogroup"
                      className="grid grid-cols-2 gap-2"
                    >
                      {(
                        [
                          {
                            value: "embedded" as const,
                            label: t("settings.terminalButtonModeEmbedded"),
                          },
                          {
                            value: "external" as const,
                            label: t("settings.terminalButtonModeExternal"),
                          },
                        ] as const
                      ).map(({ value, label }) => {
                        const active = terminalButtonMode === value;
                        return (
                          <Button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            variant={active ? "default" : "outline"}
                            onClick={() => setTerminalButtonMode(value)}
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

            <StaggerCard index={9} className="mt-4">
              <BranchCleanupCard />
            </StaggerCard>

            <StaggerCard index={10} className="mt-4">
              <RemoteServerCard />
            </StaggerCard>
          </section>

          {/* ── ACCOUNTS ──────────────────────────────────────────────── */}
          <section id="accounts" ref={setRef("accounts")} className="scroll-mt-10">
            <SectionHeader
              icon={Users}
              title={t("settings.accountsSectionTitle")}
              subtitle={t("settings.accountsSectionSubtitle")}
              gradient="from-git-added/25 to-git-branch/25"
              iconColor="text-git-added"
            />

            <StaggerCard index={9}>
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
                        <SpinIcon icon={RefreshCw} active={loading || refreshing} />
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
                    <div className="flex items-start gap-2 rounded-lg border border-git-modified/40 bg-git-modified/10 p-3 text-xs text-git-modified">
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

          {/* ── UPDATES ───────────────────────────────────────────────── */}
          <section id="updates" ref={setRef("updates")} className="scroll-mt-10 pb-10">
            <SectionHeader
              icon={Package}
              title={t("settings.updatesSectionTitle")}
              subtitle={t("settings.updatesSectionSubtitle")}
              gradient="from-git-branch/25 to-git-branch/25"
              iconColor="text-git-branch"
            />

            <StaggerCard index={10}>
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
                    <SpinIcon icon={RefreshCw} active={checkingForUpdates} 
                      className="size-4"
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
