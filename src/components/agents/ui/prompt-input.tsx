"use client";
// beui.dev/components/agents/prompt-input

import { ArrowUp, Plus, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/motion/button";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/motion/select";
import { SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export interface PromptModel {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PromptAction {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface PromptSlashCommand {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  acceptsArgument?: boolean;
}

export interface PromptInputProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange" | "onSubmit" | "children"
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  models?: PromptModel[];
  model?: string;
  defaultModel?: string;
  onModelChange?: (model: string) => void;
  actions?: PromptAction[];
  onAction?: (action: string) => void;
  slashCommands?: PromptSlashCommand[];
  onSlashCommand?: (command: string, argument: string) => void | Promise<void>;
  onSubmit?: (value: string, model?: string) => void | Promise<void>;
  loading?: boolean;
  /** Keep Enter-to-submit active while the stop button represents an active turn. */
  allowSubmitWhileLoading?: boolean;
  allowEmptySubmit?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  leadingAction?: ReactNode;
  trailingAction?: ReactNode;
  className?: string;
}

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  models = [],
  model,
  defaultModel,
  onModelChange,
  actions = [],
  onAction,
  slashCommands = [],
  onSlashCommand,
  onSubmit,
  loading = false,
  allowSubmitWhileLoading = false,
  allowEmptySubmit = false,
  onStop,
  minRows = 2,
  maxRows = 8,
  leadingAction,
  trailingAction,
  className,
  disabled,
  placeholder = "Ask the agent to do something…",
  "aria-label": ariaLabel = "Prompt",
  onKeyDown,
  ...textareaProps
}: PromptInputProps) {
  const reduce = useReducedMotion() ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalModel, setInternalModel] = useState(
    defaultModel ?? models[0]?.value,
  );
  const [actionsOpen, setActionsOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [dismissedSlashValue, setDismissedSlashValue] = useState<string | null>(null);
  const currentValue = value ?? internalValue;
  const currentModelValue = model ?? internalModel;
  const currentModel = models.find(
    (option) => option.value === currentModelValue,
  );
  const canSubmit =
    (Boolean(currentValue.trim()) || allowEmptySubmit) &&
    !disabled &&
    (!loading || allowSubmitWhileLoading);
  const slashMatch = currentValue.includes("\n")
    ? null
    : /^\/([^\s]*)(?:\s(.*))?$/u.exec(currentValue);
  const slashQuery = slashMatch?.[1]?.toLocaleLowerCase() ?? "";
  const slashArgument = slashMatch?.[2] ?? "";
  const filteredSlashCommands = slashMatch && currentValue !== dismissedSlashValue
    ? slashCommands.filter((command) => command.value.toLocaleLowerCase().includes(slashQuery))
    : [];
  const slashOpen = filteredSlashCommands.length > 0;

  useEffect(() => {
    setSlashIndex(0);
    if (dismissedSlashValue !== null && dismissedSlashValue !== currentValue) {
      setDismissedSlashValue(null);
    }
  }, [currentValue, dismissedSlashValue, slashQuery]);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const measurement = measurementRef.current;
    if (!textarea || !measurement || textarea.value !== currentValue) return;

    const lineHeight = 24;
    const nextHeight = Math.min(
      Math.max(measurement.scrollHeight, minRows * lineHeight),
      maxRows * lineHeight,
    );
    const height = `${nextHeight}px`;
    if (textarea.style.height !== height) textarea.style.height = height;
  }, [currentValue, maxRows, minRows]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeTextarea);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [resizeTextarea]);

  const setValue = (next: string) => {
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
  };

  const setModel = (next: string) => {
    if (model === undefined) setInternalModel(next);
    onModelChange?.(next);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = currentValue.trim();
    if ((!prompt && !allowEmptySubmit) || disabled || (loading && !allowSubmitWhileLoading)) return;

    onSubmit?.(prompt, currentModelValue);
    if (value === undefined) setInternalValue("");
    textareaRef.current?.focus({ preventScroll: true });
  };

  const runSlashCommand = (command: PromptSlashCommand) => {
    if (command.disabled) return;
    if (command.acceptsArgument && !slashArgument && slashMatch?.[0] === `/${slashQuery}`) {
      setValue(`/${command.value} `);
      return;
    }
    setValue("");
    setDismissedSlashValue(null);
    void onSlashCommand?.(command.value, slashArgument.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (slashOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((index) => (index + 1) % filteredSlashCommands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex((index) => (index - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedSlashValue(currentValue);
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        const command = filteredSlashCommands[slashIndex] ?? filteredSlashCommands[0];
        if (command) runSlashCommand(command);
        return;
      }
    }
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "relative w-full rounded-2xl border border-border/80 bg-background p-2 transition-colors focus-within:border-foreground/25",
        disabled && "opacity-60",
        className,
      )}
    >
      {slashOpen ? (
        <div className="absolute inset-x-0 bottom-[calc(100%+8px)] z-40 max-h-72 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-xl">
          {filteredSlashCommands.map((command, index) => (
            <button
              key={command.value}
              type="button"
              disabled={command.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setSlashIndex(index)}
              onClick={() => runSlashCommand(command)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left outline-none disabled:pointer-events-none disabled:opacity-45",
                index === slashIndex ? "bg-muted" : "hover:bg-muted/70",
              )}
            >
              <span className="w-24 shrink-0 font-mono text-xs font-medium">/{command.value}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs">{command.label}</span>
                {command.description ? (
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {command.description}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={measurementRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-2 top-0 whitespace-pre-wrap px-2 text-sm leading-6 [overflow-wrap:break-word]"
      >
        {`${currentValue}\u200b`}
      </div>
      <textarea
        ref={textareaRef}
        value={currentValue}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={minRows}
        {...textareaProps}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        className="scrollbar-hide block w-full resize-none overflow-y-auto bg-transparent px-2 pt-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/55"
      />

      <div className="mt-1 flex min-h-8 items-center gap-1">
        {actions.length ? (
          <MorphPopover open={actionsOpen} onOpenChange={setActionsOpen}>
            <MorphPopoverTrigger>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || loading}
                aria-label="Add to prompt"
                className="size-8 rounded-full"
              >
                <motion.span
                  aria-hidden="true"
                  animate={{ rotate: actionsOpen ? 45 : 0 }}
                  transition={reduce ? { duration: 0 } : SPRING_SWAP}
                >
                  <Plus className="size-4" />
                </motion.span>
              </Button>
            </MorphPopoverTrigger>

            <MorphPopoverContent
              side="top"
              align="start"
              sideOffset={8}
              radius={12}
              className="w-56 p-1.5"
            >
              {actions.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    onAction?.(action.value);
                    setActionsOpen(false);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50"
                >
                  {action.icon ? (
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
                      {action.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">
                      {action.label}
                    </span>
                    {action.description ? (
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        {action.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </MorphPopoverContent>
          </MorphPopover>
        ) : null}
        {leadingAction}
        {models.length ? (
          <Select
            value={currentModelValue}
            onValueChange={setModel}
            disabled={disabled || loading}
            className="min-w-0"
          >
            <SelectTrigger className="h-8 w-auto max-w-52 rounded-xl border-0 bg-transparent px-2 py-0 text-xs hover:bg-muted focus-visible:ring-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {currentModel?.icon ? (
                  <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-3.5">
                    {currentModel.icon}
                  </span>
                ) : null}
                <span className="truncate text-muted-foreground">
                  {currentModel?.label ?? "Choose model"}
                </span>
              </span>
            </SelectTrigger>
            <SelectContent className="right-auto w-52 shadow-none">
              {models.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {option.icon ? (
                      <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {option.label}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {trailingAction ? <span className="ml-auto flex items-center">{trailingAction}</span> : null}
        <Button
          type={loading ? "button" : "submit"}
          size="icon"
          disabled={loading ? !onStop : !canSubmit}
          aria-label={loading ? "Stop generating" : "Send prompt"}
          onClick={loading ? onStop : undefined}
          className={cn("size-8 rounded-full", !trailingAction && "ml-auto")}
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={loading ? "stop" : "send"}
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 3, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.8 }}
              transition={reduce ? { duration: 0 } : SPRING_SWAP}
              className="grid place-items-center"
            >
              {loading ? (
                <Square className="size-3 fill-current" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
    </form>
  );
}
