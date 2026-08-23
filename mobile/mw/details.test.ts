import { execSync } from 'node:child_process';
import { test } from '@mobilewright/test';
import { findNode, openRoute, shot, sleep, UDID, waitForApp } from './app';

const HOST = 'l5DQKGC_KDyGDLj-KJ-jxg';
const REPO = '%2FUsers%2Fleon%2FRepositories%2Fl8git';
const R = `/repos/${HOST}/${REPO}`;

test('detail screenshots', async ({ screen }) => {
  execSync(`xcrun simctl terminate ${UDID} host.exp.Exponent || true`);
  await sleep(1500);
  await openRoute(screen, `${R}/pr/59`, 2000);
  await waitForApp(screen);
  await sleep(25000);
  shot('pr-detail');

  await openRoute(screen, `${R}/ci`, 25000);
  const tree = await screen.viewTree();
  const row = findNode(tree, (n) => /^Workflow run Release #57/.test(n.label ?? ''));
  if (row?.bounds) {
    await screen.tap(Math.round(row.bounds.x + 30), Math.round(row.bounds.y + row.bounds.height / 2));
    await sleep(15000);
  }
  shot('ci-run');
});
