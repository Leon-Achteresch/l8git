import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FolderGit2, Plus, Search, ServerOff, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddRepoDialog } from '~/components/repo/add-repo-dialog';
import { HostReposSection } from '~/components/repo/host-repos-section';
import { ConnectedHostCard } from '~/components/connected-host-card';
import { statusLabel } from '~/components/connections/status';
import { EmptyState } from '~/components/empty-state';
import { Glass, GlassCircle, SolidPill } from '~/components/ui/glass';
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
      <View className="px-5 pt-1">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-foreground text-[32px] font-bold">Repos</Text>
          <GlassCircle icon={Plus} label="Add a repository" onPress={() => openDialog(null)} />
        </View>

        <Glass style={{ height: 48, borderRadius: 24, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Icon as={Search} size={17} className="text-muted-foreground" />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search repositories"
            placeholderTextColor={palette.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            className="h-11 flex-1 border-0 bg-transparent px-0 text-base"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear filter"
              onPress={() => setQuery('')}
              className="active:opacity-60">
              <Icon as={X} size={16} className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </Glass>
      </View>

      <ScrollView
        contentContainerClassName="pb-36 pt-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.mutedForeground} />
        }>
        {hosts.length > 0 ? (
          <View className="gap-3 pb-2 pt-4">
            <View className="flex-row items-center justify-between px-5">
              <Text className="text-muted-foreground text-sm">Connected hosts</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pair another host"
                onPress={() => router.push('/settings')}
                hitSlop={8}>
                <Text className="text-foreground text-sm font-semibold">Pair</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {ordered.map((host) => (
                <ConnectedHostCard
                  key={host.hostId}
                  name={host.name}
                  records={matches[host.hostId] ?? 0}
                  recency={statusLabel(
                    runtime[host.hostId]?.status ?? 'idle',
                    runtime[host.hostId]?.latencyMs ?? null
                  )}
                  status={runtime[host.hostId]?.status ?? 'idle'}
                  onPress={() => openDialog(host.hostId)}
                />
              ))}
            </ScrollView>
            <Text className="text-muted-foreground px-5 pt-2 text-sm">Your repositories</Text>
          </View>
        ) : null}

        <View className="px-5">
        {hosts.length === 0 ? (
          <EmptyState
            icon={ServerOff}
            title="No hosts paired"
            description="Pair an l8gitd host to browse its working copies."
            action={<SolidPill label="Open Settings" onPress={() => router.push('/settings')} />}
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
        </View>
      </ScrollView>

      <AddRepoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultHostId={dialogHostId}
      />
    </SafeAreaView>
  );
}
