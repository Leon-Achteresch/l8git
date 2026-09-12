import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { m } from "motion/react";
import {
  Bug,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  Keyboard,
  Layers,
  Package,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";

import { AppLogo } from "@/components/brand/app-logo";
import { AppReleaseNotes } from "@/components/app/app-release-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkForAppUpdate, useAppUpdateStore } from "@/lib/app-updater";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/about")({
  component: About,
});

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 400,
      damping: 30,
      mass: 0.7,
    },
  },
};

function getPlatformName() {
  if (typeof navigator === "undefined") return "Desktop";
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  if (/Mac|iPhone|iPad|iPod/i.test(userAgent) || /Mac/i.test(platform)) return "macOS";
  if (/Win/i.test(userAgent) || /Win/i.test(platform)) return "Windows";
  if (/Linux/i.test(userAgent) || /Linux/i.test(platform)) return "Linux";
  return "Desktop";
}

function About() {
  const { t } = useTranslation();
  const router = useRouter();
  const [version, setVersion] = useState<string | null>(null);
  const [tauriVersion, setTauriVersion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const updatePhase = useAppUpdateStore((s) => s.phase);

  useEffect(() => {
    if (!isTauri()) return;
    void getVersion().then(setVersion).catch(() => {});
    void getTauriVersion().then(setTauriVersion).catch(() => {});
  }, []);

  const platformName = useMemo(() => getPlatformName(), []);

  const openExternal = useCallback((url: string) => {
    if (isTauri()) {
      void openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const copyVersion = useCallback(() => {
    const textToCopy = version ?? "0.6.0";
    void navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [version]);

  const handleCheckUpdates = useCallback(async () => {
    setIsChecking(true);
    try {
      await checkForAppUpdate({ manual: true });
    } finally {
      setIsChecking(false);
    }
  }, []);

  const features = useMemo(
    () => [
      {
        icon: Zap,
        title: t("about.featPerformanceTitle"),
        desc: t("about.featPerformanceDesc"),
        gradient: "from-amber-500/15 via-amber-500/5 to-transparent text-amber-500 border-amber-500/20",
      },
      {
        icon: ShieldCheck,
        title: t("about.featPrivacyTitle"),
        desc: t("about.featPrivacyDesc"),
        gradient: "from-emerald-500/15 via-emerald-500/5 to-transparent text-emerald-500 border-emerald-500/20",
      },
      {
        icon: Layers,
        title: t("about.featUiTitle"),
        desc: t("about.featUiDesc"),
        gradient: "from-blue-500/15 via-blue-500/5 to-transparent text-blue-500 border-blue-500/20",
      },
      {
        icon: GitBranch,
        title: t("about.featEcosystemTitle"),
        desc: t("about.featEcosystemDesc"),
        gradient: "from-purple-500/15 via-purple-500/5 to-transparent text-purple-500 border-purple-500/20",
      },
    ],
    [t],
  );

  const specs = useMemo(
    () => [
      { label: t("about.platform"), value: platformName },
      { label: t("about.architecture"), value: "x86_64 / aarch64" },
      { label: t("about.runtime"), value: tauriVersion ? `Tauri v${tauriVersion}` : "Tauri v2" },
      { label: "Frontend", value: "React 19 • Tailwind CSS • Vite" },
      { label: t("about.license"), value: "MIT" },
      { label: t("about.developer"), value: "Leon Achteresch" },
    ],
    [t, platformName, tauriVersion],
  );

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <m.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-8"
      >
        <m.div variants={itemVariants} className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card/80 to-card/40 p-8 shadow-sm backdrop-blur-md">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.navigate({ to: "/settings" })} className="-ml-2 mb-4 gap-2 text-muted-foreground hover:text-foreground">
            {t("settings.back")}
          </Button>
          <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-64 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-8">
            <div className="relative mb-4 shrink-0 sm:mb-0">
              <div className="relative flex size-24 items-center justify-center rounded-2xl border border-border/80 bg-background/90 p-2 shadow-xl ring-4 ring-primary/5">
                <AppLogo className="size-20" />
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  l8git
                </h1>
                <button
                  type="button"
                  onClick={copyVersion}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/60 px-3 py-1 text-xs font-mono font-medium text-foreground transition-colors hover:bg-muted"
                  title={t("about.copyVersion")}
                >
                  {copied ? (
                    <>
                      <Check className="size-3 text-emerald-500" />
                      <span className="text-emerald-500">{t("about.versionCopied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3 text-muted-foreground" />
                      <span>{version ? `v${version}` : "v0.6.0"}</span>
                    </>
                  )}
                </button>
                {updatePhase === "available" ? (
                  <Badge variant="warning" className="gap-1 text-xs">
                    {t("about.updateAvailable")}
                  </Badge>
                ) : updatePhase === "up-to-date" ? (
                  <Badge variant="success" className="gap-1 text-xs">
                    <CheckCircle2 className="size-3" />
                    {t("about.upToDate")}
                  </Badge>
                ) : null}
              </div>

              <p className="text-base font-medium text-foreground/90">
                {t("about.tagline")}
              </p>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t("about.body")}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2 sm:justify-start">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 shadow-xs"
                  onClick={handleCheckUpdates}
                  disabled={isChecking}
                >
                  <RefreshCw className={cn("size-3.5", isChecking && "animate-spin text-primary")} />
                  {isChecking ? t("about.checkingUpdates") : t("about.checkForUpdates")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => openExternal("https://github.com/Leon-Achteresch/l8git")}
                >
                  <svg className="size-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  {t("about.repository")}
                  <ExternalLink className="size-3 opacity-60" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-2"
                  onClick={() => openExternal("https://github.com/Leon-Achteresch/l8git/issues")}
                >
                  <Bug className="size-3.5" />
                  {t("about.reportIssue")}
                  <ExternalLink className="size-3 opacity-60" />
                </Button>
                <Button size="sm" variant="ghost" className="gap-2" asChild>
                  <Link to="/changelog">
                    <Package className="size-3.5" />
                    {t("about.changelog")}
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" className="gap-2" asChild>
                  <Link to="/settings" hash="hotkeys">
                    <Keyboard className="size-3.5" />
                    {t("about.shortcuts")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </m.div>

        <m.div variants={itemVariants} className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("about.featuresTitle")}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <Card
                  key={feat.title}
                  className="relative overflow-hidden border-border/60 bg-card/60 backdrop-blur-xs transition-all duration-200 hover:border-border hover:shadow-xs"
                >
                  <CardHeader className="flex flex-row items-start gap-3.5 space-y-0 pb-3">
                    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-b shadow-2xs", feat.gradient)}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm font-semibold">{feat.title}</CardTitle>
                      <CardDescription className="mt-1 text-xs leading-relaxed">
                        {feat.desc}
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </m.div>

        <m.div variants={itemVariants}>
          <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="size-4 text-muted-foreground" />
                <CardTitle className="text-base font-semibold">
                  {t("about.systemInfo")}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {specs.map((item) => (
                  <div key={item.label} className="space-y-0.5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="font-mono text-xs font-medium text-foreground">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </m.div>

        <m.div variants={itemVariants}>
          <AppReleaseNotes currentVersion={version} />
        </m.div>
      </m.div>
    </main>
  );
}
