import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

// Scroll FPS + web-process memory of the ui-test fixture build in the system WebKitGTK (MiniBrowser) under Xvfb,
// once per renderer config. Build first: npx vite build --config vite.ui-test.config.ts
// The server injects scripts/fps-probe.js into index.html; the app bundles stay untouched.
// Env: FPS_RUNS (3), FPS_FRAMES (240), FPS_CONFIGS (comma list), FPS_BENCHMARK_OUT, FPS_DIST (dist-ui-test), MINIBROWSER.
const MINIBROWSER = process.env.MINIBROWSER ?? '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser';
const runs = Number(process.env.FPS_RUNS ?? 3);
const frames = Number(process.env.FPS_FRAMES ?? 240);
const CONFIGS = {
  baseline: { env: {}, args: [] },
  'dmabuf-off': { env: { WEBKIT_DISABLE_DMABUF_RENDERER: '1' }, args: [] },
  'hwaccel-never': { env: {}, args: ['--hardware-acceleration-policy=never'] },
  'skia-cpu': { env: { WEBKIT_SKIA_ENABLE_CPU_RENDERING: '1' }, args: [] },
  'dmabuf-off+skia-cpu': { env: { WEBKIT_DISABLE_DMABUF_RENDERER: '1', WEBKIT_SKIA_ENABLE_CPU_RENDERING: '1' }, args: [] },
};
const configs = process.env.FPS_CONFIGS?.split(',') ?? Object.keys(CONFIGS);
if (configs.some(config => !CONFIGS[config])) throw new Error(`FPS_CONFIGS must be from: ${Object.keys(CONFIGS).join(', ')}`);
const VIEWS = [
  { name: 'files-sweep', scene: 'performance', anchor: '[data-testid="files"]', px: 0 },
  { name: 'files-wheel', scene: 'performance', anchor: '[data-testid="files"]', px: 60 },
  { name: 'history-sweep', scene: 'performance-history', anchor: '[data-commit-hash]', px: 0 },
  { name: 'history-wheel', scene: 'performance-history', anchor: '[data-commit-hash]', px: 60 },
];

const root = resolve(process.env.FPS_DIST ?? 'dist-ui-test');
const probe = await readFile(new URL('fps-probe.js', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
let pending;
const server = createServer(async (req, res) => {
  if (req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    res.end();
    try { pending?.(JSON.parse(body)); } catch (error) { pending?.({ error: String(error) }); }
    return;
  }
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (pathname === '/__fps-probe.js') {
    res.setHeader('content-type', types['.js']);
    res.end(probe);
    return;
  }
  const path = resolve(join(root, pathname));
  const file = path.startsWith(root + sep) && extname(path) ? path : join(root, 'index.html');
  try {
    res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
    const body = await readFile(file);
    res.end(extname(file) === '.html' ? String(body).replace('</head>', '<script type="module" src="/__fps-probe.js"></script></head>') : body);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise(done => server.listen(4181, '127.0.0.1', done));

const display = ':97';
const xvfb = spawn('Xvfb', [display, '-screen', '0', '1280x860x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
xvfb.on('error', error => { console.error(`Xvfb: ${error.message}`); process.exit(1); });
await new Promise(done => setTimeout(done, 1000));

async function processTree(pid) {
  const parents = new Map();
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = await readFile(`/proc/${entry}/stat`, 'utf8');
      parents.set(Number(entry), Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]));
    } catch {}
  }
  const tree = [pid];
  for (let i = 0; i < tree.length; i++) for (const [child, parent] of parents) if (parent === tree[i]) tree.push(child);
  return tree;
}

async function memory(pid) {
  const out = {};
  for (const child of await processTree(pid)) {
    try {
      const status = await readFile(`/proc/${child}/status`, 'utf8');
      const name = status.match(/^Name:\s+(.*)$/m)[1];
      const anon = Number(status.match(/^RssAnon:\s+(\d+)/m)?.[1] ?? 0);
      out[name] = Math.round(((out[name] ?? 0) + anon / 1024) * 10) / 10;
    } catch {}
  }
  return out;
}

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const result = { scope: `System WebKitGTK MiniBrowser, Xvfb 1280x860, ui-test fixtures (1000 files / 10000 commits), ${frames} rAF frames, ${runs} runs, median. Memory = RssAnon MB after scrolling.`, configs: {} };
try {
  for (const config of configs) {
    result.configs[config] = {};
    for (const view of VIEWS) {
      const samples = [];
      for (let run = 0; run < runs; run++) {
        const url = `http://127.0.0.1:4181/?scene=${view.scene}&frames=${frames}&px=${view.px}&anchor=${encodeURIComponent(view.anchor)}`;
        const browser = spawn('dbus-run-session', ['--', MINIBROWSER, ...CONFIGS[config].args, '--geometry=1280x860', url], {
          env: { ...process.env, ...CONFIGS[config].env, DISPLAY: display }, stdio: 'ignore', detached: true,
        });
        try {
          const report = await new Promise((done, fail) => {
            pending = done;
            setTimeout(() => fail(new Error(`${config}/${view.name}: no report in 240s`)), 240_000).unref();
            browser.on('error', fail);
          });
          if (report.error) throw new Error(`${config}/${view.name}: ${report.error}`);
          samples.push({ ...report, memoryMb: await memory(browser.pid) });
        } catch (error) {
          console.error(String(error)); // one stuck launch should not void the other samples
        } finally {
          const tree = await processTree(browser.pid);
          for (const pid of tree.reverse()) try { process.kill(pid, 'SIGKILL'); } catch {}
          await new Promise(done => setTimeout(done, 500));
        }
      }
      if (!samples.length) continue;
      const metrics = Object.fromEntries(['fps', 'p50FrameMs', 'p95FrameMs', 'framesOver33Ms'].map(key => [key, Math.round(median(samples.map(s => s[key])) * 10) / 10]));
      metrics.webProcessAnonMb = median(samples.map(s => s.memoryMb.WebKitWebProces ?? null)); // /proc Name is cut to 15 chars
      result.configs[config][view.name] = { metrics, samples };
      console.log(config, view.name, JSON.stringify(metrics));
      if (process.env.FPS_BENCHMARK_OUT) await writeFile(process.env.FPS_BENCHMARK_OUT, JSON.stringify(result, null, 2) + "\n");
    }
  }
} finally {
  xvfb.kill();
  server.close();
}
