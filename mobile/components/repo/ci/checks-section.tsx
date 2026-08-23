import { ExternalLink, RotateCw, ShieldCheck } from 'lucide-react-native';
import * as React from 'react';
import { Linking, Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { CiStatusIcon } from '~/components/repo/ci/ci-status-icon';
import {
  CI_LABEL,
  CI_TONE,
  ciState,
  ciStateLabel,
  formatDuration,
  summarizeChecks,
  type CiState,
  type RemoteCiCheck,
} from '~/components/repo/ci/ci-types';
import { Spinner } from '~/components/shared/spinner';
import { relativeTime } from '~/components/shared/format';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

const CHECK_SURFACE: Record<CiState, string> = {
  success: 'bg-git-added/15',
  failure: 'bg-git-removed/15',
  running: 'bg-git-branch/15',
  queued: 'bg-git-modified/15',
  cancelled: 'bg-white/10',
  skipped: 'bg-white/10',
  neutral: 'bg-white/10',
  unknown: 'bg-white/10',
};

const SUMMARY_ORDER: readonly CiState[] = [
  'failure',
  'running',
  'queued',
  'success',
  'cancelled',
  'skipped',
  'neutral',
  'unknown',
];

export function canRerunCheck(check: RemoteCiCheck): boolean {
  return (
    check.ci_kind === 'github_check_run' &&
    Boolean(check.check_run_id) &&
    Boolean(check.conclusion)
  );
}

export function ChecksSummary({ checks }: { checks: readonly RemoteCiCheck[] }) {
  const totals = React.useMemo(() => summarizeChecks(checks), [checks]);
  const shown = SUMMARY_ORDER.filter((state) => totals[state] > 0);

  if (shown.length === 0) {
    return null;
  }

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {shown.map((state) => (
        <StatusPill
          key={state}
          label={`${totals[state]} ${CI_LABEL[state].toLowerCase()}`}
          tone={CI_TONE[state]}
          size="xs"
        />
      ))}
    </View>
  );
}

function CheckRow({
  check,
  first,
  rerunning,
  onRerun,
}: {
  check: RemoteCiCheck;
  first: boolean;
  rerunning: boolean;
  onRerun: ((check: RemoteCiCheck) => void) | null;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const url = check.html_url ?? check.details_url ?? null;
  const duration = formatDuration(check.started_at, check.completed_at);
  const detail = check.output_title ?? check.description ?? null;
  const meta = [
    ciStateLabel(check.status, check.conclusion),
    duration,
    check.app_name ?? undefined,
    relativeTime(check.completed_at ?? check.started_at ?? check.updated_at),
  ]
    .filter(Boolean)
    .join(' · ');
  const summary = check.output_summary?.trim() || null;
  const expandable = Boolean(summary);

  return (
    <Animated.View
      layout={LinearTransition.duration(160)}
      className={first ? undefined : 'border-white/5 border-t'}>
      <Pressable
        accessibilityRole={expandable ? 'button' : undefined}
        disabled={!expandable}
        onPress={() => setExpanded((value) => !value)}
        className="active:bg-white/5 flex-row items-center gap-3 px-4 py-3">
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            CHECK_SURFACE[ciState(check.status, check.conclusion)]
          )}>
          <CiStatusIcon status={check.status} conclusion={check.conclusion} size={17} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
            {check.name}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-2xs">
            {meta}
          </Text>
          {detail ? (
            <Text numberOfLines={1} className="text-muted-foreground text-2xs">
              {detail}
            </Text>
          ) : null}
        </View>
        {onRerun && canRerunCheck(check) ? (
          <Pressable
            accessibilityLabel={`Re-run ${check.name}`}
            hitSlop={8}
            disabled={rerunning}
            onPress={() => onRerun(check)}
            className="bg-white/10 active:bg-white/15 h-8 w-8 items-center justify-center rounded-full">
            {rerunning ? (
              <Spinner size={13} className="text-foreground" />
            ) : (
              <Icon as={RotateCw} size={13} className="text-foreground" />
            )}
          </Pressable>
        ) : null}
        {url ? (
          <Pressable
            accessibilityLabel={`Open ${check.name} in browser`}
            hitSlop={8}
            onPress={() => void Linking.openURL(url).catch(() => undefined)}
            className="bg-white/10 active:bg-white/15 h-8 w-8 items-center justify-center rounded-full">
            <Icon as={ExternalLink} size={13} className="text-foreground" />
          </Pressable>
        ) : null}
      </Pressable>

      {expanded && summary ? (
        <Animated.View entering={FadeIn.duration(140)} className="px-4 pb-3.5">
          <View className="bg-white/5 rounded-2xl px-3.5 py-2.5">
            <Text className="text-muted-foreground text-2xs leading-4">{summary}</Text>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function ChecksList({
  checks,
  onRerun,
  rerunningKey,
}: {
  checks: readonly RemoteCiCheck[];
  onRerun?: ((check: RemoteCiCheck) => void) | null;
  rerunningKey?: string | null;
}) {
  const sorted = React.useMemo(() => {
    const weight: Record<CiState, number> = {
      failure: 0,
      running: 1,
      queued: 2,
      unknown: 3,
      neutral: 4,
      cancelled: 5,
      skipped: 6,
      success: 7,
    };
    return [...checks].sort(
      (left, right) =>
        weight[ciState(left.status, left.conclusion)] -
        weight[ciState(right.status, right.conclusion)]
    );
  }, [checks]);

  if (sorted.length === 0) {
    return (
      <View className="bg-card flex-row items-center gap-3 rounded-[28px] px-4 py-3.5">
        <View className="bg-white/10 h-10 w-10 items-center justify-center rounded-full">
          <Icon as={ShieldCheck} size={17} className="text-muted-foreground" />
        </View>
        <Text className="text-muted-foreground flex-1 text-sm">
          No checks reported for this commit.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-card overflow-hidden rounded-[28px]">
      {sorted.map((check, index) => (
        <CheckRow
          key={check.check_run_id ?? check.status_uuid ?? `${check.name}-${index}`}
          check={check}
          first={index === 0}
          rerunning={Boolean(rerunningKey) && rerunningKey === (check.check_run_id ?? check.name)}
          onRerun={onRerun ?? null}
        />
      ))}
    </View>
  );
}
