import { toastError } from "@/lib/error-toast";
import type { Branch } from "@/lib/repo-store";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Check, GitBranch, GitMerge, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { RemoteCheckoutDialog } from "./remote-checkout-dialog";
import { RemoteDeleteConfirmDialog } from "./remote-delete-confirm-dialog";

type CheckoutDraft = { remoteRef: string; defaultLocalName: string };

export function BranchRow({
  path,
  branch,
  laneColor,
  onDelete,
}: {
  path: string;
  branch: Branch;
  laneColor: string;
  onDelete?: (b: Branch, force: boolean) => void;
}) {
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const mergeBranch = useRepoStore((s) => s.mergeBranch);
  const focusCommitFromBranchTip = useUiStore((s) => s.focusCommitFromBranchTip);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [deleteRemoteRef, setDeleteRemoteRef] = useState<string | null>(null);

  function defaultLocalFromRemote(remoteRef: string) {
    const slash = remoteRef.indexOf("/");
    return slash >= 0 ? remoteRef.slice(slash + 1) : remoteRef;
  }

  const performCheckout = useCallback(() => {
    if (!path || branch.is_current) return;
    void (async () => {
      try {
        if (branch.is_remote) {
          const local =
            defaultLocalFromRemote(branch.name).trim() || "branch";
          await checkoutBranch(path, local, { fromRemote: branch.name });
        } else {
          await checkoutBranch(path, branch.name);
        }
      } catch (e) {
        toastError(String(e));
      }
    })();
  }, [path, branch, checkoutBranch]);

  const row = (
    <li
      onClick={(e) => {
        if (e.button !== 0) return;
        focusCommitFromBranchTip(path, branch.tip);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        performCheckout();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm",
        branch.is_current
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <span
        className="h-4 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: laneColor }}
        aria-hidden
      />
      {branch.is_current ? (
        <Check className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate" title={branch.name}>
        {branch.name}
      </span>
    </li>
  );

  const showRemoteCheckout = branch.is_remote && !branch.is_current;
  const showRemoteDelete = branch.is_remote && !branch.is_current;
  const showLocalSwitch = !branch.is_remote && !branch.is_current;
  const showDelete = !!onDelete && !branch.is_remote;

  function openRemoteCheckout() {
    const def = defaultLocalFromRemote(branch.name);
    const schedule = () =>
      setCheckoutDraft({
        remoteRef: branch.name,
        defaultLocalName: def,
      });
    window.requestAnimationFrame(schedule);
  }

  function openRemoteDeleteConfirm() {
    window.requestAnimationFrame(() => setDeleteRemoteRef(branch.name));
  }

  if (
    !path ||
    (!showRemoteCheckout &&
      !showRemoteDelete &&
      !showLocalSwitch &&
      !(showDelete && onDelete))
  ) {
    return row;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          {showLocalSwitch ? (
            <>
              <ContextMenuItem
                onSelect={() => {
                  void (async () => {
                    try {
                      await checkoutBranch(path, branch.name);
                    } catch (e) {
                      toastError(String(e));
                    }
                  })();
                }}
              >
                <GitBranch className="h-3.5 w-3.5" />
                Auschecken
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => {
                  void (async () => {
                    try {
                      const out = await mergeBranch(path, branch.name);
                      toast.success(out.trim() || "Merge abgeschlossen.");
                    } catch (e) {
                      toastError(String(e));
                    }
                  })();
                }}
              >
                <GitMerge className="h-3.5 w-3.5" />
                In aktuellen Branch mergen
              </ContextMenuItem>
            </>
          ) : null}
          {showRemoteCheckout ? (
            <ContextMenuItem onSelect={openRemoteCheckout}>
              <GitBranch className="h-3.5 w-3.5" />
              Als lokalen Branch auschecken
            </ContextMenuItem>
          ) : null}
          {showRemoteDelete ? (
            <>
              {showRemoteCheckout ? <ContextMenuSeparator /> : null}
              <ContextMenuItem variant="destructive" onSelect={openRemoteDeleteConfirm}>
                <Trash2 className="h-3.5 w-3.5" />
                Remote-Branch löschen
              </ContextMenuItem>
            </>
          ) : null}
          {showDelete && onDelete ? (
            <>
              {(showLocalSwitch || showRemoteCheckout || showRemoteDelete) && (
                <ContextMenuSeparator />
              )}
              <ContextMenuItem
                variant="destructive"
                disabled={branch.is_current}
                onSelect={() => onDelete(branch, false)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Löschen
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                disabled={branch.is_current}
                onSelect={() => onDelete(branch, true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Erzwingen (−D)
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      <RemoteCheckoutDialog
        open={!!checkoutDraft}
        onClose={() => setCheckoutDraft(null)}
        path={path}
        remoteRef={checkoutDraft?.remoteRef ?? ""}
        defaultLocalName={checkoutDraft?.defaultLocalName ?? ""}
      />
      <RemoteDeleteConfirmDialog
        open={!!deleteRemoteRef}
        onClose={() => setDeleteRemoteRef(null)}
        path={path}
        remoteRef={deleteRemoteRef ?? ""}
      />
    </>
  );
}
