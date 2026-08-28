#!/usr/bin/env node
// Fuegt zusaetzliche Cargo-Binaries (z. B. l8gitd) fuer universal-apple-darwin
// zu einem Fat-Binary zusammen.
//
// Die Tauri CLI baut fuer `--target universal-apple-darwin` beide Architekturen
// einzeln und ruft `lipo` danach nur fuer das Haupt-Binary auf. Alle weiteren
// `[[bin]]`-Targets des Crates werden vom Bundler zwar in die .app kopiert,
// existieren in `target/universal-apple-darwin/release/` aber nicht - der
// Bundle-Schritt bricht dann mit "does not exist" ab.
//
// Laeuft als `build.beforeBundleCommand` und ist ausserhalb von universal-macOS
// ein No-Op.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UNIVERSAL_TARGET = 'universal-apple-darwin'
const ARCH_TARGETS = ['aarch64-apple-darwin', 'x86_64-apple-darwin']

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tauriDir = join(repoRoot, 'src-tauri')

const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE ?? ''
if (process.platform !== 'darwin' || targetTriple !== UNIVERSAL_TARGET) {
  process.exit(0)
}

const targetDir = process.env.CARGO_TARGET_DIR
  ? resolve(process.env.CARGO_TARGET_DIR)
  : join(tauriDir, 'target')
const profile = process.env.TAURI_ENV_DEBUG === 'true' ? 'debug' : 'release'

function extraBinaryNames() {
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
      cwd: tauriDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
  )

  const manifestPath = join(tauriDir, 'Cargo.toml')
  const pkg =
    metadata.packages.find((entry) => resolve(entry.manifest_path) === manifestPath) ??
    (metadata.packages.length === 1 ? metadata.packages[0] : undefined)
  if (!pkg) {
    throw new Error(`Paket fuer ${manifestPath} nicht in cargo metadata gefunden`)
  }

  // Das Haupt-Binary wird von der Tauri CLI selbst zusammengefuehrt.
  const mainBinaries = new Set([pkg.name, pkg.default_run].filter(Boolean))

  return pkg.targets
    .filter((target) => target.kind.includes('bin') && !mainBinaries.has(target.name))
    .map((target) => target.name)
}

const universalDir = join(targetDir, UNIVERSAL_TARGET, profile)
const binaries = extraBinaryNames()

if (!binaries.length) {
  process.exit(0)
}

mkdirSync(universalDir, { recursive: true })

for (const name of binaries) {
  const inputs = ARCH_TARGETS.map((target) => join(targetDir, target, profile, name))
  const missing = inputs.filter((input) => !existsSync(input))

  if (missing.length) {
    // Kann z. B. passieren, wenn ein Binary hinter `required-features` liegt,
    // die fuer diesen Build nicht aktiv sind.
    console.warn(`[lipo] ueberspringe "${name}", nicht gebaut: ${missing.join(', ')}`)
    continue
  }

  const output = join(universalDir, name)
  execFileSync('lipo', ['-create', '-output', output, ...inputs], { stdio: 'inherit' })
  console.log(`[lipo] universal binary erstellt: ${output}`)
}
