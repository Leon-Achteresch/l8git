import { ArrowUp, Folder, GitBranch, Mic, PieChart } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState, type KeyboardEvent } from "react";

import { ComposerAddMenu } from "./composer-add-menu";
import { ComposerModelMenu } from "./composer-model-menu";
import { ComposerPermissionMenu } from "./composer-permission-menu";
import { DEFAULT_ACTIONS, DEFAULT_MODELS, DEFAULT_PERMISSIONS } from "./defaults";
import type {
  ComposerAction,
  ComposerContext,
  ComposerModel,
  ComposerPermission,
  ComposerValue,
} from "./types";
import { SPRING_PANEL, SPRING_PRESS, SPRING_SWAP } from "@/lib/motion/ease";
import { cn } from "@/lib/utils";

export function AgentComposer({
  placeholder = "Hi, what do you need today?",
  context,
  models = DEFAULT_MODELS,
  permissions = DEFAULT_PERMISSIONS,
  actions = DEFAULT_ACTIONS,
  onSubmit,
  onAction,
  onDictate,
  className,
}: {
  placeholder?: string;
  context?: ComposerContext;
  models?: ComposerModel[];
  permissions?: ComposerPermission[];
  actions?: ComposerAction[];
  onSubmit?: (value: ComposerValue) => void;
  onAction?: (action: ComposerAction) => void;
  onDictate?: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [effort, setEffort] = useState(models[0]?.efforts?.[1] ?? models[0]?.efforts?.[0]);
  const [permissionId, setPermissionId] = useState(permissions[0]?.id ?? "");

  const reduce = useReducedMotion();
  const canSubmit = text.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit?.({ text: text.trim(), modelId, effort, permissionId });
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <m.div
      className={cn("w-full max-w-2xl", className)}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_PANEL}
    >
      {context && (
        <div className="mx-3 flex items-center gap-3 rounded-t-2xl bg-muted/70 px-3 pb-4 pt-2 text-xs text-muted-foreground">
          {context.branch && (
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3.5" strokeWidth={1.75} aria-hidden />
              {context.branch}
            </span>
          )}
          {context.project && (
            <span className="inline-flex items-center gap-1.5">
              <Folder className="size-3.5" strokeWidth={1.75} aria-hidden />
              {context.project}
            </span>
          )}
          {context.usedPercent !== undefined && (
            <span className="ml-auto inline-flex items-center gap-1.5">
              <PieChart className="size-3.5" strokeWidth={1.75} aria-hidden />
              {context.usedPercent}%
            </span>
          )}
        </div>
      )}

      <div className={cn("relative rounded-3xl border border-border/60 bg-background shadow-sm", context && "-mt-2")}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          className="max-h-60 w-full resize-none bg-transparent px-4 pb-2 pt-4 text-sm outline-none placeholder:text-muted-foreground"
        />

        <div className="flex items-center gap-1 px-2 pb-2">
          <ComposerAddMenu actions={actions} onSelect={onAction} />
          <ComposerPermissionMenu
            permissions={permissions}
            value={permissionId}
            onChange={setPermissionId}
          />

          <div className="ml-auto flex items-center gap-1">
            <ComposerModelMenu
              models={models}
              value={modelId}
              effort={effort}
              onChange={(id, nextEffort) => {
                setModelId(id);
                setEffort(nextEffort);
              }}
            />
            {onDictate && (
              <m.button
                type="button"
                onClick={onDictate}
                aria-label="Dictate"
                whileTap={reduce ? undefined : { scale: 0.92 }}
                transition={SPRING_PRESS}
                className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 text-foreground/80 hover:bg-muted"
              >
                <Mic className="size-4" strokeWidth={1.75} />
              </m.button>
            )}
            <m.button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              aria-label="Send"
              whileTap={reduce || !canSubmit ? undefined : { scale: 0.92 }}
              animate={{ scale: canSubmit ? 1 : 0.96, opacity: canSubmit ? 1 : 0.4 }}
              transition={SPRING_SWAP}
              className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              <AnimatePresence mode="wait" initial={false}>
                <m.span
                  key={canSubmit ? "ready" : "idle"}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  className="inline-flex"
                >
                  <ArrowUp className="size-4" strokeWidth={2} />
                </m.span>
              </AnimatePresence>
            </m.button>
          </div>
        </div>
      </div>
    </m.div>
  );
}
