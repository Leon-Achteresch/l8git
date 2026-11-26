import { useVirtualizer } from "@tanstack/react-virtual";
import { FileCode2, Folder } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ChangeMapNode } from "@/lib/change-workflow/model";
import { nodeName, type MapIndex } from "@/lib/change-workflow-ui/map-layout";
import { listNavigationIndex } from "@/lib/list-navigation";
import { cn } from "@/lib/utils";

function focusVisibleRow(button: HTMLButtonElement | null | undefined) {
  if (!button) return;
  button.focus({ preventScroll: true });
  button.scrollIntoView({ block: "nearest", inline: "nearest" });
}

type ChangeMapListProps = {
  rows: readonly ChangeMapNode[];
  index: MapIndex;
  statusByPath: ReadonlyMap<string, { previous_path?: string }>;
  flat: boolean;
  selected: string | null;
  onChoose: (id: string) => void;
  onParent?: () => void;
};

export function ChangeMapFileList({ rows, index, statusByPath, flat, selected, onChoose, onParent }: ChangeMapListProps) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const focusFirst = useRef(false);
  const getItemKey = useCallback((i: number) => rows[i].id, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length, getScrollElement: () => scroller.current, getItemKey, estimateSize: () => 24, overscan: 6,
  });
  const mountRow = useCallback((node: HTMLLIElement | null) => {
    virtualizer.measureElement(node);
    if (node && node.dataset.id === pendingFocus.current) {
      pendingFocus.current = null;
      focusVisibleRow(node.querySelector('button'));
    }
  }, [virtualizer]);

  const focusRow = useCallback((i: number) => {
    const button = scroller.current?.querySelector<HTMLButtonElement>(`[data-index="${i}"] button`);
    pendingFocus.current = button ? null : rows[i]?.id ?? null;
    virtualizer.scrollToIndex(i, { align: 'auto' });
    focusVisibleRow(button);
  }, [rows, virtualizer]);

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
    if (focusFirst.current && rows.length) focusRow(0);
    focusFirst.current = false;
  }, [rows, focusRow]);

  function navigate(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === 'Backspace' && onParent) {
      event.preventDefault();
      focusFirst.current = true;
      onParent();
      return;
    }
    const row = (event.target as HTMLElement).closest<HTMLElement>('li[data-index]');
    if (!row) return;
    const pageSize = (virtualizer.range?.endIndex ?? 0) - (virtualizer.range?.startIndex ?? 0);
    const next = listNavigationIndex(event.key, Number(row.dataset.index), rows.length, pageSize);
    if (next === undefined) return;
    event.preventDefault();
    focusRow(next);
  }

  return (
    <div ref={scroller} className="max-h-72 overflow-auto rounded-md border border-border/50">
      <ul aria-label={t("changeMap.files")} onKeyDown={navigate} className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => {
          const node = rows[item.index];
          const previous = statusByPath.get(node.id)?.previous_path;
          return (
            <li key={node.id} ref={mountRow} data-index={item.index} data-id={node.id}
              aria-posinset={item.index + 1} aria-setsize={rows.length}
              className="absolute inset-x-0 top-0" style={{ transform: `translateY(${item.start}px)` }}>
              <button type="button" data-row title={previous ? t("pr.previousPath", { path: previous }) : node.id}
                aria-current={selected === node.id ? "true" : undefined}
                onClick={() => { focusFirst.current = node.kind === "directory"; onChoose(node.id); }}
                className={cn("flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none", selected === node.id && "bg-primary/10")}>
                {node.kind === "directory" ? <Folder className="size-3.5 shrink-0" /> : <FileCode2 className="size-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate font-mono">{flat ? node.id : nodeName(node.id)}</span>
                {node.kind === "directory" && <span className="text-[0.625rem] text-muted-foreground">{index.leaves.get(node.id)}</span>}
                {node.pullRequests.map(pr => <span key={pr} className="rounded bg-sky-500/15 px-1 text-[0.625rem] text-sky-600">{pr}</span>)}
                {node.sessions.length > 0 && <span className="rounded bg-amber-500/15 px-1 text-[0.625rem] text-amber-600">{t("changeMap.sessionCount", { count: node.sessions.length })}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
