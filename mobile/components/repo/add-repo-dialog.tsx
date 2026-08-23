import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as React from 'react';
import { Platform, View } from 'react-native';

import { PressableRow } from '~/components/shared/pressable-row';
import { StatusDot } from '~/components/status-dot';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { GlassPill, SolidPill } from '~/components/ui/glass';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { getClient, useConnections } from '~/lib/connections';
import { hostScopeKey } from '~/lib/query';
import { useRepoRegistry } from '~/lib/repo/registry';
import type { RepoFullStatus } from '~/lib/repo/types';
import { cn } from '~/lib/utils';

export type AddRepoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultHostId?: string | null;
};

export function AddRepoDialog({ open, onOpenChange, defaultHostId }: AddRepoDialogProps) {
  const hosts = useConnections((state) => state.hosts);
  const runtime = useConnections((state) => state.runtime);
  const addPath = useRepoRegistry((state) => state.addPath);
  const queryClient = useQueryClient();

  const [hostId, setHostId] = React.useState<string | null>(defaultHostId ?? null);
  const [path, setPath] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setPath('');
    setError(null);
    setChecking(false);
    setHostId(
      defaultHostId ??
        hosts.find((host) => runtime[host.hostId]?.status === 'online')?.hostId ??
        hosts[0]?.hostId ??
        null
    );
  }, [defaultHostId, hosts, open, runtime]);

  const submit = React.useCallback(async () => {
    const trimmed = path.trim();
    if (!hostId || !trimmed) {
      setError('Pick a host and enter an absolute repository path.');
      return;
    }
    const client = getClient(hostId);
    if (!client) {
      setError('That host is offline right now.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await client.request<RepoFullStatus>('repo_full_status', { path: trimmed });
      await addPath(hostId, trimmed);
      void queryClient.invalidateQueries({ queryKey: hostScopeKey(hostId) });
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }, [addPath, hostId, onOpenChange, path, queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5">
        <DialogHeader>
          <DialogTitle>Add a repository</DialogTitle>
          <DialogDescription>
            Enter the absolute path of a working copy the host has allowed.
          </DialogDescription>
        </DialogHeader>

        <View className="gap-2">
          <Text className="text-foreground text-base font-semibold">Host</Text>
          <View className="bg-muted overflow-hidden rounded-3xl">
            {hosts.map((host, index) => {
              const status = runtime[host.hostId]?.status ?? 'idle';
              return (
                <PressableRow
                  key={host.hostId}
                  first={index === 0}
                  last={index === hosts.length - 1}
                  selected={host.hostId === hostId}
                  onPress={() => setHostId(host.hostId)}>
                  <View className="bg-muted flex-row items-center gap-3 px-4 py-3">
                    <StatusDot
                      tone={
                        status === 'online'
                          ? 'online'
                          : status === 'connecting' || status === 'reconnecting'
                            ? 'connecting'
                            : status === 'error'
                              ? 'error'
                              : 'offline'
                      }
                    />
                    <Text
                      numberOfLines={1}
                      className={cn(
                        'flex-1 text-sm',
                        host.hostId === hostId ? 'text-foreground font-semibold' : 'text-muted-foreground'
                      )}>
                      {host.name}
                    </Text>
                  </View>
                </PressableRow>
              );
            })}
            {hosts.length === 0 ? (
              <Text className="text-muted-foreground text-sm">
                Pair a host in Settings first.
              </Text>
            ) : null}
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-foreground text-base font-semibold">Repository path</Text>
          <Input
            value={path}
            onChangeText={setPath}
            placeholder="/Users/you/Code/project"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            className="bg-muted font-mono text-sm"
            onSubmitEditing={() => void submit()}
          />
          {error ? <Text className="text-destructive text-xs">{error}</Text> : null}
        </View>

        <DialogFooter className="gap-3">
          <GlassPill
            label="Cancel"
            onPress={() => onOpenChange(false)}
            style={{ alignSelf: 'center' }}
          />
          <SolidPill
            label={checking ? 'Checking…' : 'Add repository'}
            disabled={checking || !path.trim() || !hostId}
            onPress={() => void submit()}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
