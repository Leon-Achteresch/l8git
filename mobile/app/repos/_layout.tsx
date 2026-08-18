import { Stack } from 'expo-router';

import { palette } from '~/lib/theme';

export default function RepoDetailStackLayout() {
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
