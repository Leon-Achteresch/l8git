import { chromium, webkit } from '@playwright/test';
import { preview } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { driveTarget, openTarget, TARGETS } from './benchmark-targets.mjs';

// Production renderer, real animations and 4x CPU throttling.

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
const result = { scope: `${useWebkit ? 'Playwright WebKit' : 'Chromium'} production renderer, 1000 changed files and 10000 commits (inspect views: 400 files, 3000-line diff; app views: see TARGETS), ${frameCount} scrolling frames per scroll view, ${runs} samples, animations enabled, ${useWebkit ? 'no CPU throttling' : `CPU throttled ${throttle}x`}, ${pxPerFrame > 0 ? pxPerFrame + ' px/frame' : 'full sweep'}; no native Tauri measurement.`, views: {} };
try {
  for (const target of TARGETS.filter(target => views.includes(target.name))) {
    let errors = [];
    try {
      const samples = [];
      for (let run = 0; run < runs; run++) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'no-preference' });
        const page = await context.newPage();
        errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const cdp = useWebkit ? null : await context.newCDPSession(page);
        await cdp?.send('Emulation.setCPUThrottlingRate', { rate: throttle });
        await cdp?.send('Performance.enable');
        await openTarget(page, target, 'http://127.0.0.1:4176');
        const before = await cdp?.send('Performance.getMetrics');
        // A hung view (e.g. rAF never firing) is recorded as an error instead of stalling the run.
        const intervals = await Promise.race([driveTarget(page, target, { pxPerFrame, frameCount }), new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out driving the view')), 180_000).unref())]);
        if (intervals.length < 2) throw new Error('No frames recorded');
        intervals.sort((a, b) => a - b);
        // Interactions include idle frames between steps, so maxFrameMs is their most telling number.
        const frames = { fps: 1000 / (intervals.reduce((sum, n) => sum + n, 0) / intervals.length), p95FrameMs: intervals[Math.floor(intervals.length * 0.95)], maxFrameMs: intervals.at(-1), framesOver33Ms: intervals.filter(n => n > 33.4).length };
        const after = await cdp?.send('Performance.getMetrics');
        const deltaMs = name => 1000 * (after.metrics.find(m => m.name === name).value - before.metrics.find(m => m.name === name).value);
        if (errors.length) throw new Error(errors.join('; '));
        samples.push(cdp ? { ...frames, scriptMs: deltaMs('ScriptDuration'), layoutMs: deltaMs('LayoutDuration'), taskMs: deltaMs('TaskDuration') } : frames);
        await context.close();
      }
      result.views[target.name] = { samples, metrics: Object.fromEntries(Object.keys(samples[0]).map(key => [key, samples.map(s => s[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)]])) };
    } catch (error) {
      // One broken view must not discard the others' measurements.
      result.views[target.name] = { error: [error.message.split('\n')[0], ...errors].join('; ') };
      process.exitCode = 1;
      await Promise.all(browser.contexts().map(context => context.close()));
    }
    console.error(target.name, JSON.stringify(result.views[target.name].metrics ?? result.views[target.name].error));
  }
  if (process.env.SCROLL_BENCHMARK_OUT) await writeFile(process.env.SCROLL_BENCHMARK_OUT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
