import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colorScheme } from 'nativewind';
import * as React from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PortalHost } from '@rn-primitives/portal';

import { startAgentRuntime } from '~/lib/agents/runtime';
import { startConnectionManager } from '~/lib/connections';
import { createQueryClient, useHostInvalidationBridge } from '~/lib/query';
import { navigationTheme } from '~/lib/theme';

if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  colorScheme.set('dark');
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(createQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: navigationTheme.colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navigationTheme}>
            <ConnectionBridge />
            <StatusBar style="light" />
            {children}
            <PortalHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ConnectionBridge() {
  useHostInvalidationBridge();
  React.useEffect(() => startConnectionManager(), []);
  React.useEffect(() => {
    void startAgentRuntime();
  }, []);
  return null;
}
