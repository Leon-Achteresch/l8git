import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { resolve } from 'node:path';

const server = await preview({ configFile: resolve('vite.profile.config.ts'), preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.goto(`http://127.0.0.1:4177/?scene=${process.env.PROFILE_SCENE || 'performance'}`);
const anchor = process.env.PROFILE_SCENE === 'performance-history' ? page.locator('[data-commit-hash]').first() : page.getByTestId('files');
await anchor.waitFor();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await anchor.evaluate(async (root) => {
  const ok = n => n.scrollHeight > n.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(n).overflowY);
  let scroller = [...root.querySelectorAll('*')].find(ok);
  for (let n = root; !scroller && n && n !== document.body; n = n.parentElement) if (ok(n)) scroller = n;
  let i = 0;
  await new Promise(res => {
    const tick = () => {
      const phase = (i % 120) / 120;
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * (1 - Math.abs(phase * 2 - 1));
      if (++i < 240) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
});
const { profile } = await cdp.send('Profiler.stop');
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
await browser.close();
await new Promise((r, j) => server.httpServer.close(e => e ? j(e) : r()));
