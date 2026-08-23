import {
  formatBytes,
  isImageMime,
  isImagePath,
  mediaDataUrl,
  type LfsPointerInfo,
} from "@/lib/media";
import {
  useLfsPointer,
  useMediaFile,
  type MediaFileState,
  type MediaTreeish,
} from "@/lib/use-media-file";
import { cn } from "@/lib/utils";
import { FileWarning } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ImageDiff, type ImageDiffSide } from "./image-diff";
import { LfsBadge } from "./lfs-badge";

function firstTreeish(
  candidates: MediaTreeish | readonly MediaTreeish[],
): MediaTreeish {
  if (Array.isArray(candidates)) return candidates[0] ?? null;
  return candidates as MediaTreeish;
}

type SideTexts = { pointerMessage: string; notRenderable: string };

function toSide(
  label: string,
  state: MediaFileState,
  pointer: LfsPointerInfo | null,
  pointerLoading: boolean,
  texts: SideTexts,
): ImageDiffSide {
  if (pointerLoading) {
    return { label, url: null, byteSize: null, status: "loading" };
  }
  if (pointer?.isPointer) {
    return {
      label,
      url: null,
      byteSize: pointer.size,
      status: "lfsMissing",
      message: texts.pointerMessage,
    };
  }
  switch (state.status) {
    case "ready":
      return {
        label,
        url: isImageMime(state.file.mime)
          ? mediaDataUrl(state.file.mime, state.file.base64)
          : null,
        byteSize: state.file.size,
        status: isImageMime(state.file.mime) ? "ready" : "error",
        message: isImageMime(state.file.mime) ? null : texts.notRenderable,
      };
    case "tooLarge":
      return { label, url: null, byteSize: state.size, status: "tooLarge" };
    case "missing":
      return { label, url: null, byteSize: null, status: "empty" };
    case "error":
      return {
        label,
        url: null,
        byteSize: null,
        status: "error",
        message: state.message || null,
      };
    default:
      return { label, url: null, byteSize: null, status: "loading" };
  }
}

function sizeOf(state: MediaFileState, pointer: LfsPointerInfo | null): number | null {
  if (pointer?.isPointer) return pointer.size;
  if (state.status === "ready") return state.file.size;
  if (state.status === "tooLarge") return state.size;
  return null;
}

export function MediaDiffPanel({
  repoPath,
  filePath,
  beforeTreeish,
  afterTreeish,
  beforeLabel,
  afterLabel,
  checkLfs = false,
  className,
}: {
  repoPath: string;
  filePath: string;
  beforeTreeish: MediaTreeish | readonly MediaTreeish[];
  afterTreeish: MediaTreeish | readonly MediaTreeish[];
  beforeLabel?: string;
  afterLabel?: string;
  checkLfs?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  const beforeRef = firstTreeish(beforeTreeish);
  const afterRef = firstTreeish(afterTreeish);

  const beforePointer = useLfsPointer(repoPath, filePath, beforeRef, checkLfs);
  const afterPointer = useLfsPointer(repoPath, filePath, afterRef, checkLfs);

  const beforeState = useMediaFile(
    repoPath,
    filePath,
    beforeTreeish,
    !beforePointer.loading && !beforePointer.pointer?.isPointer,
  );
  const afterState = useMediaFile(
    repoPath,
    filePath,
    afterTreeish,
    !afterPointer.loading && !afterPointer.pointer?.isPointer,
  );

  const notRenderable = t("media.notRenderable");
  const beforeTexts: SideTexts = {
    notRenderable,
    pointerMessage:
      beforeRef == null ? t("lfs.objectNotLocal") : t("lfs.pointerOnlyInCommit"),
  };
  const afterTexts: SideTexts = {
    notRenderable,
    pointerMessage:
      afterRef == null ? t("lfs.objectNotLocal") : t("lfs.pointerOnlyInCommit"),
  };

  const before = toSide(
    beforeLabel ?? t("media.sideBefore"),
    beforeState,
    beforePointer.pointer,
    beforePointer.loading,
    beforeTexts,
  );
  const after = toSide(
    afterLabel ?? t("media.sideAfter"),
    afterState,
    afterPointer.pointer,
    afterPointer.loading,
    afterTexts,
  );

  const activePointer =
    (afterPointer.pointer?.isPointer ? afterPointer.pointer : null) ??
    (beforePointer.pointer?.isPointer ? beforePointer.pointer : null);

  const isImage =
    isImagePath(filePath) ||
    (beforeState.status === "ready" && isImageMime(beforeState.file.mime)) ||
    (afterState.status === "ready" && isImageMime(afterState.file.mime));

  const beforeSize = sizeOf(beforeState, beforePointer.pointer);
  const afterSize = sizeOf(afterState, afterPointer.pointer);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {activePointer ? (
        <div className="shrink-0 border-b border-border/60 px-3 py-2">
          <LfsBadge pointer={activePointer} />
        </div>
      ) : null}
      {isImage ? (
        <ImageDiff before={before} after={after} className="min-h-0 flex-1" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <FileWarning className="size-6 text-muted-foreground/60" />
          <span className="text-sm text-muted-foreground">
            {t("diff.binaryFile")}
          </span>
          {beforeSize != null || afterSize != null ? (
            <div className="flex flex-wrap items-center justify-center gap-x-4 text-xs tabular-nums text-muted-foreground/80">
              {beforeSize != null ? (
                <span>
                  {t("media.sizeBefore", { size: formatBytes(beforeSize) })}
                </span>
              ) : null}
              {afterSize != null ? (
                <span>
                  {t("media.sizeAfter", { size: formatBytes(afterSize) })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
