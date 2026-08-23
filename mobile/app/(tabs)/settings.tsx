import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Bell, Info, Palette, Shapes, Vibrate, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HostsSection } from '~/components/connections/hosts-section';
import { ListGroup, ListRow } from '~/components/list-row';
import { Glass } from '~/components/ui/glass';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
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

function SectionLabel({ title, count }: { title: string; count?: number }) {
  return (
    <View className="flex-row items-center gap-2 pb-3 pt-2">
      <Text className="text-foreground text-base font-semibold">{title}</Text>
      {typeof count === 'number' && count > 0 ? (
        <Text style={{ fontVariant: ['tabular-nums'] }} className="text-muted-foreground text-sm">
          {count}
        </Text>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [haptics, setHaptics] = React.useState(true);
  const [notifications, setNotifications] = React.useState(true);

  return (
    <SafeAreaView edges={['top']} className="bg-background flex-1">
      <View className="flex-row items-center justify-between px-5 pb-4 pt-2">
        <Text className="text-foreground text-3xl font-bold tracking-tight">Settings</Text>
        <Glass
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text className="text-foreground font-mono text-sm font-semibold">l8</Text>
        </Glass>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-5 pb-32"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <HostsSection />

        <View>
          <SectionLabel title="Preferences" />
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={Vibrate} />}
              title="Haptic feedback"
              subtitle="Vibrate on approvals and tab changes"
              trailing={<Switch checked={haptics} onCheckedChange={setHaptics} />}
            />
            <ListRow
              leading={<RowIcon icon={Bell} />}
              title="In-app notifications"
              subtitle="Banner for pending agent approvals"
              trailing={<Switch checked={notifications} onCheckedChange={setNotifications} />}
            />
            <ListRow
              leading={<RowIcon icon={Palette} />}
              title="Appearance"
              subtitle="Dark (l8git)"
              chevron
            />
          </ListGroup>
        </View>

        {__DEV__ ? (
          <View>
            <SectionLabel title="Developer" />
            <ListGroup>
              <ListRow
                leading={<RowIcon icon={Shapes} />}
                title="Component bench"
                subtitle="Every shared primitive on one screen"
                chevron
                onPress={() => router.push('/dev-components')}
              />
            </ListGroup>
          </View>
        ) : null}

        <View>
          <SectionLabel title="About" />
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={Info} />}
              title="l8git Remote"
              subtitle={`v${Constants.expoConfig?.version ?? '0.1.0'}`}
            />
          </ListGroup>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
