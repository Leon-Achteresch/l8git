import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronUp, FileText, Info, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  COMMIT_TYPES, addCommitBodyTemplate, addCommitTrailer, inspectCommitMessage,
  updateConventionalSubject,
} from "@/lib/commit-message";
import { useCommitMessagePrefs } from "@/lib/commit-message-prefs";

export function CommitMessageGuidance({ subject, body, onSubjectChange, onBodyChange, disabled = false, compact = false }: {
  subject: string;
  body: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const preferredExpanded = useCommitMessagePrefs((s) => s.guidanceExpanded);
  const setPreferredExpanded = useCommitMessagePrefs((s) => s.setGuidanceExpanded);
  const [compactExpanded, setCompactExpanded] = useState(false);
  const expanded = compact ? compactExpanded : preferredExpanded;
  const setExpanded = compact ? setCompactExpanded : setPreferredExpanded;
  const analysis = useMemo(() => inspectCommitMessage(subject, body), [subject, body]);
  const conventional = analysis.conventional;
  const [trailerKey, setTrailerKey] = useState<"Refs" | "Closes" | "BREAKING CHANGE">("Refs");
  const [trailerValue, setTrailerValue] = useState("");

  const appendTrailer = () => {
    if (disabled || !trailerValue.trim()) return;
    onBodyChange(addCommitTrailer(body, trailerKey, trailerValue));
    setTrailerValue("");
  };

  return (
    <div className={cn("space-y-1.5 text-[0.6875rem]", !compact && "px-2.5 pb-2")}>
      <div className="flex flex-wrap items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="xs" variant="ghost" disabled={disabled} aria-label={t("commitGuidance.typeLabel")}>
              <span className={cn(conventional && "font-mono text-primary")}>{conventional?.type ?? t("commitGuidance.type")}</span>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>{t("commitGuidance.conventionalTitle")}</DropdownMenuLabel>
            {COMMIT_TYPES.map((type) => (
              <DropdownMenuItem key={type} onClick={() => onSubjectChange(updateConventionalSubject(subject, { type }))}>
                <span className="w-16 shrink-0 font-mono text-xs">{type}</span>
                <span className="text-xs text-muted-foreground">{t(`commitGuidance.types.${type}`)}</span>
                {conventional?.type === type && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            ))}
            {conventional && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSubjectChange(updateConventionalSubject(subject, { type: null }))}>
                {t("commitGuidance.removeType")}
              </DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>

        {conventional && !compact ? <>
          <Input
            inputSize="xs"
            value={conventional.scope}
            onChange={(event) => onSubjectChange(updateConventionalSubject(subject, { scope: event.target.value }))}
            disabled={disabled}
            aria-label={t("commitGuidance.scope")}
            placeholder={t("commitGuidance.scope")}
            className="w-28 border-border/50 bg-transparent text-[0.6875rem]"
          />
          <Button
            type="button" size="xs" variant={conventional.breaking ? "secondary" : "ghost"}
            disabled={disabled} aria-pressed={conventional.breaking}
            title={t("commitGuidance.breakingHint")}
            className={cn(conventional.breaking && "text-git-modified")}
            onClick={() => onSubjectChange(updateConventionalSubject(subject, { breaking: !conventional.breaking }))}
          >
            {conventional.breaking && <TriangleAlert className="size-3" />}
            {t("commitGuidance.breaking")}
          </Button>
        </> : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="xs" variant="ghost" disabled={disabled} aria-label={t("commitGuidance.structureLabel")}>
              <FileText className="size-3" />
              {t("commitGuidance.structure")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuLabel>{t("commitGuidance.editableTemplates")}</DropdownMenuLabel>
            {(["summary", "behavior", "breaking"] as const).map((kind) => (
              <DropdownMenuItem key={kind} onClick={() => {
                onBodyChange(addCommitBodyTemplate(body, t(`commitGuidance.templates.${kind}.body`)));
                if (kind === "breaking" && conventional && !conventional.breaking) {
                  onSubjectChange(updateConventionalSubject(subject, { breaking: true }));
                }
              }}>
                {t(`commitGuidance.templates.${kind}.label`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button" size="xs" variant="ghost"
          className={cn("ml-auto", analysis.insights.length > 0 ? "text-git-modified" : "text-muted-foreground")}
          aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          title={t("commitGuidance.nonBlocking")}
        >
          <Info className="size-3" />
          {analysis.insights.length > 0
            ? t("commitGuidance.hints", { count: analysis.insights.length })
            : t("commitGuidance.help")}
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      </div>

      {expanded ? (
        <div id={id} className="space-y-2 rounded-lg bg-muted/40 px-2.5 py-2">
          {analysis.insights.length > 0 ? (
            <ul className="space-y-1 text-muted-foreground">
              {analysis.insights.map((insight) => (
                <li key={insight.code} className="flex items-start gap-1.5">
                  <span className="mt-[5px] size-1 shrink-0 rounded-full bg-git-modified" aria-hidden />
                  <span>{t(`commitGuidance.insights.${insight.code}`, { count: insight.count, lines: insight.lines })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">{t(subject.trim() ? "commitGuidance.goodMessage" : "commitGuidance.startHint")}</p>}
          <p className="text-muted-foreground/70">{t("commitGuidance.nonBlocking")}</p>
          {!compact ? (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="xs" variant="outline" disabled={disabled} aria-label={t("commitGuidance.trailerType")}>
                    {trailerKey}<ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top">
                  {(["Refs", "Closes", "BREAKING CHANGE"] as const).map((key) => (
                    <DropdownMenuItem key={key} onClick={() => setTrailerKey(key)}>{key}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                inputSize="xs" value={trailerValue}
                onChange={(event) => setTrailerValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                    appendTrailer();
                  }
                }}
                disabled={disabled} aria-label={t("commitGuidance.trailerValue")}
                placeholder={t(trailerKey === "BREAKING CHANGE" ? "commitGuidance.migrationPlaceholder" : "commitGuidance.issuePlaceholder")}
                className="min-w-0 flex-1 bg-transparent"
              />
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || !trailerValue.trim()} onClick={appendTrailer} aria-label={t("commitGuidance.addTrailer")}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
