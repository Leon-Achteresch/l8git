import { DataPortabilityCard } from "@/components/settings/data-portability-card";
import { LayoutPrefsCard } from "@/components/settings/layout-prefs-card";
import { ListRow } from "@/components/ui/list-row";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Bot,
  Brain,
  FolderOpen,
  GitCommitHorizontal,
  Globe2,
  HardDrive,
  Info,
  Keyboard,
  Link2,
  Monitor,
  Moon,
  Package,
  Palette,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  Ticket,
  Users,
  User,
  X,
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
import { JiraCard } from "@/components/settings/jira-card";
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
import { Eye as EyeData, EyeOff as EyeOffData } from "lucide";
import { MorphIcon } from "@/components/ui/morph-icon";

const UI_SCALE_STEPS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5] as const;

interface NavItemDef {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

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
          { id: "sidebar", label: t("settings.navSidebar"), icon: PanelLeft },
          { id: "appearance", label: t("settings.navAppearance"), icon: Palette },
          { id: "animations", label: t("settings.navAnimations"), icon: Zap },
          { id: "notifications", label: t("settings.navNotifications"), icon: Bell },
          { id: "hotkeys", label: t("settings.navHotkeys"), icon: Keyboard },
        ],
      },
      {
        label: t("settings.navGroupCommits"),
        items: [
          { id: "commits", label: t("settings.navCommits"), icon: GitCommitHorizontal },
          { id: "signing", label: t("settings.navSigning"), icon: ShieldCheck },
          { id: "ai", label: t("settings.navAi"), icon: Sparkles },
        ],
      },
      {
        label: t("settings.navGroupIntegrations"),
        items: [
          { id: "jira", label: t("settings.navJira"), icon: Ticket },
        ],
      },
      {
        label: t("settings.navGroupWorkspace"),
        items: [
          { id: "workspace", label: t("settings.navWorkspace"), icon: Terminal },
        ],
      },
      {
        label: t("settings.navGroupAccount"),
        items: [
          { id: "accounts", label: t("settings.navAccounts"), icon: Users },
          { id: "updates", label: t("settings.navUpdates"), icon: Package },
          { id: "info", label: t("header.info"), icon: Info },
          { id: "about", label: t("header.about"), icon: User },
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
  const fileTreeView = useCommitPrefs((s) => s.fileTreeView);
  const setFileTreeView = useCommitPrefs((s) => s.setFileTreeView);
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
  useEffect(() => {
    void import("@/lib/secure-storage").then(({ secureGet, AI_KEY_KEYRING_KEY }) =>
      secureGet(AI_KEY_KEYRING_KEY).then((v) => {
        if (v != null) {
          setAiProviderApiKey(v);
          setAiApiKeyDraft(v);
        }
      }).catch(() => {}),
    );
  }, [setAiProviderApiKey]);
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
  const embeddedTerminalCommand = useWorkspacePrefs((s) => s.embeddedTerminalCommand);
  const setEmbeddedTerminalCommand = useWorkspacePrefs((s) => s.setEmbeddedTerminalCommand);
  const terminalButtonMode = useWorkspacePrefs((s) => s.terminalButtonMode);
  const setTerminalButtonMode = useWorkspacePrefs((s) => s.setTerminalButtonMode);
  const uiScale = useWorkspacePrefs((s) => s.uiScale);
  const setUiScale = useWorkspacePrefs((s) => s.setUiScale);
  const [ideDraft, setIdeDraft] = useState(ideLaunchCommand);
  const [embeddedShellDraft, setEmbeddedShellDraft] = useState(embeddedTerminalCommand);

  useEffect(() => { setIdeDraft(ideLaunchCommand); }, [ideLaunchCommand]);
  useEffect(() => { setEmbeddedShellDraft(embeddedTerminalCommand); }, [embeddedTerminalCommand]);

  const ideDirty = ideDraft !== ideLaunchCommand;
  const embeddedShellDirty = embeddedShellDraft !== embeddedTerminalCommand;

  const mainRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [settingsQuery, setSettingsQuery] = useState("");
  const locationHash = useRouterState({ select: (s) => s.location.hash });
  const [activeSection, setActiveSection] = useState(locationHash ? locationHash.replace(/^#/, "") : "sidebar");

  useEffect(() => {
    const id = locationHash.replace(/^#/, "");
    if (id) {
      setActiveSection(id);
    }
  }, [locationHash]);

  function handleSelectSection(id: string) {
    if (id === "info") {
      void router.navigate({ to: "/info" });
      return;
    }
    if (id === "about") {
      void router.navigate({ to: "/about" });
      return;
    }
    setActiveSection(id);
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
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

  const isSearching = settingsQuery.trim().length > 0;
  const normalizedQuery = settingsQuery.trim().toLowerCase();

  const allSectionsMeta = useMemo(() => [
    { id: "sidebar", title: t("settings.sidebarSectionTitle"), subtitle: t("settings.sidebarSectionSubtitle"), icon: PanelLeft },
    { id: "appearance", title: t("settings.appearanceTitle"), subtitle: t("settings.appearanceSubtitle"), icon: Palette },
    { id: "animations", title: t("settings.animationsSectionTitle"), subtitle: t("settings.animationsSectionSubtitle"), icon: Zap },
    { id: "notifications", title: t("settings.notificationsSectionTitle"), subtitle: t("settings.notificationsSectionSubtitle"), icon: Bell },
    { id: "hotkeys", title: t("settings.hotkeysSectionTitle"), subtitle: t("settings.hotkeysSectionSubtitle"), icon: Keyboard },
    { id: "commits", title: t("settings.commitsSectionTitle"), subtitle: t("settings.commitsSectionSubtitle"), icon: GitCommitHorizontal },
    { id: "signing", title: t("settings.signingSectionTitle"), subtitle: t("settings.signingSectionSubtitle"), icon: ShieldCheck },
    { id: "ai", title: t("settings.aiSectionTitle"), subtitle: t("settings.aiSectionSubtitle"), icon: Sparkles },
    { id: "jira", title: t("settings.jiraSectionTitle"), subtitle: t("settings.jiraSectionSubtitle"), icon: Ticket },
    { id: "workspace", title: t("settings.workspaceSectionTitle"), subtitle: t("settings.workspaceSectionSubtitle"), icon: Terminal },
    { id: "accounts", title: t("settings.accountsSectionTitle"), subtitle: t("settings.accountsSectionSubtitle"), icon: Users },
    { id: "updates", title: t("settings.updatesSectionTitle"), subtitle: t("settings.updatesSectionSubtitle"), icon: Package },
    { id: "info", title: t("header.info"), subtitle: "", icon: Info },
    { id: "about", title: t("header.about"), subtitle: "", icon: User },
  ], [t]);

  const matchedSectionIds = useMemo(() => {
    if (!isSearching) return null;
    const matches: string[] = [];
    allSectionsMeta.forEach((meta) => {
      const el = sectionRefs.current[meta.id];
      const text = (el?.textContent ?? "") + " " + meta.title + " " + meta.subtitle;
      if (text.toLowerCase().includes(normalizedQuery)) {
        matches.push(meta.id);
      }
    });
    return matches;
  }, [allSectionsMeta, isSearching, normalizedQuery]);

  function renderHeader(Icon: React.ElementType, title: string, subtitle: string) {
    return (
      <div className="flex items-center gap-3.5 pb-2">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-foreground ring-1 ring-border/50">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    );
  }

  function shouldShowSection(id: string) {
    if (isSearching) {
      return matchedSectionIds === null || matchedSectionIds.includes(id);
    }
    return activeSection === id;
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      <aside className="flex min-h-0 w-60 shrink-0 flex-col border-r border-border/50 bg-sidebar">
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

        <div className="px-4 pb-2 pt-4">
          <p className="text-base font-semibold tracking-tight">{t("settings.title")}</p>
        </div>

        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t("audit.settingsSearch")}
              placeholder={t("audit.settingsSearch")}
              value={settingsQuery}
              onChange={(e) => setSettingsQuery(e.target.value)}
              className="h-8 pl-8 pr-7 text-xs"
            />
            {settingsQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setSettingsQuery("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-6">
          <div className="space-y-4">
            {navGroups.map((group) => {
              const visibleItems = isSearching && matchedSectionIds
                ? group.items.filter((item) => matchedSectionIds.includes(item.id))
                : group.items;

              if (visibleItems.length === 0) return null;

              return (
                <div key={group.label}>
                  <p className="mb-1 px-3 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {visibleItems.map(({ id, label, icon: ItemIcon }) => {
                      const active = isSearching ? activeSection === id : activeSection === id;
                      return (
                        <ListRow
                          key={id}
                          active={active}
                          onClick={() => handleSelectSection(id)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors select-none",
                            active
                              ? "bg-accent font-medium text-accent-foreground"
                              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                          )}
                        >
                          <ItemIcon
                            className={cn(
                              "size-4 shrink-0 transition-colors",
                              active ? "text-foreground" : "text-muted-foreground/70",
                            )}
                          />
                          <span className="truncate">{label}</span>
                        </ListRow>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>
      </aside>

      <main
        ref={mainRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
          {isSearching && matchedSectionIds?.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("audit.noResults")}</p>
            </div>
          )}

          {shouldShowSection("sidebar") && (
            <section id="sidebar" ref={setRef("sidebar")} className="space-y-4">
              {renderHeader(PanelLeft, t("settings.sidebarSectionTitle"), t("settings.sidebarSectionSubtitle"))}
              <LayoutPrefsCard />
              <SidebarCustomizeSection />
            </section>
          )}

          {shouldShowSection("appearance") && (
            <section id="appearance" ref={setRef("appearance")} className="space-y-4">
              {renderHeader(Palette, t("settings.appearanceTitle"), t("settings.appearanceSubtitle"))}

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
                      {themeOptions.map(({ value, label, icon: ThemeIcon }) => {
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
                            <ThemeIcon className="h-5 w-5" />
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
                      <div className="flex justify-between text-[0.6875rem] text-muted-foreground/60 select-none">
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
            </section>
          )}

          {shouldShowSection("animations") && (
            <section id="animations" ref={setRef("animations")} className="space-y-4">
              {renderHeader(Zap, t("settings.animationsSectionTitle"), t("settings.animationsSectionSubtitle"))}
              <StaggerCard index={0}>
                <AnimationsCard />
              </StaggerCard>
            </section>
          )}

          {shouldShowSection("notifications") && (
            <section id="notifications" ref={setRef("notifications")} className="space-y-4">
              {renderHeader(Bell, t("settings.notificationsSectionTitle"), t("settings.notificationsSectionSubtitle"))}
              <StaggerCard index={0}>
                <NotificationsCard />
              </StaggerCard>
            </section>
          )}

          {shouldShowSection("hotkeys") && (
            <section id="hotkeys" ref={setRef("hotkeys")} className="space-y-4">
              {renderHeader(Keyboard, t("settings.hotkeysSectionTitle"), t("settings.hotkeysSectionSubtitle"))}
              <StaggerCard index={0}>
                <HotkeysSection />
              </StaggerCard>
            </section>
          )}

          {shouldShowSection("commits") && (
            <section id="commits" ref={setRef("commits")} className="space-y-4">
              {renderHeader(GitCommitHorizontal, t("settings.commitsSectionTitle"), t("settings.commitsSectionSubtitle"))}

              <StaggerCard index={0}>
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
                        id="commit-file-tree-view"
                        checked={fileTreeView}
                        onCheckedChange={(v) => setFileTreeView(v === true)}
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor="commit-file-tree-view"
                          className="cursor-pointer text-sm font-medium text-foreground"
                        >
                          {t("settings.fileTreeViewLabel")}
                        </Label>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t("settings.fileTreeViewHint")}
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

              <StaggerCard index={1}>
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
                          <code className="rounded bg-muted px-1 py-0.5 text-[0.6875rem]">
                            refs/t3/checkpoints/*
                          </code>
                          {t("settings.hideT3HintPart2")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={2}>
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
                      <div className="flex justify-between text-[0.6875rem] text-muted-foreground/60 select-none">
                        <span>20 px</span>
                        <span className="text-center text-muted-foreground/50 text-[0.625rem]">
                          {t("settings.graphLaneWidthHint")}
                        </span>
                        <span>240 px</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerCard>

              <StaggerCard index={3}>
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
            </section>
          )}

          {shouldShowSection("signing") && (
            <section id="signing" ref={setRef("signing")} className="space-y-4">
              {renderHeader(ShieldCheck, t("settings.signingSectionTitle"), t("settings.signingSectionSubtitle"))}
              <StaggerCard index={0}>
                <GitSigningCard />
              </StaggerCard>
            </section>
          )}

          {shouldShowSection("ai") && (
            <section id="ai" ref={setRef("ai")} className="space-y-4">
              {renderHeader(Sparkles, t("settings.aiSectionTitle"), t("settings.aiSectionSubtitle"))}

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
                      ).map(({ id, label, desc, icon: ProviderIcon }) => {
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
                            <ProviderIcon className={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
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
                            <MorphIcon icon={aiApiKeyVisible ? EyeOffData : EyeData} className="size-4" />
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
            </section>
          )}

          {shouldShowSection("jira") && (
            <section id="jira" ref={setRef("jira")} className="space-y-4">
              {renderHeader(Ticket, t("settings.jiraSectionTitle"), t("settings.jiraSectionSubtitle"))}
              <StaggerCard index={0}>
                <JiraCard />
              </StaggerCard>
            </section>
          )}

          {shouldShowSection("workspace") && (
            <section id="workspace" ref={setRef("workspace")} className="space-y-4">
              {renderHeader(Terminal, t("settings.workspaceSectionTitle"), t("settings.workspaceSectionSubtitle"))}

              <StaggerCard index={0}>
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

              <StaggerCard index={1}>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("settings.embeddedTerminalTitle")}</CardTitle>
                    <CardDescription>{t("settings.embeddedTerminalDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="embedded-shell" className="text-sm font-medium">
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
                          onClick={() => setEmbeddedTerminalCommand(embeddedShellDraft)}
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
                      <div role="radiogroup" className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { value: "embedded" as const, label: t("settings.terminalButtonModeEmbedded") },
                            { value: "external" as const, label: t("settings.terminalButtonModeExternal") },
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

              <StaggerCard index={2}>
                <BranchCleanupCard />
              </StaggerCard>

              <StaggerCard index={3}>
                <RemoteServerCard />
              </StaggerCard>

              <StaggerCard index={4}>
                <DataPortabilityCard />
              </StaggerCard>
            </section>
          )}

          {shouldShowSection("accounts") && (
            <section id="accounts" ref={setRef("accounts")} className="space-y-4">
              {renderHeader(Users, t("settings.accountsSectionTitle"), t("settings.accountsSectionSubtitle"))}

              <StaggerCard index={0}>
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
          )}

          {shouldShowSection("updates") && (
            <section id="updates" ref={setRef("updates")} className="space-y-4 pb-6">
              {renderHeader(Package, t("settings.updatesSectionTitle"), t("settings.updatesSectionSubtitle"))}

              <StaggerCard index={0}>
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
                      <SpinIcon icon={RefreshCw} active={checkingForUpdates} className="size-4" />
                      {t("settings.checkUpdates")}
                    </Button>
                  </CardContent>
                </Card>
              </StaggerCard>
            </section>
          )}
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
