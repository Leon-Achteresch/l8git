import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Bell, Info, Palette, Shapes, Vibrate, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { HostsSection } from '~/components/connections/hosts-section';
import { ListGroup, ListRow } from '~/components/list-row';
import { Screen, ScreenTitle } from '~/components/screen';
import { SectionHeader } from '~/components/section-header';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Icon } from '~/components/ui/icon';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';

function RowIcon({ icon }: { icon: LucideIcon }) {
  return (
    <View className="bg-secondary h-9 w-9 items-center justify-center rounded-xl">
      <Icon as={icon} size={18} className="text-muted-foreground" />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [haptics, setHaptics] = React.useState(true);
  const [notifications, setNotifications] = React.useState(true);

  return (
    <Screen scroll contentClassName="pb-24">
      <ScreenTitle
        title="Settings"
        subtitle="Hosts, pairing and preferences"
        right={
          <Avatar alt="l8git" className="h-9 w-9">
            <AvatarFallback>
              <Text className="font-mono text-sm">l8</Text>
            </AvatarFallback>
          </Avatar>
        }
      />

      <HostsSection />

      <SectionHeader title="Preferences" />
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

      {__DEV__ ? (
        <>
          <SectionHeader title="Developer" />
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={Shapes} />}
              title="Component bench"
              subtitle="Every shared primitive on one screen"
              chevron
              onPress={() => router.push('/dev-components')}
            />
          </ListGroup>
        </>
      ) : null}

      <SectionHeader title="About" />
      <ListGroup>
        <ListRow
          leading={<RowIcon icon={Info} />}
          title="l8git Remote"
          subtitle={`v${Constants.expoConfig?.version ?? '0.1.0'}`}
        />
      </ListGroup>
    </Screen>
  );
}
