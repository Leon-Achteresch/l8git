import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(projectRoot, '..');

const source = path.join(projectRoot, 'node_modules', 'tailwindcss');
const nativewindDir = path.join(repoRoot, 'node_modules', 'nativewind');
const target = path.join(nativewindDir, 'node_modules', 'tailwindcss');

function readVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

if (!fs.existsSync(nativewindDir)) {
  process.exit(0);
}

const hoisted = readVersion(path.join(repoRoot, 'node_modules', 'tailwindcss'));
if (hoisted && hoisted.startsWith('3.')) {
  process.exit(0);
}

const local = readVersion(source);
if (!local || !local.startsWith('3.')) {
  console.error(
    `[l8git/mobile] expected tailwindcss v3 in mobile/node_modules, found ${local ?? 'nothing'}`
  );
  process.exit(1);
}

if (readVersion(target)?.startsWith('3.')) {
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.symlinkSync(source, target, 'dir');
