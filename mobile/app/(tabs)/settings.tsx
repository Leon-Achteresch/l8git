import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Bell, Info, Palette, Settings2, Shapes, Vibrate } from 'lucide-react-native';
import * as React from 'react';

import { HostsSection } from '~/components/connections/hosts-section';
import { ListGroup, ListRow } from '~/components/list-row';
import { Screen, ScreenTitle } from '~/components/screen';
import { SectionHeader } from '~/components/section-header';
import { IconBadge } from '~/components/shared/icon-badge';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Switch } from '~/components/ui/switch';
import { Text } from '~/components/ui/text';
import { palette } from '~/lib/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const [haptics, setHaptics] = React.useState(true);
  const [notifications, setNotifications] = React.useState(true);

  return (
    <Screen scroll contentClassName="pb-24">
      <ScreenTitle
        title="Settings"
        icon={Settings2}
        iconColor={palette.cat.cyan}
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
          leading={<IconBadge icon={Vibrate} color={palette.cat.purple} size="md" />}
          title="Haptic feedback"
          subtitle="Vibrate on approvals and tab changes"
          trailing={<Switch checked={haptics} onCheckedChange={setHaptics} />}
        />
        <ListRow
          leading={<IconBadge icon={Bell} color={palette.cat.coral} size="md" />}
          title="In-app notifications"
          subtitle="Banner for pending agent approvals"
          trailing={<Switch checked={notifications} onCheckedChange={setNotifications} />}
        />
        <ListRow
          leading={<IconBadge icon={Palette} color={palette.cat.pink} size="md" />}
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
              leading={<IconBadge icon={Shapes} color={palette.cat.blue} size="md" />}
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
          leading={<IconBadge icon={Info} color={palette.cat.green} size="md" />}
          title="l8git Remote"
          subtitle={`v${Constants.expoConfig?.version ?? '0.1.0'}`}
        />
      </ListGroup>
    </Screen>
  );
}
