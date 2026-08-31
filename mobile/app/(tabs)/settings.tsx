import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Info, Shapes, UserRound, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HostsSection } from '~/components/connections/hosts-section';
import { ListGroup, ListRow } from '~/components/list-row';
import { Icon } from '~/components/ui/icon';
import { Text } from '~/components/ui/text';
import { useConnections } from '~/lib/connections';
import { palette } from '~/lib/theme';

function RowIcon({ icon, color = palette.foreground }: { icon: LucideIcon; color?: string }) {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
      }}>
      <Icon as={icon} size={17} color={color} />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const hosts = useConnections((state) => state.hosts.length);
  const online = useConnections(
    (state) => Object.values(state.runtime).filter((runtime) => runtime.status === 'online').length
  );

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="px-5 pb-2 pt-2">
        <View className="bg-card items-center overflow-hidden rounded-[32px] px-5 pb-6 pt-4">
          <Text className="text-foreground w-full text-[32px] font-bold tracking-tight">You</Text>
          <View
            style={{
              width: 92,
              height: 92,
              borderRadius: 46,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.28)',
              overflow: 'hidden',
              marginTop: 16,
              backgroundColor: palette.elevated,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon as={UserRound} size={36} color={palette.foreground} />
          </View>
            <Text className="text-foreground pt-3 text-xl font-bold">l8git Remote</Text>
            <Text className="text-muted-foreground text-sm">
              {`v${Constants.expoConfig?.version ?? '0.1.0'}`}
            </Text>
            <View
              className="mt-5 w-full flex-row py-3"
              style={{ borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <View className="flex-1 items-center gap-0.5">
                <Text style={{ fontVariant: ['tabular-nums'] }} className="text-foreground text-lg font-bold">
                  {hosts}
                </Text>
                <Text className="text-muted-foreground text-2xs">Hosts</Text>
              </View>
              <View className="flex-1 items-center gap-0.5">
                <Text style={{ fontVariant: ['tabular-nums'] }} className="text-foreground text-lg font-bold">
                  {online}
                </Text>
                <Text className="text-muted-foreground text-2xs">Online</Text>
              </View>
              <View className="flex-1 items-center gap-0.5">
                <Text className="text-foreground text-lg font-bold">OLED</Text>
                <Text className="text-muted-foreground text-2xs">Look</Text>
              </View>
            </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pb-36"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <HostsSection />

        {__DEV__ ? (
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={Shapes} />}
              title="Component bench"
              subtitle="Every shared primitive on one screen"
              chevron
              onPress={() => router.push('/dev-components')}
            />
          </ListGroup>
        ) : null}

        <ListGroup>
          <ListRow
            leading={<RowIcon icon={Info} />}
            title="l8git Remote"
            subtitle={`v${Constants.expoConfig?.version ?? '0.1.0'}`}
          />
        </ListGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
