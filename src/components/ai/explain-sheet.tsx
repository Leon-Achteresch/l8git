import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AiResultActions } from "@/components/ai/ai-result-actions";
import { AiSetupDialog } from "@/components/onboarding/ai-setup-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AiError } from "@/lib/ai/core";
import {
  generateBranchExplanation,
  generateCommitExplanation,
  generateDiffExplanation,
} from "@/lib/ai/explain-sources";
import { isAiConfigured } from "@/lib/ai-setup";

export type ExplainRequest =
  | { kind: "commit"; repoPath: string; commitHash: string; subject?: string }
  | { kind: "branch"; repoPath: string; branch: string; base: string | null }
  | { kind: "diff"; repoPath: string; file: string; diff: string };

const MARKDOWN_CLASSES =
  "text-sm leading-relaxed [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:border-border [&_li]:ml-5 [&_li]:pl-1 [&_ol]:list-decimal [&_p+p]:mt-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-muted/60 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_h1+*]:mt-1 [&_h2]:mt-3 [&_h3]:mt-3 [&_ul]:mt-1 [&_ol]:mt-1";

const MARKDOWN_PLUGINS = [remarkGfm];

function requestKeyOf(request: ExplainRequest): string {
  if (request.kind === "commit") return `commit:${request.repoPath}:${request.commitHash}`;
  if (request.kind === "branch") {
    return `branch:${request.repoPath}:${request.branch}:${request.base ?? ""}`;
  }
  return `diff:${request.repoPath}:${request.file}:${request.diff.length}`;
}

function runExplain(request: ExplainRequest, hint: string | undefined, signal: AbortSignal) {
  if (request.kind === "commit") {
    return generateCommitExplanation(request.repoPath, request.commitHash, { hint, signal });
  }
  if (request.kind === "branch") {
    return generateBranchExplanation(request.repoPath, request.branch, request.base, {
      hint,
      signal,
    });
  }
  return generateDiffExplanation(request.repoPath, request.file, request.diff, {
    hint,
    signal,
  });
}

export function ExplainSheet({
  request,
  onClose,
}: {
  request: ExplainRequest | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef<ExplainRequest | null>(request);
  requestRef.current = request;

  const key = request ? requestKeyOf(request) : null;

  const run = useCallback(async (hint?: string) => {
    const current = requestRef.current;
    if (!current) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const answer = await runExplain(current, hint, controller.signal);
      if (controller.signal.aborted) return;
      setText(answer.trim());
    } catch (cause) {
      if (controller.signal.aborted && cause instanceof AiError && cause.kind === "aborted") {
        return;
      }
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    setText("");
    setError(null);
    setCopied(false);
    void run();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [key, run]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const heading = useMemo(() => {
    if (!request) return { title: "", subtitle: "" };
    if (request.kind === "commit") {
      return {
        title: t("explain.commitTitle"),
        subtitle: request.subject?.trim()
          ? `${request.commitHash.slice(0, 8)} · ${request.subject.trim()}`
          : request.commitHash.slice(0, 8),
      };
    }
    if (request.kind === "branch") {
      return {
        title: t("explain.branchTitle"),
        subtitle: request.base
          ? t("explain.branchSubtitle", { branch: request.branch, base: request.base })
          : request.branch,
      };
    }
    return { title: t("explain.diffTitle"), subtitle: request.file };
  }, [request, t]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
  }, []);

  return (
    <Sheet
      open={!!request}
      onOpenChange={(open) => {
        if (open) return;
        cancel();
        onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {heading.title}
          </SheetTitle>
          <SheetDescription className="truncate font-mono text-xs">
            {heading.subtitle}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 py-3">
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : text ? (
              <div className={MARKDOWN_CLASSES}>
                <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS}>{text}</ReactMarkdown>
              </div>
            ) : busy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("explain.loading")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("explain.empty")}</p>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-col gap-2 border-t border-border/60 p-4">
          <AiResultActions
            busy={busy}
            onRegenerate={() => void run()}
            onRefine={(hint) => void run(hint)}
            onCancel={cancel}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={!text || busy}
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              setCopied(true);
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? t("explain.copied") : t("explain.copy")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export interface ExplainSheetController {
  open: (request: ExplainRequest) => void;
  element: ReactNode;
}

export function useExplainSheet(): ExplainSheetController {
  const [request, setRequest] = useState<ExplainRequest | null>(null);
  const [pending, setPending] = useState<ExplainRequest | null>(null);
  const [mounted, setMounted] = useState(false);

  const open = useCallback((next: ExplainRequest) => {
    setMounted(true);
    if (!isAiConfigured()) {
      setPending(next);
      return;
    }
    setRequest(next);
  }, []);

  const element = mounted ? (
    <>
      <ExplainSheet request={request} onClose={() => setRequest(null)} />
      <AiSetupDialog
        open={!!pending}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        onReady={() => {
          setRequest(pending);
          setPending(null);
        }}
      />
    </>
  ) : null;

  return { open, element };
}
