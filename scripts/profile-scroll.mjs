import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { driveTarget, openTarget, TARGETS } from './benchmark-targets.mjs';

// PROFILE_ORIGIN profiles a running dev server instead (source file:line, but React dev build).
const origin = process.env.PROFILE_ORIGIN ?? 'http://127.0.0.1:4177';
const server = process.env.PROFILE_ORIGIN ? null : await preview({ configFile: resolve('vite.profile.config.ts'), ...(process.env.PROFILE_BUILD_DIR ? { build: { outDir: resolve(process.env.PROFILE_BUILD_DIR) } } : {}), preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
const browser = await chromium.launch();
try {
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PROFILE_THROTTLE ?? 4) });
// PROFILE_VIEW is a benchmark-targets.mjs name; PROFILE_SCENE/PROFILE_TARGET are the older spelling.
const legacy = { performance: 'files', 'performance-history': 'history', 'performance-inspect': { files: 'inspect-files', diff: 'inspect-diff' }[process.env.PROFILE_TARGET] ?? 'inspect-history' };
const target = TARGETS.find(t => t.name === (process.env.PROFILE_VIEW ?? legacy[process.env.PROFILE_SCENE || 'performance']));
if (!target) throw new Error('Unknown PROFILE_VIEW');
await openTarget(page, target, origin);
const trace = [];
if (process.env.PROFILE_TRACE_OUT) {
  cdp.on('Tracing.dataCollected', event => trace.push(...event.value));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
}
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: process.env.PROFILE_TRACE_OUT ? 1000 : 200 });
await cdp.send('Profiler.start');
await driveTarget(page, target, { frameCount: Number(process.env.PROFILE_FRAMES ?? 240), pxPerFrame: Number(process.env.PROFILE_PX_PER_FRAME ?? 0) });
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
  if (server) await new Promise((r, j) => server.httpServer.close(e => e ? j(e) : r()));
}
