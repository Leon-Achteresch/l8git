import { AppState, type AppStateStatus } from 'react-native';

import { notifyAppSuspend } from '@desktop/lib/platform/lifecycle';

export function installAppSuspendBridge(): () => void {
  let previous: AppStateStatus = AppState.currentState;
  const subscription = AppState.addEventListener('change', (next) => {
    const leftForeground = previous === 'active' && next !== 'active';
    previous = next;
    if (leftForeground) {
      notifyAppSuspend();
    }
  });
  return () => subscription.remove();
}
