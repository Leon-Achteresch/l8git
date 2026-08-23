import * as Haptics from 'expo-haptics';
import { ArrowDownToLine, ArrowUpToLine, CloudDownload, Settings2 } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import {
  PULL_STRATEGIES,
  PULL_STRATEGY_LABEL,
  useHydratedWorkspaceDefaults,
  useWorkspaceDefaults,
} from '~/lib/repo/prefs';
import type { RemoteOpKind } from '~/lib/repo/remote-ops';
import { cn } from '~/lib/utils';

type ToolbarButtonProps = {
  label: string;
  icon: typeof CloudDownload;
  count?: number;
  tone?: 'default' | 'added' | 'info';
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ToolbarButton({
  label,
  icon,
  count = 0,
  tone = 'default',
  busy = false,
  disabled = false,
  onPress,
}: ToolbarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={() => {
        if (Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress();
      }}
      className={cn(
        'bg-card h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full active:opacity-70',
        (disabled || busy) && 'opacity-45'
      )}>
      <Icon
        as={icon}
        size={14}
        className={
          tone === 'added'
            ? 'text-git-added'
            : tone === 'info'
              ? 'text-git-branch'
              : 'text-muted-foreground'
        }
      />
      <Text className="text-foreground text-xs font-medium">{busy ? '…' : label}</Text>
      {count > 0 && !busy ? (
        <Text
          className={cn(
            'font-mono text-2xs',
            tone === 'added' ? 'text-git-added' : 'text-git-branch'
          )}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

export type RemoteToolbarProps = {
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  busy: RemoteOpKind | null;
  disabled?: boolean;
  onRun: (op: RemoteOpKind) => void;
};

export function RemoteToolbar({
  ahead,
  behind,
  hasUpstream,
  busy,
  disabled = false,
  onRun,
}: RemoteToolbarProps) {
  const defaults = useHydratedWorkspaceDefaults();
  const update = useWorkspaceDefaults((state) => state.update);
  const [showStrategy, setShowStrategy] = React.useState(false);

  return (
    <View className="gap-2 px-4 pb-2 pt-1">
      <View className="flex-row items-center gap-2">
        <ToolbarButton
          label="Fetch"
          icon={CloudDownload}
          busy={busy === 'fetch'}
          disabled={disabled || busy !== null}
          onPress={() => onRun('fetch')}
        />
        <ToolbarButton
          label="Pull"
          icon={ArrowDownToLine}
          tone="info"
          count={behind}
          busy={busy === 'pull'}
          disabled={disabled || busy !== null}
          onPress={() => onRun('pull')}
        />
        <ToolbarButton
          label="Push"
          icon={ArrowUpToLine}
          tone="added"
          count={ahead}
          busy={busy === 'push'}
          disabled={disabled || busy !== null}
          onPress={() => onRun('push')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remote defaults"
          onPress={() => setShowStrategy((value) => !value)}
          className={cn(
            'bg-card h-11 w-11 items-center justify-center rounded-full active:opacity-70',
            showStrategy && 'bg-accent'
          )}>
          <Icon as={Settings2} size={14} className="text-muted-foreground" />
        </Pressable>
      </View>

      {!hasUpstream ? (
        <Text className="text-muted-foreground/70 px-1 text-2xs">
          This branch has no upstream — push will need one configured on the host.
        </Text>
      ) : null}

      {showStrategy ? (
        <View className="bg-card gap-2 rounded-3xl p-3.5">
          <Text className="text-muted-foreground text-2xs uppercase tracking-widest">
            Pull strategy
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {PULL_STRATEGIES.map((strategy) => (
              <Pressable
                key={strategy}
                accessibilityRole="radio"
                accessibilityState={{ selected: defaults.pullStrategy === strategy }}
                onPress={() => update({ pullStrategy: strategy })}
                className={cn(
                  'rounded-full border px-2.5 py-1',
                  defaults.pullStrategy === strategy
                    ? 'border-git-branch/40 bg-git-branch/15'
                    : 'border-border bg-muted/50'
                )}>
                <Text
                  className={cn(
                    'text-2xs font-medium',
                    defaults.pullStrategy === strategy
                      ? 'text-git-branch'
                      : 'text-muted-foreground'
                  )}>
                  {PULL_STRATEGY_LABEL[strategy]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-muted-foreground pt-1 text-2xs uppercase tracking-widest">
            Fetch
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            <TogglePill
              label="Prune branches"
              active={defaults.fetchPruneBranches}
              onPress={() => update({ fetchPruneBranches: !defaults.fetchPruneBranches })}
            />
            <TogglePill
              label="Prune tags"
              active={defaults.fetchPruneTags}
              onPress={() => update({ fetchPruneTags: !defaults.fetchPruneTags })}
            />
            <TogglePill
              label="Push --no-verify"
              active={defaults.pushNoVerify}
              onPress={() => update({ pushNoVerify: !defaults.pushNoVerify })}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TogglePill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      className={cn(
        'rounded-full border px-2.5 py-1',
        active ? 'border-foreground/30 bg-accent' : 'border-border bg-muted/50'
      )}>
      <Text className={cn('text-2xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}
