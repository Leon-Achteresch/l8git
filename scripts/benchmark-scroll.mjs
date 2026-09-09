import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Production renderer, real animations and 4x CPU throttling. IPC is fixture data.
const TARGETS = [
  { name: 'files', scene: 'performance', ready: page => page.getByTestId('files').getByText('file-0000.txt', { exact: true }), anchor: page => page.getByTestId('files') },
  { name: 'history', scene: 'performance-history', ready: page => page.locator('[data-commit-hash]').first(), anchor: page => page.locator('[data-commit-hash]').first() },
];

const server = await preview({ configFile: resolve('vite.ui-test.config.ts'), preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
const browser = await chromium.launch();
const throttle = Number(process.env.SCROLL_BENCHMARK_THROTTLE ?? 4);
// 0 = sweep the whole list in 120 frames (worst case). Set px/frame for a wheel-speed scroll.
const pxPerFrame = Number(process.env.SCROLL_BENCHMARK_PX_PER_FRAME ?? 0);
const result = { scope: `Chromium production renderer, 1000 changed files and 10000 commits, 240 scrolling frames per view, animations enabled, CPU throttled ${throttle}x, ${pxPerFrame > 0 ? pxPerFrame + ' px/frame' : 'full sweep'}; no native Tauri measurement.`, views: {} };
try {
  for (const target of TARGETS) {
    const samples = [];
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.SCROLL_BENCHMARK_THROTTLE ?? 4) });
      await cdp.send('Performance.enable');
      await page.goto(`http://127.0.0.1:4176/?scene=${target.scene}`);
      await target.ready(page).waitFor();
      const before = await cdp.send('Performance.getMetrics');
      const frames = await target.anchor(page).evaluate(async (root, pxPerFrame) => {
        const scrollable = node => node.scrollHeight > node.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(node).overflowY);
        let scroller = [...root.querySelectorAll('*')].find(scrollable);
        for (let node = root; !scroller && node && node !== document.body; node = node.parentElement) {
          if (scrollable(node)) scroller = node;
        }
        if (!scroller) throw new Error('Missing scrollable fixture list');
        const intervals = [];
        let previous;
        await new Promise(resolve => {
          const tick = now => {
            if (previous !== undefined) intervals.push(now - previous);
            previous = now;
            // Scroll across the full fixture and back; every frame changes rows.
            const max = scroller.scrollHeight - scroller.clientHeight;
            if (pxPerFrame > 0) {
              const span = 2 * max;
              const pos = (intervals.length * pxPerFrame) % span;
              scroller.scrollTop = pos <= max ? pos : span - pos;
            } else {
              const phase = (intervals.length % 120) / 120;
              scroller.scrollTop = max * (1 - Math.abs(phase * 2 - 1));
            }
            if (intervals.length < 240) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        intervals.sort((a, b) => a - b);
        return { fps: 1000 / (intervals.reduce((sum, n) => sum + n, 0) / intervals.length), p95FrameMs: intervals[Math.floor(intervals.length * 0.95)], framesOver33Ms: intervals.filter(n => n > 33.4).length };
      }, pxPerFrame);
      const after = await cdp.send('Performance.getMetrics');
      const deltaMs = name => 1000 * (after.metrics.find(m => m.name === name).value - before.metrics.find(m => m.name === name).value);
      if (errors.length) throw new Error(errors.join('; '));
      samples.push({ ...frames, scriptMs: deltaMs('ScriptDuration'), layoutMs: deltaMs('LayoutDuration'), taskMs: deltaMs('TaskDuration') });
      await context.close();
    }
    result.views[target.name] = { samples, metrics: Object.fromEntries(Object.keys(samples[0]).map(key => [key, samples.map(s => s[key]).sort((a, b) => a - b)[1]])) };
  }
  if (process.env.SCROLL_BENCHMARK_OUT) await writeFile(process.env.SCROLL_BENCHMARK_OUT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
