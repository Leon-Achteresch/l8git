import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

const server = await preview({ configFile: resolve('vite.profile.config.ts'), ...(process.env.PROFILE_BUILD_DIR ? { build: { outDir: resolve(process.env.PROFILE_BUILD_DIR) } } : {}), preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
const browser = await chromium.launch();
try {
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(`http://127.0.0.1:4177/?scene=${process.env.PROFILE_SCENE || 'performance'}`);
let anchor = process.env.PROFILE_SCENE === 'performance-history' ? page.locator('[data-commit-hash]').first() : page.getByTestId('files');
if (process.env.PROFILE_SCENE === 'performance-inspect') {
  // PROFILE_TARGET=files scrolls the changed-files column, anything else the history beside it.
  await page.locator('[data-commit-hash]').first().click();
  await page.getByText('computeSomething(0,', { exact: false }).first().waitFor({ timeout: 30_000 });
  anchor = process.env.PROFILE_TARGET === 'files' ? page.getByRole('group', { name: 'Changed files' }) : process.env.PROFILE_TARGET === 'diff' ? page.getByText('computeSomething(0,', { exact: false }).first() : page.locator('[data-commit-hash]').first();
}
await anchor.waitFor();
const trace = [];
if (process.env.PROFILE_TRACE_OUT) {
  cdp.on('Tracing.dataCollected', event => trace.push(...event.value));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
}
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: process.env.PROFILE_TRACE_OUT ? 1000 : 200 });
await cdp.send('Profiler.start');
await anchor.evaluate(async (root, { frameCount, pxPerFrame }) => {
  const ok = n => n.scrollHeight > n.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(n).overflowY);
  let scroller = [...root.querySelectorAll('*')].find(ok);
  for (let n = root; !scroller && n && n !== document.body; n = n.parentElement) if (ok(n)) scroller = n;
  let i = 0;
  await new Promise(res => {
    const tick = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      // PROFILE_PX_PER_FRAME scrolls at wheel speed instead of sweeping the whole list.
      if (pxPerFrame > 0) { const pos = (i * pxPerFrame) % (2 * max); scroller.scrollTop = pos <= max ? pos : 2 * max - pos; }
      else { const phase = (i % 120) / 120; scroller.scrollTop = max * (1 - Math.abs(phase * 2 - 1)); }
      if (++i < frameCount) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
}, { frameCount: Number(process.env.PROFILE_FRAMES ?? 240), pxPerFrame: Number(process.env.PROFILE_PX_PER_FRAME ?? 0) });
const { profile } = await cdp.send('Profiler.stop');
if (process.env.PROFILE_TRACE_OUT) {
  const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await completed;
  await writeFile(process.env.PROFILE_TRACE_OUT, JSON.stringify({ traceEvents: trace }));
}
if (process.env.PROFILE_OUT) await writeFile(process.env.PROFILE_OUT, JSON.stringify(profile));
const self = new Map();
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const total = profile.samples.length;
for (const id of profile.samples) {
  const n = byId.get(id);
  if (!n) continue;
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'} @ ${(f.url || '').split('/').pop()}:${f.lineNumber}`;
  self.set(key, (self.get(key) || 0) + 1);
}
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 35).map(([k, v]) => `${(100 * v / total).toFixed(1)}%  ${k}`).join('\n'));
} finally {
  await browser.close();
  await new Promise((r, j) => server.httpServer.close(e => e ? j(e) : r()));
}
