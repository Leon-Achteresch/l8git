import { Slot, useRouter, useSegments } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RepoHeader } from '~/components/repo/repo-header';
import { Separator } from '~/components/ui/separator';
import { useHostRuntime } from '~/lib/connections';
import { repoName as repoNameOf } from '~/components/shared/format';
import { useRepoSummary, useRepoWatcher } from '~/lib/repo/queries';
import {
  isRepoDetailRoute,
  repoSectionHref,
  sectionFromSegments,
  useRepoRoute,
  type RepoSection,
} from '~/lib/repo/route';

export default function RepoShellLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { hostId, repoPath } = useRepoRoute();
  const runtime = useHostRuntime(hostId);
  const online = runtime.status === 'online';

  const section = sectionFromSegments(segments);
  const detail = isRepoDetailRoute(segments);
  const summary = useRepoSummary(hostId, repoPath, online);

  useRepoWatcher(hostId, repoPath, online);

  const onSelect = React.useCallback(
    (next: RepoSection) => {
      router.replace(repoSectionHref(next, hostId, repoPath));
    },
    [hostId, repoPath, router]
  );

  const onBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/repos');
  }, [router]);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      {detail ? null : (
        <>
          <RepoHeader
            hostId={hostId}
            repoName={summary.data?.name || repoNameOf(repoPath)}
            repoPath={repoPath}
            branch={summary.data?.branch}
            ahead={summary.data?.ahead ?? 0}
            behind={summary.data?.behind ?? 0}
            section={section}
            onSelect={onSelect}
            onBack={onBack}
          />
          <Separator />
        </>
      )}
      <View className="flex-1">
        <Slot />
      </View>
    </SafeAreaView>
  );
}
