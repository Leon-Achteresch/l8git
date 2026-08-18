import { Stack } from 'expo-router';

import { palette } from '~/lib/theme';

export default function ReposLayout() {
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
