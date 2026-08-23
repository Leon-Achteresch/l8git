#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `update-packaging - patcht Version und sha256 in die Paketmanifeste unter packaging/

Verwendung:
  node scripts/update-packaging.mjs --release <datei|-> [optionen]

Release-JSON besorgen (eines von beiden):
  gh api repos/Leon-Achteresch/l8git/releases/latest > release.json
  gh release view v0.5.3 --repo Leon-Achteresch/l8git --json tagName,publishedAt,assets > release.json

Optionen:
  --release <pfad|->      GitHub-Release-JSON, "-" liest von stdin
  --artifacts <ordner>    Ordner mit heruntergeladenen Artefakten; sha256 wird lokal berechnet
  --checksums <datei>     Datei mit "<sha256>  <dateiname>" Zeilen
  --version <x.y.z>       ueberschreibt die Version aus dem Release-Tag
  --dry-run               zeigt nur, was sich aendern wuerde
  --help                  diese Hilfe

sha256-Quellen werden in dieser Reihenfolge benutzt:
  1. Feld "digest" des Assets im Release-JSON (Format "sha256:<hex>")
  2. --checksums
  3. --artifacts (lokal berechnet)
Fehlt fuer ein Artefakt ein Hash, bleibt der bisherige Wert stehen und es gibt eine Warnung.
`;

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--release") args.release = argv[++i];
    else if (arg === "--artifacts") args.artifacts = argv[++i];
    else if (arg === "--checksums") args.checksums = argv[++i];
    else if (arg === "--version") args.version = argv[++i];
    else throw new Error(`Unbekannte Option: ${arg}`);
  }
  return args;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    throw new Error("Konnte nichts von stdin lesen.");
  }
}

function loadRelease(source) {
  const raw = source === "-" ? readStdin() : readFileSync(source, "utf8");
  const json = JSON.parse(raw);
  const tag = json.tag_name ?? json.tagName ?? "";
  const assets = (json.assets ?? []).map((asset) => ({
    name: asset.name ?? "",
    url: asset.browser_download_url ?? asset.url ?? "",
    digest: typeof asset.digest === "string" ? asset.digest.replace(/^sha256:/, "") : "",
  }));
  const published = json.published_at ?? json.publishedAt ?? "";
  return { tag, assets, published };
}

function loadChecksums(source) {
  const map = new Map();
  if (!source) return map;
  for (const line of readFileSync(source, "utf8").split("\n")) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match) map.set(path.basename(match[2]), match[1].toLowerCase());
  }
  return map;
}

function hashFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function resolveAsset(assets, pattern) {
  return assets.find((asset) => pattern.test(asset.name));
}

function resolveSha(asset, checksums, artifactsDir) {
  if (!asset) return "";
  if (asset.digest) return asset.digest.toLowerCase();
  const fromFile = checksums.get(asset.name);
  if (fromFile) return fromFile;
  if (artifactsDir) {
    const local = path.join(artifactsDir, asset.name);
    if (existsSync(local)) return hashFile(local);
  }
  return "";
}

const warnings = [];

function warn(message) {
  warnings.push(message);
}

function patch(file, replacements) {
  if (!existsSync(file)) {
    warn(`Datei fehlt, uebersprungen: ${file}`);
    return null;
  }
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [pattern, value] of replacements) {
    if (value === null || value === undefined || value === "") continue;
    if (!pattern.test(after)) {
      warn(`Kein Treffer fuer ${pattern} in ${file}`);
      continue;
    }
    after = after.replace(pattern, value);
  }
  return { file, before, after };
}

function report(result, dryRun) {
  if (!result) return false;
  const rel = path.relative(repoRoot, result.file);
  if (result.before === result.after) {
    console.log(`  unveraendert  ${rel}`);
    return false;
  }
  if (dryRun) {
    console.log(`  wuerde aendern ${rel}`);
    const beforeLines = result.before.split("\n");
    const afterLines = result.after.split("\n");
    for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i += 1) {
      if (beforeLines[i] !== afterLines[i]) {
        if (beforeLines[i] !== undefined) console.log(`    - ${beforeLines[i]}`);
        if (afterLines[i] !== undefined) console.log(`    + ${afterLines[i]}`);
      }
    }
    return true;
  }
  writeFileSync(result.file, result.after);
  console.log(`  geschrieben   ${rel}`);
  return true;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const packagingDir = path.join(repoRoot, "packaging");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.release && !args.version)) {
    console.log(HELP);
    return;
  }

  const release = args.release ? loadRelease(args.release) : { tag: "", assets: [], published: "" };
  const version = args.version ?? release.tag.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Ungueltige Version: ${version || "<leer>"}`);
  }

  const checksums = loadChecksums(args.checksums);
  const dmg = resolveAsset(release.assets, /\.dmg$/i);
  const msi = resolveAsset(release.assets, /\.msi$/i);
  const deb = resolveAsset(release.assets, /\.deb$/i);

  const dmgSha = resolveSha(dmg, checksums, args.artifacts);
  const msiSha = resolveSha(msi, checksums, args.artifacts);
  const debSha = resolveSha(deb, checksums, args.artifacts);

  if (!dmg) warn("Kein .dmg im Release gefunden (Homebrew-Cask bleibt auf altem Stand).");
  if (!msi) warn("Kein .msi im Release gefunden (winget bleibt auf altem Stand).");
  if (!deb) warn("Kein .deb im Release gefunden (AUR und Flatpak bleiben auf altem Stand).");
  for (const [asset, sha, label] of [
    [dmg, dmgSha, "dmg"],
    [msi, msiSha, "msi"],
    [deb, debSha, "deb"],
  ]) {
    if (asset && !sha) warn(`Kein sha256 fuer ${label} (${asset.name}) ermittelbar.`);
  }

  const releaseDate = (release.published || "").slice(0, 10);
  const msiUrl =
    msi?.url ||
    `https://github.com/Leon-Achteresch/l8git/releases/download/v${version}/l8git_${version}_x64_en-US.msi`;
  const debUrl =
    deb?.url ||
    `https://github.com/Leon-Achteresch/l8git/releases/download/v${version}/l8git_${version}_amd64.deb`;

  console.log(`Version ${version}${release.tag ? ` (Tag ${release.tag})` : ""}`);

  const results = [
    patch(path.join(packagingDir, "homebrew", "l8git.rb"), [
      [/^(\s*version\s+")[^"]+(")/m, `$1${version}$2`],
      [/^(\s*sha256\s+")[a-fA-F0-9]{64}(")/m, dmgSha ? `$1${dmgSha}$2` : ""],
    ]),
    patch(path.join(packagingDir, "winget", "LeonAchteresch.l8git.yaml"), [
      [/^PackageVersion:.*$/m, `PackageVersion: ${version}`],
    ]),
    patch(path.join(packagingDir, "winget", "LeonAchteresch.l8git.installer.yaml"), [
      [/^PackageVersion:.*$/m, `PackageVersion: ${version}`],
      [/^(\s*)InstallerUrl:.*$/m, `$1InstallerUrl: ${msiUrl}`],
      [/^(\s*)InstallerSha256:.*$/m, msiSha ? `$1InstallerSha256: ${msiSha}` : ""],
      [/^ReleaseDate:.*$/m, releaseDate ? `ReleaseDate: ${releaseDate}` : ""],
    ]),
    patch(path.join(packagingDir, "winget", "LeonAchteresch.l8git.locale.en-US.yaml"), [
      [/^PackageVersion:.*$/m, `PackageVersion: ${version}`],
      [
        /^ReleaseNotesUrl:.*$/m,
        `ReleaseNotesUrl: https://github.com/Leon-Achteresch/l8git/releases/tag/v${version}`,
      ],
    ]),
    patch(path.join(packagingDir, "aur", "PKGBUILD"), [
      [/^pkgver=.*$/m, `pkgver=${version}`],
      [/^pkgrel=.*$/m, "pkgrel=1"],
      [/^(sha256sums=\(')[a-fA-F0-9]{64}(')/m, debSha ? `$1${debSha}$2` : ""],
    ]),
    patch(path.join(packagingDir, "aur", ".SRCINFO"), [
      [/^(\tpkgver = ).*$/m, `$1${version}`],
      [/^(\tpkgrel = ).*$/m, "$11"],
      [/^(\tprovides = l8git=).*$/m, `$1${version}`],
      [/^(\tnoextract = l8git-bin-).*(\.deb)$/m, `$1${version}$2`],
      [/^\tsource = l8git-bin-.*\.deb::.*$/m, `\tsource = l8git-bin-${version}.deb::${debUrl}`],
      [
        /^\tsource = LICENSE-.*$/m,
        `\tsource = LICENSE-${version}::https://raw.githubusercontent.com/Leon-Achteresch/l8git/v${version}/LICENSE`,
      ],
      [/^(\tsha256sums = )[a-fA-F0-9]{64}$/m, debSha ? `$1${debSha}` : ""],
    ]),
    patch(path.join(packagingDir, "flatpak", "com.leon.l8git.yml"), [
      [/^(\s*url: ).*\.deb$/m, `$1${debUrl}`],
      [/^(\s*sha256: ')[a-fA-F0-9]{64}(')/m, debSha ? `$1${debSha}$2` : ""],
    ]),
  ];

  let changed = 0;
  for (const result of results) {
    if (report(result, args.dryRun)) changed += 1;
  }

  for (const message of warnings) {
    console.warn(`Warnung: ${message}`);
  }

  console.log(
    args.dryRun
      ? `${changed} Datei(en) wuerden geaendert (dry-run, nichts geschrieben).`
      : `${changed} Datei(en) geaendert.`,
  );
  console.log(
    "Danach pruefen: LICENSE-sha256 in PKGBUILD/.SRCINFO (updpkgsums), winget ProductCode, Flatpak-Luecken.",
  );
}

try {
  main();
} catch (error) {
  console.error(`Fehler: ${error.message}`);
  process.exit(1);
}
