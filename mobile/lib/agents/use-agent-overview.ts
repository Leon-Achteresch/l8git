import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useConnections } from '~/lib/connections';

import {
  aggregateAgentOverview,
  emptyHostSnapshot,
  type AgentHostSnapshot,
  type AgentOverviewSummary,
  type AggregateOptions,
} from './overview-aggregator';
import { useAgentSnapshots } from './snapshots';

const EMPTY_SUMMARY: AgentOverviewSummary = {
  entries: [],
  counts: { running: 0, awaitingApproval: 0, failed: 0, idle: 0, active: 0 },
  hosts: [],
};

interface HostDescriptor {
  hostId: string;
  hostName: string;
  online: boolean;
}

function useHostDescriptors(): HostDescriptor[] {
  return useConnections(
    useShallow((state) =>
      state.hosts.map((host) => ({
        hostId: host.hostId,
        hostName: host.name,
        online: state.runtime[host.hostId]?.status === 'online',
      }))
    )
  );
}

export function useAgentHostSnapshots(): AgentHostSnapshot[] {
  const hosts = useHostDescriptors();
  const byHost = useAgentSnapshots((state) => state.byHost);
  return React.useMemo(
    () =>
      hosts.map((host) => {
        const snapshot = byHost[host.hostId];
        if (!snapshot) {
          return emptyHostSnapshot(host.hostId, host.hostName, host.online);
        }
        return { ...snapshot, hostName: host.hostName, online: host.online };
      }),
    [byHost, hosts]
  );
}

export function useAgentOverview(options: AggregateOptions = {}): AgentOverviewSummary {
  const snapshots = useAgentHostSnapshots();
  const { query, onlineOnly } = options;
  return React.useMemo(
    () =>
      snapshots.length === 0
        ? EMPTY_SUMMARY
        : aggregateAgentOverview(snapshots, { query, onlineOnly }),
    [onlineOnly, query, snapshots]
  );
}

export function useAgentApprovalCount(): number {
  return useAgentOverview().counts.awaitingApproval;
}

export function useAgentActiveCount(): number {
  return useAgentOverview().counts.active;
}
