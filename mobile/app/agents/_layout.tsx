import { Stack } from 'expo-router';

import { palette } from '~/lib/theme';

export default function AgentDetailStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: palette.background },
      }}
    />
  );
}
