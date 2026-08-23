import { execSync } from 'node:child_process';
import { test } from '@mobilewright/test';
import { openRoute, shot, sleep, UDID, waitForApp } from './app';

const ROUTES = (process.env.MW_ROUTES ?? '/').split(',').filter(Boolean);

test('screenshots', async ({ screen }) => {
  execSync(`xcrun simctl terminate ${UDID} host.exp.Exponent || true`);
  await sleep(1500);
  await openRoute(screen, ROUTES[0], 2000);
  await waitForApp(screen);
  await sleep(9000);
  for (const route of ROUTES) {
    if (route !== ROUTES[0]) await openRoute(screen, route);
    shot(route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-'));
  }
});
