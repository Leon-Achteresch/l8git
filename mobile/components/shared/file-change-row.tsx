import { CheckSquare, MinusSquare, Square } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { middleTruncate, splitPath } from '~/components/shared/format';
import { PressableRow } from '~/components/shared/pressable-row';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

export type FileStatusCode = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?' | '!';

const STATUS_STYLE: Record<FileStatusCode, { surface: string; text: string; label: string }> = {
  A: { surface: 'bg-git-added/15 border-git-added/30', text: 'text-git-added', label: 'Added' },
  M: {
    surface: 'bg-git-modified/15 border-git-modified/30',
    text: 'text-git-modified',
    label: 'Modified',
  },
  D: {
    surface: 'bg-git-removed/15 border-git-removed/30',
    text: 'text-git-removed',
    label: 'Deleted',
  },
  R: {
    surface: 'bg-git-branch/15 border-git-branch/30',
    text: 'text-git-branch',
    label: 'Renamed',
  },
  C: {
    surface: 'bg-git-branch/15 border-git-branch/30',
    text: 'text-git-branch',
    label: 'Copied',
  },
  T: {
    surface: 'bg-git-merge/15 border-git-merge/30',
    text: 'text-git-merge',
    label: 'Type changed',
  },
  U: {
    surface: 'bg-destructive/15 border-destructive/30',
    text: 'text-destructive',
    label: 'Conflicted',
  },
  '?': {
    surface: 'bg-git-added/10 border-git-added/25',
    text: 'text-git-added',
    label: 'Untracked',
  },
  '!': { surface: 'bg-muted border-border', text: 'text-muted-foreground', label: 'Ignored' },
};

export function normalizeFileStatus(value: string | null | undefined): FileStatusCode {
  const code = (value ?? '').trim().toUpperCase().charAt(0);
  if (code in STATUS_STYLE) {
    return code as FileStatusCode;
  }
  return 'M';
}

export function fileStatusLabel(value: string | null | undefined): string {
  return STATUS_STYLE[normalizeFileStatus(value)].label;
}

export function FileStatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const code = normalizeFileStatus(status);
  const style = STATUS_STYLE[code];
  return (
    <View
      accessibilityLabel={style.label}
      className={cn(
        'items-center justify-center border',
        style.surface,
        size === 'lg' ? 'h-10 w-10 rounded-xl' : 'rounded',
        size === 'sm' && 'h-4 w-4',
        size === 'md' && 'h-5 w-5',
        className
      )}>
      <Text
        className={cn(
          'font-mono-medium',
          size === 'lg' ? 'text-base' : 'text-2xs',
          style.text
        )}>
        {code}
      </Text>
    </View>
  );
}

export type FileChangeCheckState = 'checked' | 'unchecked' | 'indeterminate';

export type FileChangeRowProps = {
  path: string;
  status: string;
  oldPath?: string | null;
  additions?: number | null;
  deletions?: number | null;
  binary?: boolean;
  submodule?: boolean;
  check?: FileChangeCheckState;
  onToggle?: () => void;
  selected?: boolean;
  first?: boolean;
  last?: boolean;
  flat?: boolean;
  dirChars?: number;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
};

const CHECK_ICON = {
  checked: CheckSquare,
  indeterminate: MinusSquare,
  unchecked: Square,
} as const;

export function FileChangeRow({
  path,
  status,
  oldPath,
  additions,
  deletions,
  binary = false,
  submodule = false,
  check,
  onToggle,
  selected = false,
  first = false,
  last = false,
  flat = false,
  dirChars = 30,
  trailing,
  onPress,
  onLongPress,
}: FileChangeRowProps) {
  const { dir, name } = splitPath(path);
  const dirLabel = dir ? middleTruncate(dir, dirChars) : null;
  const renamedFrom = oldPath ? middleTruncate(oldPath, dirChars + 8) : null;

  return (
    <PressableRow
      first={first}
      last={last}
      flat={flat}
      selected={selected}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={`${fileStatusLabel(status)} ${path}`}>
      <View className="flex-row items-center gap-3 px-3.5 py-3">
        {check && onToggle ? (
          <Pressable hitSlop={10} onPress={onToggle} accessibilityRole="checkbox">
            <Icon
              as={CHECK_ICON[check]}
              size={19}
              className={check === 'unchecked' ? 'text-muted-foreground/45' : 'text-foreground'}
            />
          </Pressable>
        ) : null}

        <FileStatusBadge status={status} size="lg" />

        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-foreground text-base font-semibold">
            {name}
            {submodule ? <Text className="text-git-merge text-2xs"> submodule</Text> : null}
          </Text>
          {renamedFrom ? (
            <Text numberOfLines={1} className="text-muted-foreground/70 text-sm">
              from {renamedFrom}
            </Text>
          ) : dirLabel ? (
            <Text numberOfLines={1} className="text-muted-foreground/70 text-sm">
              {dirLabel}
            </Text>
          ) : null}
        </View>

        {binary ? (
          <View className="bg-secondary rounded-full px-2.5 py-1">
            <Text className="text-muted-foreground/70 font-mono text-2xs">bin</Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-1.5">
            {additions ? (
              <View className="bg-git-added/12 rounded-full px-2 py-0.5">
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-git-added font-mono text-2xs">
                  +{additions}
                </Text>
              </View>
            ) : null}
            {deletions ? (
              <View className="bg-git-removed/12 rounded-full px-2 py-0.5">
                <Text
                  style={{ fontVariant: ['tabular-nums'] }}
                  className="text-git-removed font-mono text-2xs">
                  −{deletions}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {trailing}
      </View>
    </PressableRow>
  );
}
