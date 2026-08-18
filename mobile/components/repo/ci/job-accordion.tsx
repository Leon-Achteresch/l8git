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
  type WorkflowJob,
  type WorkflowStep,
} from '~/components/repo/ci/ci-types';
import { StatusPill } from '~/components/shared/status-pill';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { cn } from '~/lib/utils';

const SPRING = { damping: 20, stiffness: 220, mass: 0.6 } as const;

function StepRow({ step, last }: { step: WorkflowStep; last: boolean }) {
  const duration = formatDuration(step.started_at, step.completed_at);
  return (
    <View className="flex-row items-start gap-2.5 pl-1">
      <View className="items-center">
        <View className="py-0.5">
          <CiStatusIcon status={step.status} conclusion={step.conclusion} size={12} />
        </View>
        {last ? null : <View className="bg-border/70 w-px flex-1" />}
      </View>
      <View className="min-w-0 flex-1 flex-row items-center gap-2 pb-2.5">
        <Text numberOfLines={2} className="text-muted-foreground flex-1 text-xs leading-4">
          <Text className="text-muted-foreground/50 font-mono text-2xs">{step.number}. </Text>
          {step.name}
        </Text>
        {duration ? (
          <Text className="text-muted-foreground/60 font-mono text-2xs tabular-nums">
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
  onToggle,
}: {
  job: WorkflowJob;
  expanded: boolean;
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
      className={cn(
        'border-border bg-card/40 overflow-hidden rounded-xl border',
        expanded && 'bg-card/70'
      )}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Job ${job.name}`}
        onPress={() => onToggle(job.id)}
        className="active:bg-accent/40 flex-row items-center gap-2.5 px-3 py-3">
        <Animated.View style={chevronStyle}>
          <Icon as={ChevronRight} size={14} className="text-muted-foreground" />
        </Animated.View>
        <CiStatusIcon status={job.status} conclusion={job.conclusion} size={15} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-foreground text-sm font-medium">
            {job.name}
          </Text>
          <Text className="text-muted-foreground/70 text-2xs">
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
            className="active:bg-accent h-7 w-7 items-center justify-center rounded-lg">
            <Icon as={ExternalLink} size={12} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          className="border-border/60 border-t px-3 pt-2.5">
          {job.steps.length === 0 ? (
            <Text className="text-muted-foreground/70 pb-3 text-xs italic">
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
    <View className="gap-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} expanded={expanded.has(job.id)} onToggle={toggle} />
      ))}
    </View>
  );
}
