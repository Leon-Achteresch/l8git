import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Bell, Info, Palette, Shapes, Vibrate } from 'lucide-react-native';
import * as React from 'react';

import { HostsSection } from '~/components/connections/hosts-section';
import { ListGroup, ListRow } from '~/components/list-row';
import { Screen, ScreenTitle } from '~/components/screen';
import { SectionHeader } from '~/components/section-header';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';

export default function SettingsScreen() {
  const router = useRouter();
  const [haptics, setHaptics] = React.useState(true);
  const [notifications, setNotifications] = React.useState(true);

  return (
    <Screen scroll>
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
          icon={Vibrate}
          title="Haptic feedback"
          subtitle="Vibrate on approvals and tab changes"
          trailing={<Switch checked={haptics} onCheckedChange={setHaptics} />}
        />
        <ListRow
          icon={Bell}
          title="In-app notifications"
          subtitle="Banner for pending agent approvals"
          trailing={<Switch checked={notifications} onCheckedChange={setNotifications} />}
        />
        <ListRow icon={Palette} title="Appearance" subtitle="Dark (l8git)" chevron />
      </ListGroup>

      {__DEV__ ? (
        <>
          <SectionHeader title="Developer" />
          <ListGroup>
            <ListRow
              icon={Shapes}
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
          icon={Info}
          title="l8git Remote"
          subtitle={`v${Constants.expoConfig?.version ?? '0.1.0'}`}
        />
      </ListGroup>
    </Screen>
  );
}
