import { toast } from "sonner";

import i18n from "@/lib/i18n";
import { providerUnknownHost } from "@/lib/pr-provider";
import { providerRetryAt } from './provider-rate-limit';
import { parseLocalChangesBlock, parseRecoveryPathsBlock } from './reflog-format';

export function translateKnownError(message: string): string {
  const splitErrors: Record<string, string> = {
    __SPLIT_REVIEW_CHANGED__: 'commitSplit.errorReviewChanged',
    __SPLIT_STAGING_CHANGED__: 'commitSplit.errorStagingChanged',
    __INVALID_SPLIT_SELECTION__: 'commitSplit.errorInvalidSelection',
    __SPLIT_OPERATION_IN_PROGRESS__: 'commitSplit.errorOperationInProgress',
    __SPLIT_MESSAGE_REQUIRED__: 'commitSplit.issueMessage',
    __SPLIT_NOTHING_STAGED__: 'commitSplit.errorNothingStaged',
    __COMMIT_SPLIT_SNAPSHOT_INVALID__: 'commitSplit.errorSnapshotInvalid',
  };
  for (const [code, key] of Object.entries(splitErrors)) if (message.includes(code)) return i18n.t(key);
  const invalidPatch = message.indexOf('__INVALID_REVIEWED_PATCH__|');
  if (invalidPatch >= 0) return i18n.t('commitPanel.partialSelectionInvalid', { file: message.slice(invalidPatch + '__INVALID_REVIEWED_PATCH__|'.length) });
  const changedFile = message.indexOf('__FILE_CHANGED__|');
  if (changedFile >= 0) return i18n.t('helpCenter.fileChanged', { file: message.slice(changedFile + '__FILE_CHANGED__|'.length) });
  if (message.includes('__UNDO_CHANGED__')) return i18n.t('recovery.undoChanged');
  if (message.includes('__REFLOG_CHANGED__')) return i18n.t('recovery.resetChanged');
  const recoveryPaths = parseRecoveryPathsBlock(message);
  if (recoveryPaths) return `${i18n.t('recovery.pathsBlocked')} ${recoveryPaths.join(', ')}`;
  if (message.includes('__HEAD_CHANGED__')) return i18n.t('helpCenter.headChanged');
  if (message.includes('__BRANCH_CHANGED__')) return i18n.t('helpCenter.branchChanged');
  if (message.includes('__SOURCE_CHANGED__')) return i18n.t('helpCenter.sourceChanged');
  if (message.includes('__INVALID_WORKTREE_PATH__')) return i18n.t('helpCenter.invalidWorktreePath');
  if (message.includes('__DISCARD_TRACKED_AS_UNTRACKED__')) return i18n.t('helpCenter.discardTracked');
  const retryAt = providerRetryAt(message);
  if (retryAt) return i18n.t('audit.providerRateLimit', { time: new Date(retryAt).toLocaleString() });
  const codes: Record<string, string> = { __INVALID_REPO_PATH__: 'audit.invalidRepoPath', __INVALID_TARGET_PATH__: 'audit.invalidTargetPath', __PATH_OUTSIDE_REPO__: 'audit.pathOutsideRepo', __INVALID_TOOLS_CONFIG__: 'audit.invalidToolsConfig' };
  for (const [code, key] of Object.entries(codes)) if (message.includes(code)) return i18n.t(key);
  if (message.includes("__STASH_CHANGED__")) return i18n.t("audit.stashChanged");
  const files = parseLocalChangesBlock(message);
  if (files) {
    return i18n.t("errors.localChangesBlockPull", { files: files.join(", ") });
  }
  const unknownHost = providerUnknownHost(message);
  if (unknownHost !== null) {
    return i18n.t("errors.providerUnknown", { host: unknownHost });
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
