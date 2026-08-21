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
  cancelled: 'bg-secondary',
  skipped: 'bg-secondary',
  neutral: 'bg-secondary',
  unknown: 'bg-secondary',
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
      className={first ? undefined : 'border-border/60 border-t'}>
      <Pressable
        accessibilityRole={expandable ? 'button' : undefined}
        disabled={!expandable}
        onPress={() => setExpanded((value) => !value)}
        className="active:bg-accent/40 flex-row items-center gap-3 px-3 py-2.5">
        <View
          className={cn(
            'h-9 w-9 items-center justify-center rounded-xl',
            CHECK_SURFACE[ciState(check.status, check.conclusion)]
          )}>
          <CiStatusIcon status={check.status} conclusion={check.conclusion} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-sm font-medium">
            {check.name}
          </Text>
          <Text numberOfLines={1} className="text-muted-foreground text-2xs">
            {meta}
          </Text>
          {detail ? (
            <Text numberOfLines={1} className="text-muted-foreground/70 text-2xs">
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
            className="active:bg-accent h-7 w-7 items-center justify-center rounded-lg">
            {rerunning ? (
              <Spinner size={13} className="text-foreground" />
            ) : (
              <Icon as={RotateCw} size={13} className="text-muted-foreground" />
            )}
          </Pressable>
        ) : null}
        {url ? (
          <Pressable
            accessibilityLabel={`Open ${check.name} in browser`}
            hitSlop={8}
            onPress={() => void Linking.openURL(url).catch(() => undefined)}
            className="active:bg-accent h-7 w-7 items-center justify-center rounded-lg">
            <Icon as={ExternalLink} size={13} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </Pressable>

      {expanded && summary ? (
        <Animated.View entering={FadeIn.duration(140)} className="px-3 pb-3">
          <View className="border-border bg-muted/40 rounded-lg border px-2.5 py-2">
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
      <View className="bg-card flex-row items-center gap-3 rounded-2xl px-3.5 py-3.5">
        <View className="bg-secondary h-10 w-10 items-center justify-center rounded-2xl">
          <Icon as={ShieldCheck} size={19} className="text-muted-foreground" />
        </View>
        <Text className="text-muted-foreground text-sm">No checks reported for this commit.</Text>
      </View>
    );
  }

  return (
    <View className="border-border bg-card overflow-hidden rounded-2xl border">
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
