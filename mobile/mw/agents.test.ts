import { execSync } from 'node:child_process';
import { test } from '@mobilewright/test';
import { openRoute, shot, sleep, tapLabel, UDID, waitForApp } from './app';

test('agents + chat screenshots', async ({ screen }) => {
  execSync(`xcrun simctl terminate ${UDID} host.exp.Exponent || true`);
  await sleep(1500);
  await openRoute(screen, '/agents', 2000);
  await waitForApp(screen);
  await sleep(10000);
  shot('agents');
  const opened = await tapLabel(screen, / on l8git$/);
  console.log('opened thread:', opened);
  await sleep(7000);
  shot('agent-chat');
});
