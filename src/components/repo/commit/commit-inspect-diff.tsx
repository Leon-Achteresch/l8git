import { MediaDiffPanel } from "@/components/repo/media/media-diff-panel";
import { looksLikeLfsPointerText } from "@/lib/media";
import { FileCode2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SpinIcon } from "@/components/motion/kit";

import { CommitDiffViewer } from "./commit-diff-viewer";

export type FileDiffPayload = { diff: string | null; is_binary: boolean };

export function CommitInspectDiff({
  repoPath,
  commitHash,
  selectedFile,
  previousFile,
  fileDiff,
  loading,
  failed,
  missingLocalContent = false,
  previewable = false,
  stashSource,
}: {
  repoPath: string;
  commitHash: string | null;
  selectedFile: string | null;
  previousFile?: string;
  fileDiff: FileDiffPayload | null;
  loading: boolean;
  failed: boolean;
  missingLocalContent?: boolean;
  /** Real commits only (not stashes): enables display options via repo_diff_preview. */
  previewable?: boolean;
  stashSource?: "tracked" | "untracked";
}) {
  const { t } = useTranslation();
  const isLfs = looksLikeLfsPointerText(fileDiff?.diff);
  const showMedia = !!fileDiff && (fileDiff.is_binary || isLfs);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-hidden min-w-0">
        {!selectedFile ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="rounded-full bg-muted/30 p-4 ring-1 ring-border/50">
              <FileCode2 className="h-8 w-8 opacity-40" />
            </div>
            <span className="text-sm font-medium tracking-wide">
              {t("commitInspect.pickFileForDiff")}
            </span>
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <SpinIcon icon={Loader2} className="h-6 w-6 text-primary/50" />
          </div>
        ) : missingLocalContent ? (
          <div role="status" className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {t("backendErrors.git.missingLocalCommitFile")}
          </div>
        ) : failed ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t("diff.diffLoadFailedFallback")}
          </div>
        ) : showMedia && commitHash ? (
          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            <MediaDiffPanel
              key={`${commitHash}:${selectedFile}`}
              repoPath={repoPath}
              filePath={selectedFile}
              beforeFilePath={previousFile}
              beforeTreeish={stashSource === "untracked" ? [] : `${commitHash}~1`}
              afterTreeish={stashSource === "untracked" ? `${commitHash}^3` : commitHash}
              beforeLabel={t("media.sideParentCommit")}
              afterLabel={t(stashSource ? "media.sideStash" : "media.sideThisCommit")}
              checkLfs={isLfs}
            />
          </div>
        ) : fileDiff?.diff ? (
          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            <CommitDiffViewer
              unifiedText={fileDiff.diff}
              filename={selectedFile}
              preview={previewable && commitHash ? { path: repoPath, request: { kind: "commit", file: selectedFile, previousFile, head: commitHash }, revisions: { base: `${commitHash}^`, head: commitHash } } : undefined}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("commitInspect.noTextChanges")}
          </div>
        )}
      </div>
    </div>
  );
}
