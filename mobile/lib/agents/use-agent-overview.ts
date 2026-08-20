import * as React from 'react';

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
  const hosts = useConnections((state) => state.hosts);
  const runtime = useConnections((state) => state.runtime);
  return React.useMemo(
    () =>
      hosts.map((host) => ({
        hostId: host.hostId,
        hostName: host.name,
        online: runtime[host.hostId]?.status === 'online',
      })),
    [hosts, runtime]
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
