import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  shortSigningKey,
  signingFormatLabel,
  type SigningInfo,
} from "@/lib/git-signing";
import { cn } from "@/lib/utils";
import {
  Archive,
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Undo2,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

const AI_LANGUAGES = [
  { label: "English", short: "EN" },
  { label: "Deutsch", short: "DE" },
  { label: "Français", short: "FR" },
  { label: "Español", short: "ES" },
  { label: "Italiano", short: "IT" },
  { label: "Português", short: "PT" },
  { label: "中文", short: "ZH" },
  { label: "日本語", short: "JA" },
] as const;

function languageShort(lang: string): string {
  return (
    AI_LANGUAGES.find((l) => l.label.toLowerCase() === lang.toLowerCase())?.short ??
    lang.slice(0, 2).toUpperCase()
  );
}

const spring = { type: "spring" as const, stiffness: 460, damping: 34, mass: 0.42 };

type CommitComposerProps = {
  subject: string;
  body: string;
  subjectLen: number;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  canCommit: boolean;
  committing: boolean;
  amendMode: boolean;
  currentBranch: string | null;
  canStash: boolean;
  aiGenerating: boolean;
  stagedFiles: number;
  effectiveLanguage: string;
  repoAiLanguage: string | undefined;
  globalAiLanguage: string;
  canUndo: boolean;
  signingInfo: SigningInfo | null;
  onCommit: () => void;
  onGenerateAi: () => void;
  onSetLanguage: (lang: string | undefined) => void;
  onToggleAmend: () => void;
  onStash: () => void;
  onUndo: () => void;
};

export function CommitComposer({
  subject,
  body,
  subjectLen,
  onSubjectChange,
  onBodyChange,
  canCommit,
  committing,
  amendMode,
  currentBranch,
  canStash,
  aiGenerating,
  stagedFiles,
  effectiveLanguage,
  repoAiLanguage,
  globalAiLanguage,
  canUndo,
  signingInfo,
  onCommit,
  onGenerateAi,
  onSetLanguage,
  onToggleAmend,
  onStash,
  onUndo,
}: CommitComposerProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const showBody = bodyOpen || body.trim().length > 0;

  useEffect(() => {
    if (bodyOpen) bodyRef.current?.focus();
  }, [bodyOpen]);

  const commitLabel = committing
    ? amendMode
      ? t("commitPanel.amendTitle")
      : t("commitPanel.commitTitle")
    : amendMode
      ? t("common.amend")
      : t("commitPanel.commitTo", { branch: currentBranch ?? "…" });

  const subjectTone =
    subjectLen > 72 ? "over" : subjectLen > 60 ? "warn" : subjectLen > 0 ? "ok" : "idle";

  const signingActive = !!signingInfo?.commitSign;
  const signingFormat = signingActive ? signingFormatLabel(signingInfo?.format) : "";
  const signingKey = shortSigningKey(signingInfo?.signingKey);
  const signingTitle = signingActive
    ? [
        t("commitPanel.signingTooltip", { format: signingFormat }),
        signingKey ? t("commitPanel.signingKeyTooltip", { key: signingKey }) : "",
        signingInfo && !signingInfo.toolAvailable
          ? t("commitPanel.signingToolMissing", { program: signingInfo.program })
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const onKeyCommit = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCommit && !committing) {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <LayoutGroup id="commit-composer">
      <m.div
        layout
        transition={spring}
        className={cn(
          "mx-2 mb-2 mt-1 overflow-hidden rounded-2xl border bg-background/80 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-[border-color,box-shadow] duration-300",
          focused
            ? "border-ring/50 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_10px_28px_-10px_rgba(0,0,0,0.4)]"
            : "border-border/50",
          amendMode && "border-git-modified/40",
        )}
      >
        <AnimatePresence initial={false}>
          {amendMode && (
            <m.div
              key="amend-banner"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 bg-git-modified/10 px-3 py-1.5 text-[11px] font-medium text-git-modified">
                <Pencil className="size-3 shrink-0" />
                <span className="truncate">{t("commitPanel.amendBanner")}</span>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <div className="flex items-start gap-1 px-2.5 pt-2.5">
          <Input
            data-commit-message-input=""
            variant="bare"
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            onKeyDown={onKeyCommit}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("commitPanel.messagePlaceholder")}
            className="flex-1 py-1 text-[13px] font-medium leading-snug tracking-tight placeholder:font-normal"
          />

          <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  title={t("commitPanel.aiLanguageTitle")}
                  className={cn(
                    "font-mono tabular-nums",
                    repoAiLanguage ? "opacity-100" : "opacity-40 hover:opacity-100",
                  )}
                >
                  {languageShort(effectiveLanguage)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuLabel>{t("commitPanel.aiLanguageLabel")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onSetLanguage(undefined)}
                  className={!repoAiLanguage ? "font-medium" : ""}
                >
                  {t("commitPanel.aiLanguageDefault", {
                    lang: languageShort(globalAiLanguage),
                  })}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {AI_LANGUAGES.map(({ label, short }) => (
                  <DropdownMenuItem
                    key={label}
                    onClick={() => onSetLanguage(label)}
                    className={repoAiLanguage === label ? "font-medium" : ""}
                  >
                    <span className="w-7 text-muted-foreground">{short}</span>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={t("commitPanel.aiTitle")}
              aria-label={t("commitPanel.aiAria")}
              disabled={stagedFiles === 0 || aiGenerating}
              onClick={onGenerateAi}
            >
              <AnimatePresence mode="wait" initial={false}>
                {aiGenerating ? (
                  <m.span
                    key="spin"
                    initial={{ opacity: 0, scale: 0.7, rotate: -40 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.7, rotate: 40 }}
                    transition={{ duration: 0.15 }}
                    className="flex"
                  >
                    <Loader2 className="size-3.5 animate-spin" />
                  </m.span>
                ) : (
                  <m.span
                    key="spark"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="flex"
                  >
                    <Sparkles className="size-3.5" />
                  </m.span>
                )}
              </AnimatePresence>
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {showBody ? (
            <m.div
              key="body"
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring}
              className="overflow-hidden"
            >
              <div className="mx-2.5 mt-1 border-t border-border/40" />
              <Textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                onKeyDown={onKeyCommit}
                onFocus={() => {
                  setFocused(true);
                  setBodyOpen(true);
                }}
                onBlur={() => {
                  setFocused(false);
                  if (!body.trim()) setBodyOpen(false);
                }}
                placeholder={t("commitPanel.bodyPlaceholder")}
                rows={2}
                className="resize-none border-0 bg-transparent px-2.5 py-2 text-[12.5px] leading-relaxed shadow-none focus-visible:ring-0"
              />
            </m.div>
          ) : (
            <m.div
              key="body-toggle"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="px-2.5 pb-0.5"
            >
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setBodyOpen(true)}
              >
                <Plus />
                {t("commitPanel.addDescription")}
              </Button>
            </m.div>
          )}
        </AnimatePresence>

        <m.div
          layout
          className="flex items-center gap-2 border-t border-border/40 px-2.5 py-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <AnimatePresence initial={false}>
              {stagedFiles > 0 && (
                <m.span
                  key="staged"
                  layout
                  initial={{ opacity: 0, scale: 0.85, x: -6 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: -6 }}
                  transition={spring}
                  className="truncate rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                >
                  {t("commitPanel.stagedSummary", {
                    count: stagedFiles,
                    unit: stagedFiles === 1 ? t("common.file") : t("common.files"),
                  })}
                </m.span>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {signingActive && (
                <m.span
                  key="signing"
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={spring}
                  title={signingTitle}
                  aria-label={signingTitle}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    signingInfo?.toolAvailable
                      ? "bg-git-added/10 text-git-added"
                      : "bg-git-modified/10 text-git-modified",
                  )}
                >
                  <ShieldCheck className="size-3" aria-hidden />
                  {t("commitPanel.signingBadge", { format: signingFormat })}
                </m.span>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {subjectLen > 0 && (
                <m.span
                  key="chars"
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={spring}
                  className={cn(
                    "font-mono text-[10px] tabular-nums transition-colors duration-200",
                    subjectTone === "over" && "text-destructive",
                    subjectTone === "warn" && "text-git-modified",
                    subjectTone === "ok" && "text-muted-foreground/45",
                  )}
                >
                  {subjectLen}
                </m.span>
              )}
            </AnimatePresence>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={t("commitPanel.stashTitle")}
            aria-label={t("commitPanel.stashAria")}
            disabled={!canStash}
            onClick={onStash}
          >
            <Archive />
          </Button>

          <div className="flex items-stretch">
            <m.button
              type="button"
              layout
              whileTap={canCommit && !committing ? { scale: 0.97 } : undefined}
              transition={spring}
              onClick={onCommit}
              disabled={!canCommit || committing}
              className={cn(
                "relative flex h-8 max-w-[220px] items-center justify-center gap-1.5 overflow-hidden rounded-l-xl px-3 text-[12.5px] font-medium transition-colors",
                amendMode
                  ? "bg-git-modified text-white hover:bg-git-modified disabled:bg-git-modified/50"
                  : canCommit
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={commitLabel}
                  initial={{ y: 10, opacity: 0, filter: "blur(4px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: -10, opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-1.5 truncate"
                >
                  {committing && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
                  <span className="truncate">{commitLabel}</span>
                </m.span>
              </AnimatePresence>
            </m.button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={amendMode ? "default" : canCommit ? "default" : "secondary"}
                  size="icon"
                  className={cn(
                    "h-8 w-7 shrink-0 rounded-l-none rounded-r-xl border-0 border-l",
                    amendMode
                      ? "border-git-modified/40 bg-git-modified text-white hover:bg-git-modified"
                      : canCommit
                        ? "border-primary-foreground/15 bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border-border/40",
                  )}
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onClick={onToggleAmend}>
                  <Pencil className="size-3.5" />
                  {t("common.amend")}
                  {amendMode && <Check className="ml-auto size-3.5 text-primary" />}
                </DropdownMenuItem>
                {canUndo && (
                  <DropdownMenuItem onClick={onUndo}>
                    <Undo2 className="size-3.5" />
                    {t("commitPanel.undoLastCommit")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </m.div>
      </m.div>
    </LayoutGroup>
  );
}
