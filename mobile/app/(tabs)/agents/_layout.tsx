import { Stack } from 'expo-router';

import { palette } from '~/lib/theme';

export default function AgentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
