import { ListRow } from "@/components/ui/list-row";
import { UnifiedDiffBody } from "@/components/repo/commit/unified-diff-body";
import { MediaDiffPanel } from "@/components/repo/media/media-diff-panel";
import { isImagePath, looksLikeLfsPointerText } from "@/lib/media";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError } from "@/lib/error-toast";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type PrFile = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

const STATUS_COLORS: Record<string, string> = {
  added: "text-git-added",
  modified: "text-git-modified",
  removed: "text-git-removed",
  renamed: "text-git-modified",
};

function refCandidates(
  ref: string | undefined,
  remoteFirst: boolean,
): (string | null)[] {
  const name = ref?.trim();
  if (!name) return [];
  const remote = `origin/${name}`;
  return remoteFirst ? [remote, name] : [name, remote];
}

export function PullRequestFilesTab({
  path,
  number,
  baseRef,
  headRef,
}: {
  path: string;
  number: number;
  baseRef?: string;
  headRef?: string;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<PrFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const patchCache = useRef<Map<string, string>>(new Map());
  const [patch, setPatch] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchFailed, setPatchFailed] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: files?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 30,
    overscan: 12,
    getItemKey: (i) => files?.[i]?.path ?? i,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    patchCache.current.clear();
    setPatch(null);
    invoke<PrFile[]>("pr_files", { path, number })
      .then((res) => {
        if (!cancelled) {
          setFiles(res);
          if (res.length > 0) setSelected(res[0].path);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          toastError(String(e));
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number]);

  useEffect(() => {
    if (!selected) {
      setPatch(null);
      setPatchFailed(false);
      return;
    }
    const cached = patchCache.current.get(selected);
    if (cached !== undefined) {
      setPatch(cached);
      setPatchFailed(false);
      setPatchLoading(false);
      return;
    }
    let cancelled = false;
    setPatchLoading(true);
    setPatchFailed(false);
    invoke<string | null>("pr_file_patch", {
      path,
      number,
      file: selected,
    })
      .then((res) => {
        if (cancelled) return;
        const value = res ?? "";
        patchCache.current.set(selected, value);
        setPatch(value);
      })
      .catch((e) => {
        if (cancelled) return;
        toastError(String(e));
        setPatchFailed(true);
        setPatch(null);
      })
      .finally(() => {
        if (!cancelled) setPatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number, selected]);

  if (loading && !files) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
      </div>
    );
  }
  if (!files || files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("pr.noFiles")}
      </div>
    );
  }

  const current = files.find((f) => f.path === selected) ?? files[0];
  const isLfsPatch = looksLikeLfsPointerText(patch);
  const showMedia =
    !patchLoading &&
    !patchFailed &&
    !!current &&
    (isLfsPatch || (!patch?.trim() && isImagePath(current.path))) &&
    (!!baseRef || !!headRef);

  return (
    <ResizablePanelGroup orientation="horizontal" id="pr-files-split">
      <ResizablePanel
        id="pr-files-list"
        defaultSize="35%"
        minSize="20%"
        maxSize="60%"
        className="min-h-0 flex flex-col"
      >
        <div ref={listRef} className="h-full overflow-y-auto">
          <ul
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const f = files[vi.index];
              if (!f) return null;
              const status = STATUS_COLORS[f.status] ?? "text-muted-foreground";
              const active = f.path === current.path;
              return (
                <li
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="border-b border-border/50"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <ListRow
                    size="sm"
                    active={active}
                    onClick={() => setSelected(f.path)}
                    className="rounded-none px-3"
                    title={f.path}
                  >
                    <span
                      className={`shrink-0 font-mono uppercase ${status}`}
                      title={f.status}
                    >
                      {f.status[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {f.path}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums">
                      <span className="text-git-added">+{f.additions}</span>{" "}
                      <span className="text-git-removed">-{f.deletions}</span>
                    </span>
                  </ListRow>
                </li>
              );
            })}
          </ul>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle className="bg-border/50" />
      <ResizablePanel
        id="pr-files-diff"
        defaultSize="65%"
        minSize="30%"
        className="min-h-0 flex flex-col"
      >
        {showMedia && current ? (
          <MediaDiffPanel
            key={current.path}
            repoPath={path}
            filePath={current.path}
            beforeTreeish={refCandidates(baseRef, true)}
            afterTreeish={refCandidates(headRef, false)}
            beforeLabel={t("media.sidePrBase")}
            afterLabel={t("media.sidePrHead")}
            checkLfs={isLfsPatch}
          />
        ) : (
          <UnifiedDiffBody
            loading={patchLoading}
            failed={patchFailed}
            isBinary={false}
            unifiedText={patch ?? ""}
            untrackedPlain={null}
            emptyHint={
              patch
                ? ""
                : t("pr.noDiffLarge")
            }
            failedHint={t("diff.diffLoadFailedFallback")}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
