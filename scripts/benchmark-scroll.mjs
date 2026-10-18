import { chromium, webkit } from '@playwright/test';
import { preview } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Production renderer, real animations and 4x CPU throttling. IPC is fixture data.
const TARGETS = [
  { name: 'files', scene: 'performance', ready: page => page.getByTestId('files').getByText('file-0000.txt', { exact: true }), anchor: page => page.getByTestId('files') },
  { name: 'history', scene: 'performance-history', ready: page => page.locator('[data-commit-hash]').first(), anchor: page => page.locator('[data-commit-hash]').first() },
  // Commit inspect: 400 files, a 3000-line diff, and the history list beside them.
  { name: 'inspect-diff', scene: 'performance-inspect', open: openInspect, ready: diffLine, anchor: diffLine },
  { name: 'inspect-diff-split', scene: 'performance-inspect', sideBySide: true, open: openInspect, ready: page => page.locator('.monaco-diff-editor .view-line').first(), anchor: page => page.locator('.monaco-diff-editor').first(), wheel: true },
  { name: 'inspect-files', scene: 'performance-inspect', open: openInspect, ready: page => page.getByRole('group', { name: 'Changed files' }), anchor: page => page.getByRole('group', { name: 'Changed files' }) },
  { name: 'inspect-history', scene: 'performance-inspect', open: openInspect, ready: diffLine, anchor: page => page.locator('[data-commit-hash]').first() },
];

function diffLine(page) {
  return page.getByText('computeSomething(0,', { exact: false }).first();
}

async function openInspect(page) {
  await page.locator('[data-commit-hash]').first().click();
}

const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
};
const runs = positiveInteger('SCROLL_BENCHMARK_RUNS', 3);
const frameCount = positiveInteger('SCROLL_BENCHMARK_FRAMES', 240);
const views = process.env.SCROLL_BENCHMARK_VIEWS?.split(',') ?? TARGETS.map(target => target.name);
if (views.some(view => !TARGETS.some(target => target.name === view))) throw new Error('Unknown SCROLL_BENCHMARK_VIEWS');

const server = await preview({ configFile: resolve('vite.ui-test.config.ts'), preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
// webkit approximates the Linux app's WebKitGTK; it has no CDP, so no throttling or script metrics.
const useWebkit = process.env.SCROLL_BENCHMARK_BROWSER === 'webkit';
const browser = await (useWebkit ? webkit : chromium).launch();
const throttle = Number(process.env.SCROLL_BENCHMARK_THROTTLE ?? 4);
// 0 = sweep the whole list in 120 frames (worst case). Set px/frame for a wheel-speed scroll.
const pxPerFrame = Number(process.env.SCROLL_BENCHMARK_PX_PER_FRAME ?? 0);
const result = { scope: `${useWebkit ? 'Playwright WebKit' : 'Chromium'} production renderer, 1000 changed files and 10000 commits (inspect views: 400 files, 3000-line diff), ${frameCount} scrolling frames per view, ${runs} samples, animations enabled, ${useWebkit ? 'no CPU throttling' : `CPU throttled ${throttle}x`}, ${pxPerFrame > 0 ? pxPerFrame + ' px/frame' : 'full sweep'}; no native Tauri measurement.`, views: {} };
try {
  for (const target of TARGETS.filter(target => views.includes(target.name))) {
    const samples = [];
    for (let run = 0; run < runs; run++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const cdp = useWebkit ? null : await context.newCDPSession(page);
      await cdp?.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.SCROLL_BENCHMARK_THROTTLE ?? 4) });
      await cdp?.send('Performance.enable');
      if (target.sideBySide) await page.addInitScript(() => localStorage.setItem('l8git-commit-prefs', JSON.stringify({ state: { diffLayoutMode: 'sideBySide' }, version: 0 })));
      await page.goto(`http://127.0.0.1:4176/?scene=${target.scene}`);
      if (target.open) {
        await page.locator('[data-commit-hash]').first().waitFor();
        await target.open(page);
      }
      await target.ready(page).waitFor({ timeout: 30_000 });
      const before = await cdp?.send('Performance.getMetrics');
      const frames = await target.anchor(page).evaluate(async (root, { pxPerFrame, frameCount, wheel }) => {
        // Monaco scrolls virtually: drive it with wheel events like a trackpad.
        if (wheel) {
          const target = root.querySelector('.modified .monaco-scrollable-element') ?? root.querySelector('.monaco-scrollable-element');
          if (!target) throw new Error('Missing Monaco scroller');
          const intervals = [];
          let previous;
          await new Promise(resolve => {
            const tick = now => {
              if (previous !== undefined) intervals.push(now - previous);
              previous = now;
              const down = Math.floor(intervals.length / 120) % 2 === 0;
              target.dispatchEvent(new WheelEvent('wheel', { deltaY: (down ? 1 : -1) * (pxPerFrame || 120), deltaMode: 0, bubbles: true, cancelable: true }));
              if (intervals.length < frameCount) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          intervals.sort((a, b) => a - b);
          return { fps: 1000 / (intervals.reduce((sum, n) => sum + n, 0) / intervals.length), p95FrameMs: intervals[Math.floor(intervals.length * 0.95)], framesOver33Ms: intervals.filter(n => n > 33.4).length };
        }
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
            if (intervals.length < frameCount) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        intervals.sort((a, b) => a - b);
        return { fps: 1000 / (intervals.reduce((sum, n) => sum + n, 0) / intervals.length), p95FrameMs: intervals[Math.floor(intervals.length * 0.95)], framesOver33Ms: intervals.filter(n => n > 33.4).length };
      }, { pxPerFrame, frameCount, wheel: !!target.wheel });
      const after = await cdp?.send('Performance.getMetrics');
      const deltaMs = name => 1000 * (after.metrics.find(m => m.name === name).value - before.metrics.find(m => m.name === name).value);
      if (errors.length) throw new Error(errors.join('; '));
      samples.push(cdp ? { ...frames, scriptMs: deltaMs('ScriptDuration'), layoutMs: deltaMs('LayoutDuration'), taskMs: deltaMs('TaskDuration') } : frames);
      await context.close();
    }
    result.views[target.name] = { samples, metrics: Object.fromEntries(Object.keys(samples[0]).map(key => [key, samples.map(s => s[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]])) };
  }
  if (process.env.SCROLL_BENCHMARK_OUT) await writeFile(process.env.SCROLL_BENCHMARK_OUT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
