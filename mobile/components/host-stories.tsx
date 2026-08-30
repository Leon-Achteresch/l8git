import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { HostAvatar } from '~/components/host-avatar';
import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections } from '~/lib/connections';
import { palette } from '~/lib/theme';

const SIZE = 64;

export function HostStories() {
  const router = useRouter();
  const hosts = useConnections((state) => state.hosts);
  const runtime = useConnections((state) => state.runtime);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add host"
        onPress={() => router.push('/settings')}
        style={({ pressed }) => ({ width: SIZE, alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
        <View
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: 'rgba(255,255,255,0.32)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Glass
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon as={Plus} size={18} color={palette.foreground} />
          </Glass>
        </View>
        <Text numberOfLines={1} className="text-muted-foreground text-center text-2xs">
          Add host
        </Text>
      </Pressable>

      {hosts.map((host) => {
        const status = runtime[host.hostId]?.status ?? 'idle';
        return (
          <Pressable
            key={host.hostId}
            accessibilityRole="button"
            accessibilityLabel={`${host.name}, ${status}`}
            onPress={() => router.push('/settings')}
            style={({ pressed }) => ({
              width: SIZE,
              alignItems: 'center',
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}>
            <HostAvatar name={host.name} size={SIZE} status={status} />
            <Text numberOfLines={1} className="text-muted-foreground text-center text-2xs">
              {host.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
