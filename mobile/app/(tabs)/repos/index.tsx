import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FolderGit2, Plus, Search, ServerOff, X } from 'lucide-react-native';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddRepoDialog } from '~/components/repo/add-repo-dialog';
import { HostReposSection } from '~/components/repo/host-repos-section';
import { EmptyState } from '~/components/empty-state';
import { ScreenTitle } from '~/components/screen';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { useConnections } from '~/lib/connections';
import { useRepoRegistryHydration } from '~/lib/repo/registry';
import { palette } from '~/lib/theme';

export default function ReposScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hydrated = useRepoRegistryHydration();
  const hosts = useConnections((state) => state.hosts);
  const runtime = useConnections((state) => state.runtime);

  const [query, setQuery] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogHostId, setDialogHostId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const ordered = React.useMemo(() => {
    const rank = (hostId: string) => {
      const status = runtime[hostId]?.status ?? 'idle';
      if (status === 'online') {
        return 0;
      }
      return status === 'connecting' || status === 'reconnecting' ? 1 : 2;
    };
    return [...hosts].sort(
      (a, b) => rank(a.hostId) - rank(b.hostId) || a.name.localeCompare(b.name)
    );
  }, [hosts, runtime]);

  const onlineCount = ordered.filter(
    (host) => runtime[host.hostId]?.status === 'online'
  ).length;

  const [matches, setMatches] = React.useState<Record<string, number>>({});
  const reportMatches = React.useCallback((hostId: string, count: number) => {
    setMatches((current) => (current[hostId] === count ? current : { ...current, [hostId]: count }));
  }, []);
  const totalMatches = ordered.reduce((sum, host) => sum + (matches[host.hostId] ?? 0), 0);

  const openDialog = React.useCallback((hostId: string | null) => {
    setDialogHostId(hostId);
    setDialogOpen(true);
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ type: 'active' });
    setRefreshing(false);
  }, [queryClient]);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="px-4 pt-2">
        <ScreenTitle
          title="Repos"
          subtitle={
            hosts.length === 0
              ? 'No hosts paired yet'
              : `${onlineCount} of ${hosts.length} ${hosts.length === 1 ? 'host' : 'hosts'} online`
          }
          right={
            <Button
              size="icon"
              variant="secondary"
              accessibilityLabel="Add a repository"
              onPress={() => openDialog(null)}>
              <Icon as={Plus} className="text-foreground size-4" />
            </Button>
          }
        />

        <View className="relative justify-center pb-1">
          <Icon
            as={Search}
            size={15}
            className="text-muted-foreground/60 absolute left-3 z-10"
          />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Filter repositories"
            autoCapitalize="none"
            autoCorrect={false}
            className="h-10 pl-9 pr-9 text-sm"
          />
          {query.length > 0 ? (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 h-8 w-8"
              accessibilityLabel="Clear filter"
              onPress={() => setQuery('')}>
              <Icon as={X} size={14} className="text-muted-foreground" />
            </Button>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerClassName="gap-1 px-4 pb-24 pt-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.mutedForeground} />
        }>
        {hosts.length === 0 ? (
          <EmptyState
            icon={ServerOff}
            title="No hosts paired"
            description="Pair an l8gitd host to browse its working copies."
            action={
              <Button size="sm" variant="secondary" onPress={() => router.push('/settings')}>
                <Text className="text-xs">Open Settings</Text>
              </Button>
            }
            className="py-24"
          />
        ) : !hydrated ? null : (
          ordered.map((host) => (
            <HostReposSection
              key={host.hostId}
              hostId={host.hostId}
              hostName={host.name}
              query={query}
              onAddRepo={openDialog}
              onMatchCount={reportMatches}
            />
          ))
        )}

        {hosts.length > 0 && query.trim().length > 0 && totalMatches === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title="No repositories match"
            description={`Nothing on any host looks like “${query.trim()}”.`}
            className="py-20"
          />
        ) : null}
      </ScrollView>

      <AddRepoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultHostId={dialogHostId}
      />
    </SafeAreaView>
  );
}
