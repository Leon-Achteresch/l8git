import { ChevronRight, ExternalLink } from 'lucide-react-native';
import * as React from 'react';
import { Linking, Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { CiStatusIcon } from '~/components/repo/ci/ci-status-icon';
import {
  CI_TONE,
  ciState,
  ciStateLabel,
  formatDuration,
  type CiState,
  type WorkflowJob,
  type WorkflowStep,
} from '~/components/repo/ci/ci-types';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

const JOB_SURFACE: Record<CiState, string> = {
  success: 'bg-git-added/15',
  failure: 'bg-git-removed/15',
  running: 'bg-git-branch/15',
  queued: 'bg-git-modified/15',
  cancelled: 'bg-white/10',
  skipped: 'bg-white/10',
  neutral: 'bg-white/10',
  unknown: 'bg-white/10',
};

const SPRING = { damping: 20, stiffness: 220, mass: 0.6 } as const;

function StepRow({ step, last }: { step: WorkflowStep; last: boolean }) {
  const duration = formatDuration(step.started_at, step.completed_at);
  return (
    <View className="flex-row items-start gap-3 pl-1">
      <View className="items-center">
        <View className="py-0.5">
          <CiStatusIcon status={step.status} conclusion={step.conclusion} size={12} />
        </View>
        {last ? null : <View className="bg-white/10 w-px flex-1" />}
      </View>
      <View className="min-w-0 flex-1 flex-row items-center gap-2 pb-3">
        <Text numberOfLines={2} className="text-muted-foreground flex-1 text-xs leading-4">
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground/50 text-2xs">
            {step.number}.{' '}
          </Text>
          {step.name}
        </Text>
        {duration ? (
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-muted-foreground font-mono text-2xs">
            {duration}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function JobCard({
  job,
  expanded,
  first,
  onToggle,
}: {
  job: WorkflowJob;
  expanded: boolean;
  first: boolean;
  onToggle: (id: number) => void;
}) {
  const state = ciState(job.status, job.conclusion);
  const duration = formatDuration(job.started_at, job.completed_at);
  const rotation = useSharedValue(expanded ? 1 : 0);

  React.useEffect(() => {
    rotation.value = withSpring(expanded ? 1 : 0, SPRING);
  }, [expanded, rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 90}deg` }],
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(180)}
      className={cn('overflow-hidden', !first && 'border-white/5 border-t')}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Job ${job.name}`}
        onPress={() => onToggle(job.id)}
        className="active:bg-white/5 flex-row items-center gap-3 px-4 py-3">
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            JOB_SURFACE[state]
          )}>
          <CiStatusIcon status={job.status} conclusion={job.conclusion} size={17} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-sm font-semibold">
            {job.name}
          </Text>
          <Text className="text-muted-foreground text-2xs">
            {[
              `${job.steps.length} step${job.steps.length === 1 ? '' : 's'}`,
              duration,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <StatusPill
          label={ciStateLabel(job.status, job.conclusion)}
          tone={CI_TONE[state]}
          size="xs"
        />
        {job.html_url ? (
          <Pressable
            accessibilityLabel={`Open ${job.name} in browser`}
            hitSlop={8}
            onPress={() => void Linking.openURL(job.html_url ?? '').catch(() => undefined)}
            className="bg-white/10 active:bg-white/15 h-8 w-8 items-center justify-center rounded-full">
            <Icon as={ExternalLink} size={13} className="text-foreground" />
          </Pressable>
        ) : null}
        <Animated.View style={chevronStyle}>
          <Icon as={ChevronRight} size={15} className="text-muted-foreground" />
        </Animated.View>
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(150)} className="px-4 pb-1 pl-[26px] pt-1">
          {job.steps.length === 0 ? (
            <Text className="text-muted-foreground pb-3 text-xs italic">
              This job reported no steps.
            </Text>
          ) : (
            job.steps.map((step, index) => (
              <StepRow
                key={`${step.number}-${step.name}`}
                step={step}
                last={index === job.steps.length - 1}
              />
            ))
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function JobAccordion({ jobs }: { jobs: readonly WorkflowJob[] }) {
  const failing = React.useMemo(
    () => jobs.find((job) => ciState(job.status, job.conclusion) === 'failure')?.id ?? null,
    [jobs]
  );
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const [seeded, setSeeded] = React.useState(false);

  React.useEffect(() => {
    if (seeded || jobs.length === 0) {
      return;
    }
    setSeeded(true);
    setExpanded(new Set(failing !== null ? [failing] : []));
  }, [failing, jobs.length, seeded]);

  const toggle = React.useCallback((id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <View className="bg-card overflow-hidden rounded-[28px]">
      {jobs.map((job, index) => (
        <JobCard
          key={job.id}
          job={job}
          first={index === 0}
          expanded={expanded.has(job.id)}
          onToggle={toggle}
        />
      ))}
    </View>
  );
}
