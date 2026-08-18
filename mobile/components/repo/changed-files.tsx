import { FileDiff } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { EmptyState } from '~/components/empty-state';
import type { ChangedFile, FileDiffPayload } from '~/components/repo/git-types';
import { QueryErrorState } from '~/components/repo/repo-states';
import { SectionHeader } from '~/components/section-header';
import { DiffSkeleton, DiffView } from '~/components/shared/diff-view';
import { FileChangeRow } from '~/components/shared/file-change-row';
import { Text } from '~/components/ui/text';

export function statusForChange(file: ChangedFile): string {
  if (file.additions > 0 && file.deletions === 0) {
    return 'A';
  }
  if (file.deletions > 0 && file.additions === 0) {
    return 'D';
  }
  return 'M';
}

export function ChangedFilesSection({
  files,
  selected,
  onSelect,
  diff,
  loading,
  error,
  onRetry,
  title = 'Changed files',
}: {
  files: readonly ChangedFile[];
  selected: string | null;
  onSelect: (path: string | null) => void;
  diff: FileDiffPayload | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  title?: string;
}) {
  const totals = React.useMemo(
    () =>
      files.reduce(
        (acc, file) => ({
          additions: acc.additions + file.additions,
          deletions: acc.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 }
      ),
    [files]
  );

  if (files.length === 0) {
    return (
      <EmptyState
        icon={FileDiff}
        title="No file changes"
        description="This revision does not touch any tracked file."
      />
    );
  }

  return (
    <View>
      <SectionHeader
        title={title}
        count={files.length}
        action={
          <View className="flex-row items-center gap-2">
            <Text className="text-git-added font-mono text-2xs">+{totals.additions}</Text>
            <Text className="text-git-removed font-mono text-2xs">−{totals.deletions}</Text>
          </View>
        }
      />
      <Animated.View layout={LinearTransition.duration(180)}>
        {files.map((file, index) => {
          const open = selected === file.path;
          return (
            <View key={file.path}>
              <FileChangeRow
                path={file.path}
                status={statusForChange(file)}
                additions={file.additions}
                deletions={file.deletions}
                binary={file.binary}
                selected={open}
                first={index === 0}
                last={!open && index === files.length - 1}
                onPress={() => onSelect(open ? null : file.path)}
              />
              {open ? (
                <Animated.View
                  entering={FadeIn.duration(160)}
                  className="border-border bg-background/60 border-x border-b p-2">
                  {loading ? (
                    <DiffSkeleton rows={10} />
                  ) : error ? (
                    <QueryErrorState
                      title="Could not load the diff"
                      error={error}
                      onRetry={onRetry}
                      className="mt-0"
                    />
                  ) : diff?.is_binary ? (
                    <Text className="text-muted-foreground py-4 text-center text-xs">
                      Binary file — no textual diff
                    </Text>
                  ) : (
                    <DiffView diff={diff?.diff ?? ''} collapsible={false} />
                  )}
                </Animated.View>
              ) : null}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}
