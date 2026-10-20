import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// Native Tauri memory: release binary under its own Xvfb + D-Bus session with an isolated HOME.
// Usage: [WEBKIT_*=… JSC_*=…] node scripts/benchmark-native-memory.mjs [repoPath]
// Build first: bunx tauri build --no-bundle. PSS total is the fair cost (shared pages split across sharers).
// Under system memory pressure the kernel drops file-backed pages: compare runs on anon/USS, not RSS.
const bin = realpathSync(process.env.L8GIT_BIN ?? 'src-tauri/target/release/l8git'); // /proc/<pid>/exe is a real path
const repo = process.argv[2] && resolve(process.argv[2]);
const samplesAt = (process.env.MEMORY_SAMPLES_MS ?? '15000,60000').split(',').map(Number);
if (samplesAt.some((at, i) => !(at > 0) || at < (samplesAt[i - 1] ?? 0))) throw new Error('MEMORY_SAMPLES_MS must be ascending positive ms');
if (repo && !existsSync(`${repo}/.git`)) throw new Error(`${repo} is not a git repository`);
const output = process.env.MEMORY_BENCHMARK_OUT ?? 'test-results/native-memory.json';
const sleep = ms => new Promise(done => setTimeout(done, ms));
const home = await mkdtemp(join(tmpdir(), 'l8git-mem-'));
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: `${home}/.config`, XDG_DATA_HOME: `${home}/.local/share`, XDG_CACHE_HOME: `${home}/.cache`, XDG_STATE_HOME: `${home}/.local/state`, XDG_RUNTIME_DIR: home, NO_AT_BRIDGE: '1' };
delete env.DBUS_SESSION_BUS_ADDRESS; // never reach the user's real keyring
delete env.WAYLAND_DISPLAY;

const kb = (text, key) => Number(text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? 0);
const children = () => {
  const map = new Map();
  for (const pid of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); map.set(+pid, +stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]); } catch {}
  }
  return map;
};
const tree = root => {
  const parents = children(), out = [root];
  for (let i = 0; i < out.length; i++) for (const [pid, ppid] of parents) if (ppid === out[i]) out.push(pid);
  return out;
};
// Group smaps by mapping name so the big shared libs, anon heap and graphics buffers stand out.
const mappings = pid => {
  const groups = {};
  let name;
  for (const line of readFileSync(`/proc/${pid}/smaps`, 'utf8').split('\n')) {
    const head = line.match(/^([0-9a-f]+)-([0-9a-f]+) \S+ \S+ \S+ \S+\s*(.*)$/);
    // Split anon by mapping size: small = malloc/stacks, large = allocator arenas (libpas, Mesa, GLib slices).
    const mb = head && (parseInt(head[2], 16) - parseInt(head[1], 16)) / 2 ** 20;
    if (head) { name = head[3] ? head[3].replace(/^.*\/(?=[^/]+$)/, '').replace(/ \(deleted\)$/, '') : mb < 1 ? '[anon <1M]' : mb <= 64 ? '[anon 1-64M]' : '[anon >64M]'; continue; }
    const pss = line.match(/^Pss:\s+(\d+)/);
    if (pss) groups[name] = (groups[name] ?? 0) + +pss[1];
  }
  return Object.fromEntries(Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 12).filter(([, v]) => v >= 512));
};
const measure = root => tree(root).flatMap(pid => {
  try {
    const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const threads = {};
    for (const tid of readdirSync(`/proc/${pid}/task`)) {
      const comm = readFileSync(`/proc/${pid}/task/${tid}/comm`, 'utf8').trim().replace(/\d+$/, '#');
      threads[comm] = (threads[comm] ?? 0) + 1;
    }
    return [{
      pid, name: readFileSync(`/proc/${pid}/comm`, 'utf8').trim(), exe: readlinkSync(`/proc/${pid}/exe`).replace(/^.*\//, ''),
      rssKb: kb(rollup, 'Rss'), pssKb: kb(rollup, 'Pss'), ussKb: kb(rollup, 'Private_Clean') + kb(rollup, 'Private_Dirty'),
      pssAnonKb: kb(rollup, 'Pss_Anon'), pssFileKb: kb(rollup, 'Pss_File'), pssShmemKb: kb(rollup, 'Pss_Shmem'), swapKb: kb(rollup, 'Swap'),
      threads: kb(status, 'Threads'), threadNames: threads, topPssKb: mappings(pid),
    }];
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ESRCH') return []; // exited between listing and reading
    throw error; // unreadable process would silently shrink the totals
  }
});
const total = processes => Object.fromEntries(['rssKb', 'pssKb', 'ussKb', 'swapKb'].map(key => [key, processes.reduce((sum, p) => sum + p[key], 0)]));

let app, xvfb, display;
const launch = () => {
  const child = spawn('dbus-run-session', ['--', bin], { env: { ...env, DISPLAY: display }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  child.stderr.on('data', data => process.env.MEMORY_VERBOSE && process.stderr.write(data));
  return child;
};
const stop = async child => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
const appPid = child => tree(child.pid).find(pid => { try { return readlinkSync(`/proc/${pid}/exe`) === bin; } catch { return false; } });
process.once('SIGINT', () => { try { process.kill(-app?.pid, 'SIGKILL'); } catch {} xvfb?.kill(); process.exit(130); });

try {
  xvfb = spawn('Xvfb', ['-displayfd', '1', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'pipe', 'ignore'] });
  display = await new Promise((done, fail) => {
    xvfb.once('error', fail).once('exit', code => fail(new Error(`Xvfb exited (${code})`)));
    xvfb.stdout.once('data', data => done(`:${String(data).trim()}`));
  });
  if (repo) {
    // Repos live in WebKit localStorage (wry sets a custom data dir, so WebKit uses the legacy per-origin file).
    const dir = `${env.XDG_DATA_HOME}/com.leon.l8git/localstorage`;
    await mkdir(dir, { recursive: true });
    const items = { 'l8git-repo': { state: { paths: [repo], activePath: repo, customFavicons: {} }, version: 0 }, 'l8git-onboarding-prefs': { state: { welcomeDismissed: true, tourDone: true }, version: 0 } };
    execFileSync('python3', ['-I', '-c', `import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1])
c.execute('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL ON CONFLICT FAIL)')
for k,v in json.loads(sys.argv[2]).items(): c.execute('INSERT INTO ItemTable VALUES (?,?)',(k,json.dumps(v,separators=(',',':')).encode('utf-16-le')))
c.commit()`, `${dir}/tauri_localhost_0.localstorage`, JSON.stringify(items)]);
  }
  app = launch();
  const started = Date.now();
  const samples = [];
  // shortcut: fixed sample times, no "UI ready" signal; on very slow machines raise MEMORY_SAMPLES_MS.
  for (const at of samplesAt) {
    await sleep(at - (Date.now() - started));
    const root = appPid(app);
    if (!root) throw new Error('l8git exited; rerun with MEMORY_VERBOSE=1');
    const processes = measure(root);
    const sum = total(processes);
    samples.push({ atMs: at, total: sum, processes });
    console.log(`${at / 1000}s  PSS ${(sum.pssKb / 1024).toFixed(1)} MB  RSS ${(sum.rssKb / 1024).toFixed(1)} MB  ` + processes.map(p => `${p.name}:${(p.pssKb / 1024).toFixed(1)}`).join(' '));
  }
  await stop(app);
  app = null;
  const knobs = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(WEBKIT_|JSC_|GDK_|LIBGL_|GSK_|MALLOC_|Malloc|L8GIT_)/.test(key)));
  const pressure = readFileSync('/proc/pressure/memory', 'utf8').split('\n')[0];
  const result = { scope: 'Release l8git under Xvfb (no GPU: Mesa software GL), isolated HOME and D-Bus session. KB from /proc/<pid>/smaps_rollup; USS = private clean+dirty.', repo: repo ?? null, knobs, pressure, samples };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
} finally {
  if (app) await stop(app);
  xvfb?.removeAllListeners('exit').kill();
  xvfb?.stdout.destroy();
  xvfb?.unref();
  if (!process.env.MEMORY_KEEP_HOME) await rm(home, { recursive: true, force: true });
}
