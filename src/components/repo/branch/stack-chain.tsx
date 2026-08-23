import { Button } from "@/components/ui/button";
import { laneColor } from "@/lib/graph";
import {
  stackChainTopDown,
  stackIsBroken,
  stackNeedsRestack,
  type Stack,
} from "@/lib/stack";
import { cn } from "@/lib/utils";
import { AlertTriangle, GitPullRequest, Layers, Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StackBranchRow } from "./stack-branch-row";

export function StackChain({
  path,
  stack,
  busy,
  onCreateOnTop,
  onDetach,
  onRestackBranch,
  onRestackStack,
  onSubmitChain,
}: {
  path: string;
  stack: Stack;
  busy: boolean;
  onCreateOnTop: (parent: string) => void;
  onDetach: (name: string) => void;
  onRestackBranch: (name: string) => void;
  onRestackStack: (stack: Stack) => void;
  onSubmitChain: (stack: Stack) => void;
}) {
  const { t } = useTranslation();
  const levels = useMemo(() => stackChainTopDown(stack), [stack]);
  const needsRestack = stackNeedsRestack(stack);
  const broken = stackIsBroken(stack);

  return (
    <section className="mb-2 min-w-0 rounded-md border border-sidebar-border/60 bg-sidebar-accent/10 px-1 pb-1 pt-0.5">
      <header className="flex min-w-0 items-center gap-1 px-1 py-0.5">
        <span
          aria-hidden
          className="h-3 w-[2px] shrink-0 rounded-full"
          style={{ backgroundColor: laneColor(stack.root) }}
        />
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80"
          title={t("stack.rootTitle", { root: stack.root, levels: levels.length })}
        >
          {stack.root}
        </span>
        <span className="shrink-0 rounded bg-muted/60 px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
          {levels.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn("h-5 w-5 text-muted-foreground hover:text-foreground", needsRestack && "text-git-modified")}
          disabled={busy || broken}
          title={t("stack.restackTitle")}
          aria-label={t("stack.restackTitle")}
          onClick={() => onRestackStack(stack)}
        >
          <Layers className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          disabled={busy}
          title={t("stack.submitChainTitle")}
          aria-label={t("stack.submitChainTitle")}
          onClick={() => onSubmitChain(stack)}
        >
          <GitPullRequest className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          disabled={busy || !stack.root_exists}
          title={t("stack.createOnRootTitle", { parent: stack.root })}
          aria-label={t("stack.createOnRootTitle", { parent: stack.root })}
          onClick={() => window.requestAnimationFrame(() => onCreateOnTop(stack.root))}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </header>

      {broken || needsRestack ? (
        <p
          className={cn(
            "mx-1 mb-1 flex items-center gap-1 rounded px-1 py-0.5 text-[10px]",
            broken
              ? "bg-git-removed/10 text-git-removed"
              : "bg-git-modified/10 text-git-modified",
          )}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          {broken ? t("stack.brokenHint") : t("stack.needsRestackHint")}
        </p>
      ) : null}

      <ul className="min-w-0 space-y-px">
        {levels.map((branch) => (
          <StackBranchRow
            key={branch.name}
            path={path}
            branch={branch}
            busy={busy}
            onCreateOnTop={onCreateOnTop}
            onDetach={onDetach}
            onRestack={onRestackBranch}
          />
        ))}
      </ul>
    </section>
  );
}
