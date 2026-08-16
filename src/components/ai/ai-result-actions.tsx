import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AiResultActionsProps {
  busy: boolean;
  disabled?: boolean;
  onRegenerate: () => void;
  onRefine: (hint: string) => void;
  onCancel?: () => void;
  regenerateLabel?: string;
  refineLabel?: string;
  hintPlaceholder?: string;
  className?: string;
}

export function AiResultActions({
  busy,
  disabled = false,
  onRegenerate,
  onRefine,
  onCancel,
  regenerateLabel,
  refineLabel,
  hintPlaceholder,
  className,
}: AiResultActionsProps) {
  const { t } = useTranslation();
  const [hintOpen, setHintOpen] = useState(false);
  const [hint, setHint] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hintOpen) inputRef.current?.focus();
  }, [hintOpen]);

  const submitHint = useCallback(() => {
    const value = hint.trim();
    if (!value || busy || disabled) return;
    setHintOpen(false);
    setHint("");
    onRefine(value);
  }, [busy, disabled, hint, onRefine]);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || disabled}
          onClick={onRegenerate}
        >
          <RefreshCw className="size-3.5" />
          {regenerateLabel ?? t("aiActions.regenerate")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || disabled}
          onClick={() => setHintOpen((open) => !open)}
          aria-expanded={hintOpen}
        >
          <Sparkles className="size-3.5" />
          {refineLabel ?? t("aiActions.refine")}
        </Button>

        {busy ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("aiActions.running")}
            {onCancel ? (
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                <X className="size-3.5" />
                {t("common.cancel")}
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>

      {hintOpen ? (
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder={hintPlaceholder ?? t("aiActions.hintPlaceholder")}
            inputSize="sm"
            className="min-w-0 flex-1"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitHint();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setHintOpen(false);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || disabled || hint.trim().length === 0}
            onClick={submitHint}
          >
            {t("aiActions.hintSubmit")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
