import '~/lib/register-platform';
import '~/global.css';

import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';

import { AgentToastHost } from '~/components/agents/agent-toast-host';
import { ApprovalBanner } from '~/components/agents/approval-banner';
import { Providers } from '~/components/providers';
import { ProgressToastHost } from '~/components/shared/progress-toast-host';
import { palette } from '~/lib/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  const ready = fontsLoaded || Boolean(fontError);

  React.useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <Providers>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: palette.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        <Stack.Screen name="repos" />
        <Stack.Screen name="agents" />
        <Stack.Screen name="dev-components" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
      <ProgressToastHost />
      <AgentToastHost />
      <ApprovalBanner />
    </Providers>
  );
}
