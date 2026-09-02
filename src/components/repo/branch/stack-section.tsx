import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import type { Stack } from "@/lib/stack";
import { useStackStore } from "@/lib/stack-store";
import { Layers, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { StackChain } from "./stack-chain";
import { StackCreateBranchDialog } from "./stack-create-branch-dialog";
import { StackPrChainDialog } from "./stack-pr-chain-dialog";

export function StackSection({ path }: { path: string }) {
  const { t } = useTranslation();
  const list = useStackStore((s) => s.lists[path]);
  const loading = useStackStore((s) => s.loading[path] ?? false);
  const busy = useStackStore((s) => s.busy[path] ?? false);
  const error = useStackStore((s) => s.error[path] ?? null);
  const load = useStackStore((s) => s.load);
  const removeFromStack = useStackStore((s) => s.remove);
  const restack = useStackStore((s) => s.restack);
  const restackStack = useStackStore((s) => s.restackStack);

  const branches = useRepoStore((s) => s.repos[path]?.branches);
  const branchKey = useMemo(
    () =>
      (branches ?? [])
        .filter((b) => !b.is_remote)
        .map((b) => `${b.name}:${b.tip}`)
        .join("|"),
    [branches],
  );
  const currentBranch = useRepoStore(
    (s) => s.repos[path]?.branches?.find((b) => b.is_current && !b.is_remote)?.name ?? null,
  );

  const [createParent, setCreateParent] = useState<string | null>(null);
  const [chainStack, setChainStack] = useState<Stack | null>(null);

  useEffect(() => {
    if (!path) return;
    void load(path);
  }, [path, branchKey, load]);

  const stacks = list?.stacks ?? [];
  const cycles = list?.cycles ?? [];
  const errors = list?.errors ?? [];

  const chainStackLive = useMemo(() => {
    if (!chainStack) return null;
    return stacks.find((s) => s.root === chainStack.root) ?? chainStack;
  }, [chainStack, stacks]);

  const reportRestack = useCallback(
    (restacked: number, conflictBranch: string | null) => {
      if (conflictBranch) {
        toast.info(t("stack.restackConflictToast", { branch: conflictBranch }));
        return;
      }
      if (restacked === 0) {
        toast.info(t("stack.restackNoopToast"));
        return;
      }
      toast.success(t("stack.restackDoneToast", { count: restacked }));
    },
    [t],
  );

  const onRestackBranch = useCallback(
    (name: string) => {
      void (async () => {
        try {
          const res = await restack(path, name);
          reportRestack(
            res.restacked.length,
            res.status === "conflict" ? (res.current?.branch ?? name) : null,
          );
        } catch (e) {
          toastError(String(e));
        }
      })();
    },
    [path, restack, reportRestack],
  );

  const onRestackStack = useCallback(
    (stack: Stack) => {
      void (async () => {
        try {
          const results = await restackStack(path, stack);
          const restacked = results.reduce((sum, r) => sum + r.restacked.length, 0);
          const conflict = results.find((r) => r.status === "conflict");
          reportRestack(restacked, conflict ? (conflict.current?.branch ?? null) : null);
        } catch (e) {
          toastError(String(e));
        }
      })();
    },
    [path, restackStack, reportRestack],
  );

  const onDetach = useCallback(
    (name: string) => {
      void (async () => {
        try {
          await removeFromStack(path, name);
          toast.success(t("stack.detachedToast", { name }));
        } catch (e) {
          toastError(String(e));
        }
      })();
    },
    [path, removeFromStack, t],
  );

  return (
    <div className="min-w-0 px-1 pb-1">
      {error ? (
        <p className="mb-1 rounded-md bg-git-removed/10 px-2 py-1 text-[11px] text-git-removed">
          {t("stack.loadError", { error })}
        </p>
      ) : null}

      {cycles.length > 0 ? (
        <p className="mb-1 rounded-md bg-git-modified/10 px-2 py-1 text-[11px] text-git-modified">
          {t("stack.cycleWarning", {
            branches: cycles.map((c) => c.join(" → ")).join(", "),
          })}
        </p>
      ) : null}

      {errors.map((e) => (
        <p key={e} className="mb-1 px-2 text-[10px] text-muted-foreground">
          {e}
        </p>
      ))}

      {stacks.length === 0 ? (
        <div className="rounded-md border border-dashed border-sidebar-border/70 px-2 py-3 text-center">
          <Layers className="mx-auto mb-1 h-4 w-4 text-muted-foreground/70" aria-hidden />
          <p className="text-[11px] text-muted-foreground">
            {loading ? t("stack.loading") : t("stack.empty")}
          </p>
          {currentBranch ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-6 max-w-full text-[11px]"
              disabled={busy}
              title={t("stack.startOnCurrent", { parent: currentBranch })}
              onClick={() =>
                window.requestAnimationFrame(() => setCreateParent(currentBranch))
              }
            >
              <Plus className="h-3 w-3" />
              <span className="truncate">
                {t("stack.startOnCurrent", { parent: currentBranch })}
              </span>
            </Button>
          ) : null}
        </div>
      ) : (
        stacks.map((stack) => (
          <StackChain
            key={stack.root}
            path={path}
            stack={stack}
            busy={busy}
            onCreateOnTop={setCreateParent}
            onDetach={onDetach}
            onRestackBranch={onRestackBranch}
            onRestackStack={onRestackStack}
            onSubmitChain={setChainStack}
          />
        ))
      )}

      <StackCreateBranchDialog
        open={!!createParent}
        onClose={() => setCreateParent(null)}
        path={path}
        parent={createParent ?? ""}
      />
      <StackPrChainDialog
        open={!!chainStack}
        onClose={() => setChainStack(null)}
        path={path}
        stack={chainStackLive}
      />
    </div>
  );
}
