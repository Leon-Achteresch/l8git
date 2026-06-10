import { toast } from "sonner";

import i18n from "@/lib/i18n";

function translateKnownError(message: string): string {
  const markerIdx = message.indexOf("__LOCAL_CHANGES_BLOCK__|");
  if (markerIdx >= 0) {
    const payload = message.slice(markerIdx + "__LOCAL_CHANGES_BLOCK__|".length);
    const files = payload
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    return i18n.t("errors.localChangesBlockPull", { files: files.join(", ") });
  }
  return message;
}

export function toastError(message: string) {
  const display = translateKnownError(message);
  toast.error(display, {
    action: {
      label: i18n.t("errors.copyAction"),
      onClick: () => {
        void navigator.clipboard.writeText(display);
      },
    },
  });
}

export type GitErrorContext = {
  /** Repo path, used to open the merge editor on conflict. */
  repoPath?: string;
  /** Called when the user clicks "Stash & Pull" on a local-changes-block error. */
  onStashAndPull?: () => void;
  /** Called when the user clicks "Pull now" on a non-fast-forward error. */
  onPull?: () => void;
};

/**
 * Like toastError, but recognises common git error patterns and attaches a
 * relevant Quick-Action button to the toast.
 */
export function toastGitError(message: string, ctx?: GitErrorContext) {
  const display = translateKnownError(message);
  const raw = message.toLowerCase();

  // Non-fast-forward / fetch first
  if (
    /non-fast-forward|fetch first|rejected.*update|updates were rejected/.test(raw) &&
    ctx?.onPull
  ) {
    toast.error(i18n.t("errors.nonFastForward"), {
      description: display,
      action: {
        label: i18n.t("errors.nonFastForwardAction"),
        onClick: ctx.onPull,
      },
    });
    return;
  }

  // Merge conflict
  if (/conflict|merge failed|automatic merge failed/.test(raw) && ctx?.repoPath) {
    const path = ctx.repoPath;
    toast.error(i18n.t("errors.mergeConflict"), {
      description: display,
      action: {
        label: i18n.t("errors.mergeConflictAction"),
        onClick: () => {
          // Lazy-import avoids a circular dep; this is fire-and-forget.
          void import("@/lib/ui-store").then(({ useUiStore }) => {
            useUiStore.getState().openMergeEditor(path);
          });
        },
      },
    });
    return;
  }

  // Auth / credential failure
  if (
    /authentication failed|could not read username|invalid credentials|permission denied|403|401/.test(
      raw,
    )
  ) {
    toast.error(i18n.t("errors.authFailed"), {
      description: display,
      action: {
        label: i18n.t("errors.authFailedAction"),
        onClick: () => {
          void import("./router").then(({ router }) => {
            void router.navigate({ to: "/settings" });
          });
        },
      },
    });
    return;
  }

  // Local-changes block pull — add Stash & Pull action
  if (message.includes("__LOCAL_CHANGES_BLOCK__|") && ctx?.onStashAndPull) {
    toast.error(display, {
      action: {
        label: i18n.t("errors.stashAndPullAction"),
        onClick: ctx.onStashAndPull,
      },
    });
    return;
  }

  // Detached HEAD
  if (/detached head|detached at/.test(raw)) {
    toast.error(i18n.t("errors.detachedHead"), {
      description: display,
      action: {
        label: i18n.t("errors.copyAction"),
        onClick: () => void navigator.clipboard.writeText(display),
      },
    });
    return;
  }

  // Default: copy action
  toastError(message);
}
