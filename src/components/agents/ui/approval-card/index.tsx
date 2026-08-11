"use client";
// beui.dev/components/agents/approval-card

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  LoaderCircle,
  MessageSquareText,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentDisclosure } from "@/components/agents/ui/agent-disclosure";
import { ActionSwapRollText } from "@/components/motion/action-swap-roll";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EASE_OUT, SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";
import type {
  ApprovalCardAnswer,
  ApprovalCardAnswers,
  ApprovalCardProps,
  ApprovalCardQuestion,
  ApprovalCardStatus,
} from "./types";

export type {
  ApprovalCardAnswer,
  ApprovalCardAnswers,
  ApprovalCardOption,
  ApprovalCardProps,
  ApprovalCardQuestion,
  ApprovalCardStatus,
} from "./types";

const EMPTY_ANSWER: ApprovalCardAnswer = { selected: [], custom: "" };

function getStatusLabel(status: ApprovalCardStatus, t: (key: string) => string) {
  if (status === "submitting") return t("agentChat.request.statusSubmitting");
  if (status === "approved") return t("agentChat.request.statusApproved");
  if (status === "rejected") return t("agentChat.request.statusRejected");
  if (status === "changes-requested") return t("agentChat.request.statusChangesRequested");
  if (status === "answered") return t("agentChat.request.statusAnswered");
  return t("agentChat.request.statusRequired");
}

function getStatusClass(status: ApprovalCardStatus) {
  if (status === "approved" || status === "answered") {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (status === "rejected") return "text-rose-600 dark:text-rose-400";
  if (status === "changes-requested") {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-muted-foreground";
}

function getStatusBadgeClass(status: ApprovalCardStatus) {
  if (status === "pending" || status === "changes-requested") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  if (status === "submitting") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400";
  }
  if (status === "approved" || status === "answered") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
}

function isAnswered(answer: ApprovalCardAnswer) {
  return answer.selected.length > 0 || Boolean(answer.custom?.trim());
}

function QuestionOptions({
  question,
  answer,
  disabled,
  onChange,
  onSingleSelect,
}: {
  question: ApprovalCardQuestion;
  answer: ApprovalCardAnswer;
  disabled: boolean;
  onChange: (answer: ApprovalCardAnswer) => void;
  onSingleSelect?: () => void;
}) {
  const custom = answer.custom ?? "";

  return (
    <div className="mt-3">
      {question.options?.length ? (
        question.multiple ? (
          <div className="grid gap-0.5">
            {question.options.map((option) => (
              <label key={option.value} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1 has-disabled:cursor-not-allowed has-disabled:opacity-60">
                <Checkbox
                  checked={answer.selected.includes(option.value)}
                  disabled={disabled || option.disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...answer,
                      selected: checked === true
                        ? [...answer.selected, option.value]
                        : answer.selected.filter((value) => value !== option.value),
                    })
                  }
                />
                <span className="select-none text-sm text-foreground">{option.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <RadioGroup
            value={answer.selected[0] ?? ""}
            onValueChange={(value) => {
              onChange({ selected: [value], custom: "" });
              onSingleSelect?.();
            }}
            className="gap-0.5"
          >
            {question.options.map((option) => (
              <label key={option.value} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1 has-disabled:cursor-not-allowed has-disabled:opacity-60">
                <RadioGroupItem
                  value={option.value}
                  disabled={disabled || option.disabled}
                />
                <span className="select-none text-sm text-foreground">{option.label}</span>
              </label>
            ))}
          </RadioGroup>
        )
      ) : null}

      {question.allowCustom ? (
        <Input
          type={question.secret ? "password" : "text"}
          autoComplete={question.secret ? "off" : undefined}
          value={custom}
          disabled={disabled}
          placeholder={question.customPlaceholder ?? "Add another response…"}
          onChange={(event) =>
            onChange({
              selected: question.multiple ? answer.selected : [],
              custom: event.target.value,
            })
          }
          className={cn(
            "h-10 rounded-xl border-0 bg-background/70 px-3 text-sm focus-visible:bg-background",
            question.options?.length && "mt-1.5",
          )}
        />
      ) : null}
    </div>
  );
}

function ProgressDots({ current, ids }: { current: number; ids: string[] }) {
  const { t } = useTranslation();
  return (
    <span className="flex gap-1.5">
      <span className="sr-only">
        {t("agentChat.request.questionProgress", { current: current + 1, total: ids.length })}
      </span>
      {ids.map((id, index) => (
        <motion.span
          key={id}
          aria-hidden="true"
          initial={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          animate={{
            scale: index === current ? 1 : 0.75,
            opacity: index <= current ? 1 : 0.35,
          }}
          transition={SPRING_SWAP}
          className="size-1.5 rounded-full bg-current"
        />
      ))}
    </span>
  );
}

export function ApprovalCard({
  title = "Approval required",
  description,
  children,
  questions = [],
  status = "pending",
  answers,
  defaultAnswers = {},
  onAnswersChange,
  step,
  defaultStep = 0,
  onStepChange,
  onSubmit,
  onApprove,
  onReject,
  onRequestChanges,
  onDismiss,
  approveLabel = "Approve",
  submitLabel = "Submit response",
  result,
  className,
}: ApprovalCardProps) {
  const { t } = useTranslation();
  const reduce = useReducedMotion() ?? false;
  const [internalAnswers, setInternalAnswers] =
    useState<ApprovalCardAnswers>(defaultAnswers);
  const [internalStep, setInternalStep] = useState(defaultStep);
  const autoAdvanceTimer = useRef<number | undefined>(undefined);
  const currentAnswers = answers ?? internalAnswers;
  const currentStep = Math.min(
    Math.max(0, step ?? internalStep),
    Math.max(0, questions.length - 1),
  );
  const question = questions[currentStep];
  const questionMode = questions.length > 0;
  const pending = status === "pending";
  const busy = status === "submitting";
  const interactive = pending || busy;
  const currentAnswer = question
    ? (currentAnswers[question.id] ?? EMPTY_ANSWER)
    : EMPTY_ANSWER;
  const displayTitle = question?.title ?? title;
  const titleKey = question?.id ?? String(status);
  const statusLabel = getStatusLabel(status, t);

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimer.current === undefined) return;
    window.clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = undefined;
  }, []);

  useEffect(() => clearAutoAdvance, [clearAutoAdvance]);

  const setAnswers = useCallback(
    (next: ApprovalCardAnswers) => {
      if (answers === undefined) setInternalAnswers(next);
      onAnswersChange?.(next);
    },
    [answers, onAnswersChange],
  );

  const setStep = (next: number) => {
    clearAutoAdvance();
    if (step === undefined) setInternalStep(next);
    onStepChange?.(next);
  };

  const updateCurrentAnswer = (next: ApprovalCardAnswer) => {
    if (!question) return;
    setAnswers({ ...currentAnswers, [question.id]: next });
  };

  const continueQuestion = () => {
    if (currentStep < questions.length - 1) {
      setStep(currentStep + 1);
      return;
    }
    onSubmit?.(currentAnswers);
  };

  const queueAutoAdvance = () => {
    if (
      !question ||
      question.multiple ||
      question.autoAdvance === false ||
      currentStep >= questions.length - 1 ||
      busy
    ) {
      return;
    }

    clearAutoAdvance();
    autoAdvanceTimer.current = window.setTimeout(() => {
      setStep(currentStep + 1);
    }, 240);
  };

  return (
    <div
      data-state={status}
      aria-busy={busy}
      className={cn(
        "ag-card w-full overflow-hidden p-4 text-sm shadow-[var(--ag-shadow-raise)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-5 shrink-0 place-items-center text-muted-foreground",
            getStatusClass(status),
          )}
        >
          {busy ? (
            <LoaderCircle className={cn("size-4", !reduce && "animate-spin")} />
          ) : interactive ? (
            questionMode ? (
              <CircleHelp className="size-4" />
            ) : (
              <MessageSquareText className="size-4" />
            )
          ) : status === "rejected" ? (
            <X className="size-4" />
          ) : (
            <Check className="size-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-3">
            <h3 className="min-w-0 flex-1 text-[14px] font-medium leading-5">
              <ActionSwapRollText value={titleKey}>
                {displayTitle}
              </ActionSwapRollText>
            </h3>
            {questionMode && interactive ? (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground/65">
                {currentStep + 1}/{questions.length}
              </span>
            ) : (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  getStatusBadgeClass(status),
                )}
              >
                {statusLabel}
              </span>
            )}
            {onDismiss ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="ag-icon-btn size-5 rounded-full"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>

          <AgentDisclosure open={interactive}>
            {questionMode && question ? (
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={question.id}
                  initial={reduce ? { opacity: 1 } : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                >
                  {question.description ? (
                    <div className="ag-muted mt-1 leading-5">
                      {question.description}
                    </div>
                  ) : null}
                  <QuestionOptions
                    question={question}
                    answer={currentAnswer}
                    disabled={busy}
                    onChange={updateCurrentAnswer}
                    onSingleSelect={queueAutoAdvance}
                  />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div>
                {description ? (
                  <p className="ag-muted mt-1 leading-5">
                    {description}
                  </p>
                ) : null}
                {children ? <div className="mt-3">{children}</div> : null}
              </div>
            )}

            {questionMode ? (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("agentChat.request.previousQuestion")}
                  disabled={busy || currentStep === 0}
                  onClick={() => setStep(currentStep - 1)}
                  className="rounded-full"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <ProgressDots
                  current={currentStep}
                  ids={questions.map((item) => item.id)}
                />
                {onReject ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={onReject}
                    className="ml-auto rounded-full text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    {t("agentChat.request.reject")}
                  </Button>
                ) : null}
                <Button
                  size={currentStep === questions.length - 1 ? "sm" : "icon"}
                  aria-label={
                    currentStep === questions.length - 1
                      ? t("agentChat.request.sendAnswer")
                      : t("agentChat.request.nextQuestion")
                  }
                  disabled={busy || (!question?.optional && !isAnswered(currentAnswer))}
                  onClick={continueQuestion}
                  className={cn("rounded-full", !onReject && "ml-auto")}
                >
                  {busy ? (
                    <LoaderCircle className={cn("size-4", !reduce && "animate-spin")} />
                  ) : currentStep === questions.length - 1 ? (
                    <>
                      {submitLabel}
                      <ArrowRight className="size-3.5" />
                    </>
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={onApprove}
                  className="rounded-full"
                >
                  {approveLabel}
                </Button>
                {onRequestChanges ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={onRequestChanges}
                    className="rounded-full"
                  >
                    {t("agentChat.request.requestChanges")}
                  </Button>
                ) : null}
                {onReject ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={onReject}
                    className="rounded-full text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    {t("agentChat.request.reject")}
                  </Button>
                ) : null}
              </div>
            )}
          </AgentDisclosure>

          {!interactive ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {result ?? statusLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
