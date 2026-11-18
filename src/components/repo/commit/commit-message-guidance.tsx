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
import { inspectCoAuthorDraft, type CoAuthorDraftLine } from "@/lib/commit-trailers";

export function CommitMessageGuidance({ subject, body, onSubjectChange, onBodyChange, onEditCoAuthor, bodyStartsAfterBlankLine = true, disabled = false, compact = false }: {
  subject: string;
  body: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  onEditCoAuthor?: (line: CoAuthorDraftLine) => void;
  bodyStartsAfterBlankLine?: boolean;
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
  const hasCoAuthorEditor = onEditCoAuthor !== undefined;
  const coAuthors = useMemo(() => hasCoAuthorEditor ? inspectCoAuthorDraft(subject, body, bodyStartsAfterBlankLine) : [],
    [subject, body, bodyStartsAfterBlankLine, hasCoAuthorEditor]);
  const hintCount = analysis.insights.length + coAuthors.filter(line => line.formatHint || line.placementHint).length;
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
          className={cn("ml-auto", hintCount > 0 ? "text-git-modified" : "text-muted-foreground")}
          aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          title={t("commitGuidance.nonBlocking")}
        >
          <Info className="size-3" />
          {hintCount > 0
            ? t("commitGuidance.hints", { count: hintCount })
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
          ) : hintCount === 0 && <p className="text-muted-foreground">{t(subject.trim() ? "commitGuidance.goodMessage" : "commitGuidance.startHint")}</p>}
          <p className="text-muted-foreground/70">{t("commitGuidance.nonBlocking")}</p>
          {!compact ? (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="xs" variant="outline" disabled={disabled} aria-label={t("commitGuidance.trailerType")}>
                    {trailerKey}<ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-72">
                  {(["Refs", "Closes", "BREAKING CHANGE"] as const).map((key) => {
                    const hintId = key !== "BREAKING CHANGE" ? `${id}-${key}` : undefined;
                    return (
                      <DropdownMenuItem
                        key={key}
                        className="flex-col items-start gap-0.5 px-2 py-1.5"
                        textValue={key}
                        aria-label={key}
                        aria-describedby={hintId}
                        onClick={() => setTrailerKey(key)}
                      >
                        <span>{key}</span>
                        {hintId && (
                          <span id={hintId} className="text-xs text-muted-foreground">
                            {t(key === "Refs" ? "commitGuidance.refsIntent" : "commitGuidance.closesIntent")}
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
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
          {onEditCoAuthor && coAuthors.length > 0 && (
            <section aria-label={t("commitGuidance.coAuthor.title")} className="space-y-1.5 border-t border-border/50 pt-2">
              <h3 className="font-medium">{t("commitGuidance.coAuthor.title")}</h3>
              <ul className="max-h-40 divide-y divide-border/50 overflow-y-auto rounded-md border border-border/50">
                {coAuthors.map(line => {
                  const location = line.field === "subject"
                    ? t("commitGuidance.coAuthor.subject")
                    : t("commitGuidance.coAuthor.bodyLine", { line: line.line });
                  return (
                    <li key={`${line.field}-${line.line}`} className="space-y-1 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{location}</span>
                        <Button type="button" size="xs" variant="ghost" disabled={disabled}
                          aria-label={t("commitGuidance.coAuthor.editAt", { location })}
                          onClick={() => onEditCoAuthor(line)}>
                          {t("commitGuidance.coAuthor.edit")}
                        </Button>
                      </div>
                      <code className="block whitespace-pre-wrap break-all">{line.text}</code>
                      {(line.placementHint || line.formatHint) && (
                        <div className="space-y-0.5 border-l-2 border-git-modified pl-2 text-foreground">
                          {line.placementHint && <p>{t("commitGuidance.coAuthor.placement")}</p>}
                          {line.formatHint && <p>{t("commitGuidance.coAuthor.format")}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-muted-foreground">{t("commitGuidance.coAuthor.attribution")}</p>
            </section>
          )}
          {!compact && (
            <details className="space-y-1.5 border-t border-border/50 pt-2 text-muted-foreground">
              <summary className="cursor-pointer rounded-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t("commitGuidance.cleanup.title")}
              </summary>
              <p>{t("commitGuidance.cleanup.input")}</p>
              <p>{t("commitGuidance.cleanup.default")}</p>
              <ul className="space-y-0.5">
                {(["strip", "whitespace", "verbatim", "scissors"] as const).map(mode => (
                  <li key={mode}><code>{mode}</code>{" · "}{t(`commitGuidance.cleanup.${mode}`)}</li>
                ))}
              </ul>
              <p>{t("commitGuidance.cleanup.limits")}</p>
            </details>
          )}
        </div>
      ) : null}
    </div>
  );
}
