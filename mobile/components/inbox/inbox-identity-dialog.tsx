import { UserRound, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/ui/icon';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { useViewerIdentity } from '~/lib/inbox-identity';

const PROVIDER_LABEL: Record<string, string> = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'bitbucket.org': 'Bitbucket',
  'dev.azure.com': 'Azure DevOps',
};

export function providerLabel(host: string): string {
  return PROVIDER_LABEL[host] ?? host;
}

export function InboxIdentityDialog({
  open,
  onOpenChange,
  hosts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hosts: string[];
}) {
  const logins = useViewerIdentity((state) => state.logins);
  const setLogin = useViewerIdentity((state) => state.setLogin);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const next: Record<string, string> = {};
    for (const host of hosts) {
      next[host] = logins[host] ?? '';
    }
    setDrafts(next);
    setBusy(false);
  }, [open, hosts, logins]);

  const save = React.useCallback(async () => {
    setBusy(true);
    try {
      for (const host of hosts) {
        await setLogin(host, drafts[host] ?? null);
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }, [drafts, hosts, onOpenChange, setLogin]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4">
        <DialogHeader>
          <DialogTitle>Your review handles</DialogTitle>
          <DialogDescription>
            l8git filters &quot;My open pull requests&quot; and &quot;Awaiting your review&quot; by
            these usernames. Leave a field empty to show every open pull request for that provider.
          </DialogDescription>
        </DialogHeader>

        <View className="gap-3">
          {hosts.length === 0 ? (
            <Text className="text-muted-foreground text-sm">
              No pull request provider detected yet. Open a repo with a remote first.
            </Text>
          ) : (
            hosts.map((host) => (
              <View key={host} className="gap-1.5">
                <View className="flex-row items-center gap-1.5">
                  <Icon as={UserRound} size={12} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-xs font-medium">
                    {providerLabel(host)}
                  </Text>
                  <Text className="text-muted-foreground/60 font-mono text-2xs">{host}</Text>
                </View>
                <Input
                  value={drafts[host] ?? ''}
                  onChangeText={(value) => setDrafts((prev) => ({ ...prev, [host]: value }))}
                  placeholder="username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="done"
                />
              </View>
            ))
          )}
        </View>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onPress={() => onOpenChange(false)}>
            <Text>Cancel</Text>
          </Button>
          <Button disabled={busy || hosts.length === 0} onPress={() => void save()}>
            <Text>Save</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InboxIdentityNudge({
  hosts,
  onPress,
  onDismiss,
}: {
  hosts: string[];
  onPress: () => void;
  onDismiss: () => void;
}) {
  if (hosts.length === 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className="border-border bg-card flex-row items-center gap-3 rounded-3xl border py-3 pl-3.5 pr-2">
      <View className="bg-secondary h-10 w-10 items-center justify-center rounded-2xl">
        <Icon as={UserRound} size={19} className="text-muted-foreground" />
      </View>
      <Text className="text-muted-foreground min-w-0 flex-1 text-xs">
        Showing every open pull request. Add your {hosts.map(providerLabel).join(' and ')} handle to
        filter this feed.
      </Text>
      <Button size="sm" variant="secondary" onPress={onPress}>
        <Text className="text-xs">Set handle</Text>
      </Button>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        onPress={onDismiss}
        className="active:bg-accent h-7 w-7 items-center justify-center rounded-lg">
        <Icon as={X} size={13} className="text-muted-foreground/70" />
      </Pressable>
    </Animated.View>
  );
}
