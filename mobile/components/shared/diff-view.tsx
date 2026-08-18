import { ChevronDown, ChevronRight, FileDiff, RotateCw } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import {
  diffTotals,
  parseDiffFiles,
  untrackedDiffFile,
  type DiffFile,
  type DiffRow,
} from '~/components/shared/diff-parse';
import { FileStatusBadge } from '~/components/shared/file-change-row';
import { expandTabs, middleTruncate, splitPath } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { EmptyState } from '~/components/empty-state';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Skeleton } from '~/components/ui/skeleton';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import { cn } from '~/lib/utils';

export type { DiffFile, DiffRow } from '~/components/shared/diff-parse';

const ROW_HEIGHT = 18;
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;
const CHAR_WIDTH = 6.4;
const INITIAL_ROWS = 220;
const MORE_ROWS = 600;
const AUTO_EXPAND_ROWS = 900;

const ROW_SURFACE: Record<DiffRow['kind'], string> = {
  add: 'bg-git-added-subtle/45',
  del: 'bg-git-removed-subtle/45',
  ctx: 'bg-transparent',
  hunk: 'bg-muted/60',
  meta: 'bg-muted/30',
};

const ROW_TEXT: Record<DiffRow['kind'], string> = {
  add: 'text-git-added',
  del: 'text-git-removed',
  ctx: 'text-foreground/75',
  hunk: 'text-git-branch/80',
  meta: 'text-muted-foreground/60',
};

const ROW_BORDER: Record<DiffRow['kind'], string> = {
  add: palette.git.added,
  del: palette.git.removed,
  ctx: 'transparent',
  hunk: palette.git.branch,
  meta: 'transparent',
};

const PREFIX: Record<DiffRow['kind'], string> = {
  add: '+',
  del: '−',
  ctx: ' ',
  hunk: '',
  meta: '',
};

const MONO_TEXT = {
  fontSize: FONT_SIZE,
  lineHeight: LINE_HEIGHT,
  height: ROW_HEIGHT,
  includeFontPadding: false,
} as const;

function gutterWidth(digits: number): number {
  return Math.round(digits * 2 * CHAR_WIDTH + 22);
}

function digitsFor(file: DiffFile): number {
  let max = 1;
  for (const row of file.rows) {
    if (row.oldNo && row.oldNo > max) {
      max = row.oldNo;
    }
    if (row.newNo && row.newNo > max) {
      max = row.newNo;
    }
  }
  return String(max).length;
}

const GutterRow = React.memo(function GutterRow({
  row,
  width,
}: {
  row: DiffRow;
  width: number;
}) {
  const half = (width - 10) / 2;
  return (
    <View
      style={{ height: ROW_HEIGHT, width }}
      className={cn('flex-row items-center px-1', ROW_SURFACE[row.kind])}>
      <Text
        style={{ ...MONO_TEXT, width: half }}
        className="text-muted-foreground/45 text-right font-mono">
        {row.oldNo ?? ''}
      </Text>
      <Text
        style={{ ...MONO_TEXT, width: half }}
        className="text-muted-foreground/45 text-right font-mono">
        {row.newNo ?? ''}
      </Text>
    </View>
  );
});

const CodeRow = React.memo(function CodeRow({ row }: { row: DiffRow }) {
  return (
    <View
      style={{ height: ROW_HEIGHT, borderLeftWidth: 2, borderLeftColor: ROW_BORDER[row.kind] }}
      className={cn('justify-center pl-1.5 pr-4', ROW_SURFACE[row.kind])}>
      <Text
        numberOfLines={1}
        style={MONO_TEXT}
        className={cn('font-mono', ROW_TEXT[row.kind])}>
        {`${PREFIX[row.kind]}${expandTabs(row.text)}`}
      </Text>
    </View>
  );
});

function DiffFileBody({ file, initialRows }: { file: DiffFile; initialRows: number }) {
  const [visible, setVisible] = React.useState(() => Math.min(file.rows.length, initialRows));
  const width = React.useMemo(() => gutterWidth(digitsFor(file)), [file]);

  React.useEffect(() => {
    setVisible(Math.min(file.rows.length, initialRows));
  }, [file, initialRows]);

  if (file.binary) {
    return (
      <View className="border-border/60 border-t px-3 py-4">
        <Text className="text-muted-foreground text-center text-xs">Binary file not shown</Text>
      </View>
    );
  }

  if (file.rows.length === 0) {
    return (
      <View className="border-border/60 border-t px-3 py-4">
        <Text className="text-muted-foreground text-center text-xs">No textual changes</Text>
      </View>
    );
  }

  const rows = file.rows.slice(0, visible);
  const remaining = file.rows.length - rows.length;

  return (
    <Animated.View entering={FadeIn.duration(140)} className="border-border/60 border-t">
      <View className="flex-row">
        <View className="border-border/50 border-r">
          {rows.map((row, index) => (
            <GutterRow key={index} row={row} width={width} />
          ))}
        </View>
        <ScrollView
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ minWidth: '100%' }}>
          <View>
            {rows.map((row, index) => (
              <CodeRow key={index} row={row} />
            ))}
          </View>
        </ScrollView>
      </View>
      {remaining > 0 ? (
        <View className="border-border/50 border-t p-2">
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setVisible((current) => current + MORE_ROWS)}>
            <Text className="text-xs">
              Show {Math.min(remaining, MORE_ROWS)} more of {remaining} lines
            </Text>
          </Button>
        </View>
      ) : null}
    </Animated.View>
  );
}

function DiffFileSection({
  file,
  expanded,
  onToggle,
  collapsible,
  initialRows,
}: {
  file: DiffFile;
  expanded: boolean;
  onToggle: () => void;
  collapsible: boolean;
  initialRows: number;
}) {
  const { name } = splitPath(file.path);
  const dir = splitPath(file.path).dir;

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      className="border-border bg-card/40 overflow-hidden rounded-xl border">
      <PressableRow
        flat
        onPress={collapsible ? onToggle : undefined}
        accessibilityLabel={`${file.path}, ${expanded ? 'collapse' : 'expand'}`}>
        <View className="flex-row items-center gap-2.5 px-3 py-2.5">
          {collapsible ? (
            <Icon
              as={expanded ? ChevronDown : ChevronRight}
              size={14}
              className="text-muted-foreground"
            />
          ) : null}
          <FileStatusBadge status={file.status} size="sm" />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-foreground text-sm font-medium">
              {name}
            </Text>
            {dir ? (
              <Text numberOfLines={1} className="text-muted-foreground/70 text-2xs">
                {middleTruncate(dir, 34)}
              </Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-1.5">
            {file.additions ? (
              <Text className="text-git-added font-mono text-2xs">+{file.additions}</Text>
            ) : null}
            {file.deletions ? (
              <Text className="text-git-removed font-mono text-2xs">−{file.deletions}</Text>
            ) : null}
          </View>
        </View>
      </PressableRow>
      {expanded ? <DiffFileBody file={file} initialRows={initialRows} /> : null}
    </Animated.View>
  );
}

export function DiffSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <View className="border-border bg-card/40 gap-2 overflow-hidden rounded-xl border p-3">
      <Skeleton className="h-3 w-40 rounded" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-2.5 rounded', index % 4 === 0 ? 'w-3/4' : index % 3 === 0 ? 'w-1/2' : 'w-5/6')}
        />
      ))}
    </View>
  );
}

export type DiffViewProps = {
  diff?: string | null;
  files?: readonly DiffFile[];
  untracked?: { path: string; content: string } | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  collapsible?: boolean;
  emptyHint?: string;
  initialRows?: number;
  className?: string;
};

export function DiffView({
  diff,
  files,
  untracked,
  loading = false,
  error,
  onRetry,
  collapsible = true,
  emptyHint = 'Nothing changed in this diff.',
  initialRows = INITIAL_ROWS,
  className,
}: DiffViewProps) {
  const parsed = React.useMemo<DiffFile[]>(() => {
    if (files) {
      return [...files];
    }
    if (untracked) {
      return [untrackedDiffFile(untracked.path, untracked.content)];
    }
    return parseDiffFiles(diff);
  }, [diff, files, untracked]);

  const [collapsedIds, setCollapsedIds] = React.useState<ReadonlySet<string>>(new Set());
  const totals = React.useMemo(() => diffTotals(parsed), [parsed]);

  React.useEffect(() => {
    if (!collapsible || parsed.length < 2) {
      setCollapsedIds(new Set());
      return;
    }
    const collapsed = new Set<string>();
    let budget = AUTO_EXPAND_ROWS;
    for (const file of parsed) {
      if (budget <= 0) {
        collapsed.add(file.id);
      }
      budget -= file.rows.length;
    }
    setCollapsedIds(collapsed);
  }, [collapsible, parsed]);

  if (loading) {
    return <DiffSkeleton />;
  }

  if (error) {
    return (
      <View className="border-destructive/30 bg-destructive/5 gap-3 rounded-xl border p-4">
        <Text className="text-destructive text-sm font-medium">Could not load the diff</Text>
        <Text className="text-muted-foreground text-xs">{error}</Text>
        {onRetry ? (
          <Button variant="outline" size="sm" onPress={onRetry} className="self-start">
            <Icon as={RotateCw} size={13} className="text-foreground" />
            <Text className="text-xs">Retry</Text>
          </Button>
        ) : null}
      </View>
    );
  }

  if (parsed.length === 0) {
    return <EmptyState icon={FileDiff} title="No changes" description={emptyHint} />;
  }

  return (
    <View className={cn('gap-2', className)}>
      {parsed.length > 1 ? (
        <View className="flex-row items-center gap-2 px-1">
          <Text className="text-muted-foreground text-xs">
            {parsed.length} files changed
          </Text>
          <Text className="text-git-added font-mono text-2xs">+{totals.additions}</Text>
          <Text className="text-git-removed font-mono text-2xs">−{totals.deletions}</Text>
        </View>
      ) : null}

      {parsed.map((file) => (
        <DiffFileSection
          key={file.id}
          file={file}
          collapsible={collapsible}
          initialRows={initialRows}
          expanded={!collapsedIds.has(file.id)}
          onToggle={() =>
            setCollapsedIds((current) => {
              const next = new Set(current);
              if (next.has(file.id)) {
                next.delete(file.id);
              } else {
                next.add(file.id);
              }
              return next;
            })
          }
        />
      ))}
    </View>
  );
}
