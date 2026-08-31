import { useRouter } from 'expo-router';
import { FolderPlus, Plug, RotateCw } from 'lucide-react-native';
import * as React from 'react';
import { Alert, View } from 'react-native';

import { HostAvatar } from '~/components/host-avatar';
import { RepoTile } from '~/components/repo/repo-row';
import { GlassCircle } from '~/components/ui/glass';
import { SkeletonList } from '~/components/skeleton-list';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections, useHostRuntime } from '~/lib/connections';
import { useHostRepoPaths, useRepoRegistry } from '~/lib/repo/registry';
import { useHostRepoPathsQuery, useRepoOverviews } from '~/lib/repo/queries';
import { repoLink } from '~/lib/repo/route';
import type { RepoOverview } from '~/lib/repo/types';

function fallbackOverview(path: string): RepoOverview {
  const name = path.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? path;
  return {
    path,
    name,
    branch: '',
    ahead: 0,
    behind: 0,
    dirty_count: 0,
    last_commit_at: null,
    commits_last_30d: [],
    error: null,
  };
}

export type HostReposSectionProps = {
  hostId: string;
  hostName: string;
  query: string;
  onAddRepo: (hostId: string) => void;
  onMatchCount?: (hostId: string, count: number) => void;
};

export function HostReposSection({
  hostId,
  hostName,
  query,
  onAddRepo,
  onMatchCount,
}: HostReposSectionProps) {
  const router = useRouter();
  const runtime = useHostRuntime(hostId);
  const connect = useConnections((state) => state.connect);
  const removePath = useRepoRegistry((state) => state.removePath);
  const storedPaths = useHostRepoPaths(hostId);

  const online = runtime.status === 'online';
  const connecting = runtime.status === 'connecting' || runtime.status === 'reconnecting';

  const pathsQuery = useHostRepoPathsQuery(hostId, online, storedPaths);
  const paths = React.useMemo(
    () => pathsQuery.data ?? [...storedPaths],
    [pathsQuery.data, storedPaths]
  );
  const overviews = useRepoOverviews(hostId, paths, online);

  const rows = React.useMemo(() => {
    const byPath = new Map((overviews.data ?? []).map((row) => [row.path, row]));
    const merged = paths.map((path) => byPath.get(path) ?? fallbackOverview(path));
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return merged;
    }
    return merged.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.path.toLowerCase().includes(needle) ||
        row.branch.toLowerCase().includes(needle)
    );
  }, [overviews.data, paths, query]);

  const filtering = query.trim().length > 0;
  const loading = online && (pathsQuery.isPending || (paths.length > 0 && overviews.isPending));

  React.useEffect(() => {
    onMatchCount?.(hostId, rows.length);
  }, [hostId, onMatchCount, rows.length]);

  if (filtering && rows.length === 0) {
    return null;
  }

  const openRepo = (path: string) => {
    router.push(repoLink(hostId, path));
  };

  const confirmForget = (path: string) => {
    Alert.alert('Remove from list?', path, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void removePath(hostId, path),
      },
    ]);
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between pb-2 pt-5">
        <View className="flex-row items-center gap-3">
          <HostAvatar
            name={hostName}
            size={44}
            status={online ? 'online' : connecting ? 'connecting' : 'idle'}
          />
          <View>
            <Text className="text-foreground text-lg font-bold">{hostName}</Text>
            <Text className="text-muted-foreground text-xs">
              {online ? `${rows.length} ${rows.length === 1 ? 'repo' : 'repos'}` : connecting ? 'Connecting…' : 'Offline'}
            </Text>
          </View>
        </View>
        <GlassCircle
          icon={FolderPlus}
          size={40}
          label={`Add a repository on ${hostName}`}
          onPress={() => onAddRepo(hostId)}
        />
      </View>

      {!online ? (
        <View className="bg-card flex-row items-center gap-3 rounded-3xl px-4 py-3.5">
          <Icon as={Plug} size={15} className="text-muted-foreground/60" />
          <View className="flex-1">
            <Text className="text-foreground text-sm font-medium">
              {connecting ? 'Connecting…' : 'Host offline'}
            </Text>
            <Text numberOfLines={1} className="text-muted-foreground/70 text-2xs">
              {runtime.lastError ?? `${paths.length} repos cached locally`}
            </Text>
          </View>
          {!connecting ? (
            <Button size="sm" variant="secondary" onPress={() => void connect(hostId)}>
              <Text className="text-xs">Connect</Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      {loading && rows.length === 0 ? (
        <SkeletonList rows={3} />
      ) : overviews.isError && rows.length === 0 ? (
        <View className="bg-destructive/10 gap-3 rounded-3xl p-4">
          <Text className="text-destructive text-sm font-medium">Could not load repositories</Text>
          <Text className="text-muted-foreground text-xs">
            {overviews.error instanceof Error ? overviews.error.message : 'Unknown error'}
          </Text>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onPress={() => void overviews.refetch()}>
            <Icon as={RotateCw} size={13} className="text-foreground" />
            <Text className="text-xs">Retry</Text>
          </Button>
        </View>
      ) : rows.length === 0 ? (
        <View className="border-white/15 items-center gap-2 rounded-3xl border border-dashed px-4 py-6">
          <Text className="text-muted-foreground text-sm">No repositories yet</Text>
          <Button size="sm" variant="secondary" onPress={() => onAddRepo(hostId)}>
            <Icon as={FolderPlus} size={13} className="text-foreground" />
            <Text className="text-xs">Add a path</Text>
          </Button>
        </View>
      ) : (
        <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
          {rows.map((row, index) => (
            <RepoTile
              key={row.path}
              overview={row}
              index={index}
              onPress={() => openRepo(row.path)}
              onLongPress={() => confirmForget(row.path)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
