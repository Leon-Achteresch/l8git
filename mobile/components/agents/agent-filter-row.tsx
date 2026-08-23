import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import {
  AGENT_PROVIDER_ORDER,
  providerMeta,
  statusMeta,
} from '~/components/agents/agent-meta';
import {
  AGENT_STATUS_FILTERS,
  countByHost,
  countByProvider,
  countByStatus,
  type AgentOverviewFilters,
  type AgentStatusFilter,
} from '~/components/agents/overview-model';
import { accentFor } from '~/components/shared/format';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';
import type { HostAgentEntry, HostAgentSummary } from '~/lib/agents/overview-aggregator';
import type { NativeAgentProvider } from '~/lib/agents/stores';
import { cn } from '~/lib/utils';

const SPRING = { damping: 20, stiffness: 260, mass: 0.6 } as const;

function selectHaptic() {
  if (Platform.OS !== 'web') {
    void Haptics.selectionAsync();
  }
}

export function FilterChip({
  label,
  count,
  active,
  dot,
  dotColor,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  dot?: boolean;
  dotColor?: string;
  onPress: () => void;
}) {
  const value = useSharedValue(active ? 1 : 0);

  React.useEffect(() => {
    value.value = withSpring(active ? 1 : 0, SPRING);
  }, [active, value]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: value.value,
    transform: [{ scale: 0.93 + value.value * 0.07 }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}>
      <View className="bg-card overflow-hidden rounded-full">
        <Animated.View
          pointerEvents="none"
          style={fillStyle}
          className="bg-primary absolute bottom-0 left-0 right-0 top-0"
        />
        <View className="flex-row items-center gap-1.5 px-3.5 py-2">
          {dot ? (
            <View
              style={{ backgroundColor: dotColor ?? palette.mutedForeground }}
              className="h-1.5 w-1.5 rounded-full"
            />
          ) : null}
          <Text
            className={cn(
              'text-2xs font-semibold',
              active ? 'text-primary-foreground' : 'text-muted-foreground'
            )}>
            {label}
          </Text>
          {typeof count === 'number' ? (
            <Text
              style={{ fontVariant: ['tabular-nums'] }}
              className={cn(
                'font-mono text-2xs',
                active ? 'text-primary-foreground/75' : 'text-muted-foreground/60'
              )}>
              {count}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function Divider() {
  return <View className="bg-border mx-1 h-4 w-px self-center" />;
}

const STATUS_LABEL: Record<AgentStatusFilter, string> = {
  all: 'All',
  awaitingApproval: 'Approvals',
  running: 'Running',
  failed: 'Failed',
  idle: 'Idle',
};

export function AgentFilterRow({
  entries,
  hosts,
  filters,
  boundHostId,
  onChange,
  onFocusHost,
}: {
  entries: readonly HostAgentEntry[];
  hosts: readonly HostAgentSummary[];
  filters: AgentOverviewFilters;
  boundHostId: string | null;
  onChange: (next: AgentOverviewFilters) => void;
  onFocusHost: (hostId: string) => void;
}) {
  const statusCounts = React.useMemo(() => countByStatus(entries), [entries]);
  const providerCounts = React.useMemo(() => countByProvider(entries), [entries]);
  const hostCounts = React.useMemo(() => countByHost(entries), [entries]);

  const activeProviders = React.useMemo(
    () => AGENT_PROVIDER_ORDER.filter((provider) => providerCounts[provider] > 0),
    [providerCounts]
  );

  const setStatus = React.useCallback(
    (status: AgentStatusFilter) => {
      selectHaptic();
      onChange({ ...filters, status });
    },
    [filters, onChange]
  );

  const setProvider = React.useCallback(
    (provider: NativeAgentProvider | 'all') => {
      selectHaptic();
      onChange({ ...filters, provider });
    },
    [filters, onChange]
  );

  const setHost = React.useCallback(
    (hostId: string | 'all') => {
      selectHaptic();
      onChange({ ...filters, hostId });
      if (hostId !== 'all') {
        onFocusHost(hostId);
      }
    },
    [filters, onChange, onFocusHost]
  );

  const showHosts = hosts.length > 1;

  return (
    <View className="gap-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4"
        contentContainerClassName="gap-2 px-4">
        {AGENT_STATUS_FILTERS.map((status) => {
          if (status === 'all') {
            return (
              <FilterChip
                key={status}
                label={STATUS_LABEL[status]}
                count={entries.length}
                active={filters.status === 'all'}
                onPress={() => setStatus('all')}
              />
            );
          }
          const meta = statusMeta(status);
          return (
            <FilterChip
              key={status}
              label={STATUS_LABEL[status]}
              count={statusCounts[status]}
              active={filters.status === status}
              dot
              dotColor={meta.color}
              onPress={() => setStatus(status)}
            />
          );
        })}
      </ScrollView>

      {activeProviders.length > 1 || showHosts ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-4"
          contentContainerClassName="gap-2 px-4 items-center">
          {activeProviders.length > 1 ? (
            <>
              <FilterChip
                label="Any agent"
                active={filters.provider === 'all'}
                onPress={() => setProvider('all')}
              />
              {activeProviders.map((provider) => {
                const meta = providerMeta(provider);
                return (
                  <FilterChip
                    key={provider}
                    label={meta.short}
                    count={providerCounts[provider]}
                    active={filters.provider === provider}
                    dot
                    dotColor={meta.color}
                    onPress={() => setProvider(provider)}
                  />
                );
              })}
            </>
          ) : null}

          {activeProviders.length > 1 && showHosts ? <Divider /> : null}

          {showHosts ? (
            <>
              <FilterChip
                label="All hosts"
                active={filters.hostId === 'all'}
                onPress={() => setHost('all')}
              />
              {hosts.map((host) => (
                <FilterChip
                  key={host.hostId}
                  label={host.hostId === boundHostId ? `${host.hostName} · live` : host.hostName}
                  count={hostCounts[host.hostId] ?? 0}
                  active={filters.hostId === host.hostId}
                  dot
                  dotColor={host.online ? accentFor(host.hostId) : palette.mutedForeground}
                  onPress={() => setHost(host.hostId)}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}
