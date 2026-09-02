"use client";

import { ArrowUp, Plus, Square } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { SPRING_LAYOUT, SPRING_SWAP } from "@/lib/motion/ease";
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
  allowSubmitWhileLoading?: boolean;
  allowEmptySubmit?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  leadingAction?: ReactNode;
  trailingAction?: ReactNode;
  header?: ReactNode;
  className?: string;
}

const LINE_HEIGHT = 24;
const TEXTAREA_PADDING = 4;

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
  maxRows = 10,
  leadingAction,
  trailingAction,
  header,
  className,
  disabled,
  placeholder = "Ask the agent to do something…",
  "aria-label": ariaLabel = "Prompt",
  onKeyDown,
  ...textareaProps
}: PromptInputProps) {
  const reduce = useReducedMotion() ?? false;
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalModel, setInternalModel] = useState(defaultModel ?? models[0]?.value);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [dismissedSlashValue, setDismissedSlashValue] = useState<string | null>(null);
  const currentValue = value ?? internalValue;
  const currentModelValue = model ?? internalModel;
  const currentModel = models.find((option) => option.value === currentModelValue);
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

    const nextHeight = Math.min(
      Math.max(measurement.scrollHeight, minRows * LINE_HEIGHT + TEXTAREA_PADDING),
      maxRows * LINE_HEIGHT + TEXTAREA_PADDING,
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
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <m.form
      data-agent-composer=""
      onSubmit={submit}
      animate={reduce ? undefined : { y: focused ? -2 : 0 }}
      transition={SPRING_LAYOUT}
      className={cn("ag-composer relative min-w-0 w-full p-2", disabled && "opacity-60", className)}
    >
      {slashOpen ? (
        <div
          role="listbox"
          aria-label="Commands"
          className="ag-menu ag-scroll absolute inset-x-0 bottom-[calc(100%+8px)] z-40 max-h-80 overflow-y-auto p-1.5"
        >
          <p className="ag-label px-2 pb-1 pt-1">Commands</p>
          {filteredSlashCommands.map((command, index) => (
            <Button
              key={command.value}
              type="button"
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={index === slashIndex}
              disabled={command.disabled}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setSlashIndex(index)}
              onClick={() => runSlashCommand(command)}
              data-active={index === slashIndex}
              className="ag-menu-item gap-2.5"
            >
              <span className="ag-slash-token w-24 shrink-0 truncate font-mono text-[12px]">
                /{command.value}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ag-text)]">
                {command.label}
              </span>
              {command.description ? (
                <span className="ag-faint hidden min-w-0 max-w-[42%] shrink-0 truncate text-[11px] sm:block">
                  {command.description}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      ) : null}

      {header ? <div className="px-1 pb-1.5 pt-0.5">{header}</div> : null}

      <div className="relative">
        <div
          ref={measurementRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap px-2 pt-1 text-sm leading-6 [overflow-wrap:break-word]"
        >
          {`${currentValue}​`}
        </div>
        {slashMatch ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 whitespace-pre-wrap px-2 pt-1 text-sm leading-6 text-transparent [overflow-wrap:break-word]"
          >
            <span className="ag-slash">{`/${slashMatch[1] ?? ""}`}</span>
            {currentValue.slice((slashMatch[1] ?? "").length + 1)}
          </div>
        ) : null}
        <Textarea
          ref={textareaRef}
          value={currentValue}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          rows={minRows}
          {...textareaProps}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true);
            setActionsOpen(false);
          }}
          onBlur={() => setFocused(false)}
          data-agent-prompt=""
          className="scrollbar-hide relative block min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-2 pt-1 text-sm leading-6 text-[var(--ag-text)] shadow-none outline-none placeholder:text-[var(--ag-text-3)] focus-visible:ring-0"
        />
      </div>

      <div
        data-agent-composer-toolbar=""
        className="mt-1.5 flex min-w-0 items-end gap-1.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max flex-nowrap items-center gap-1">
          {actions.length ? (
            <Popover open={actionsOpen} onOpenChange={setActionsOpen} modal={false}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || loading}
                  aria-label="Add to prompt"
                  className="ag-icon-btn rounded-full"
                >
                  <m.span
                    aria-hidden="true"
                    animate={{ rotate: actionsOpen ? 45 : 0 }}
                    transition={reduce ? { duration: 0 } : SPRING_SWAP}
                    className="grid place-items-center"
                  >
                    <Plus className="size-4" />
                  </m.span>
                </Button>
              </PopoverTrigger>

              <PopoverContent
                side="bottom"
                align="start"
                sideOffset={8}
                avoidCollisions={false}
                className="ag-menu w-64 p-1.5"
                onCloseAutoFocus={(event) => event.preventDefault()}
              >
                {actions.map((action) => (
                  <Button
                    key={action.value}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={action.disabled}
                    onClick={() => {
                      onAction?.(action.value);
                      setActionsOpen(false);
                    }}
                    className="ag-menu-item items-start py-2"
                  >
                    {action.icon ? (
                      <span className="ag-faint mt-px grid size-4 shrink-0 place-items-center [&_svg]:size-4">
                        {action.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-[var(--ag-text)]">
                        {action.label}
                      </span>
                      {action.description ? (
                        <span className="ag-faint mt-px block text-[11px] leading-4">
                          {action.description}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}

          {models.length ? (
            <div className="min-w-0">
              <Select
                value={currentModelValue}
                onValueChange={setModel}
                disabled={disabled || loading}
              >
                <SelectTrigger className="ag-chip h-7 w-auto max-w-56 border-0 bg-transparent px-2 py-0 text-[12px] shadow-none focus-visible:ring-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {currentModel?.icon ? (
                      <span className="grid size-3.5 shrink-0 place-items-center [&_svg]:size-3.5">
                        {currentModel.icon}
                      </span>
                    ) : null}
                    <span className="truncate font-medium text-[var(--ag-text)]">
                      {currentModel?.label ?? "Choose model"}
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent className="ag-menu right-auto w-56 p-1.5 shadow-none">
                  {models.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      className="rounded-[9px] py-1.5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {option.icon ? (
                          <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">
                            {option.icon}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate text-[12px]">{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {leadingAction}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {trailingAction}
          <Button
            type={loading ? "button" : "submit"}
            size="icon"
            disabled={loading ? !onStop : !canSubmit}
            data-stop={loading || undefined}
            aria-label={loading ? "Stop generating" : "Send prompt"}
            onClick={loading ? onStop : undefined}
            className="ag-send shrink-0"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <m.span
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
              </m.span>
            </AnimatePresence>
          </Button>
        </div>
      </div>
    </m.form>
  );
}
