import type { StatusTone } from '~/components/status-dot';
import type { HostStatus } from '~/lib/connections';

const TONE: Record<HostStatus, StatusTone> = {
  idle: 'offline',
  connecting: 'connecting',
  online: 'online',
  reconnecting: 'connecting',
  error: 'error',
};

export function statusTone(status: HostStatus): StatusTone {
  return TONE[status];
}

export function statusLabel(status: HostStatus, latencyMs: number | null): string {
  if (status === 'online') {
    return latencyMs === null ? 'online' : `online · ${Math.round(latencyMs)} ms`;
  }
  return status;
}
