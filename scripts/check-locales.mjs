import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const localesDir = fileURLToPath(new URL("../src/locales/", import.meta.url));
const reference = "en";

function flatten(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return [prefix];
  return entries.flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

async function readLocale(code) {
  const raw = await readFile(path.join(localesDir, `${code}.json`), "utf8");
  return JSON.parse(raw);
}

function list(keys) {
  const shown = keys.slice(0, 20);
  const rest = keys.length - shown.length;
  return shown.map((k) => `      ${k}`).join("\n") + (rest > 0 ? `\n      ... und ${rest} weitere` : "");
}

const files = (await readdir(localesDir))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

if (!files.includes(reference)) {
  console.error(`check-locales: Referenzdatei ${reference}.json fehlt in src/locales`);
  process.exit(1);
}

const referenceKeys = new Set(flatten(await readLocale(reference)));
let failed = false;

for (const code of files) {
  if (code === reference) continue;
  let keys;
  try {
    keys = new Set(flatten(await readLocale(code)));
  } catch (err) {
    console.error(`check-locales: ${code}.json ist kein gueltiges JSON: ${err.message}`);
    failed = true;
    continue;
  }
  const missing = [...referenceKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !referenceKeys.has(k));
  if (missing.length === 0 && extra.length === 0) {
    console.log(`check-locales: ${code}.json OK (${keys.size} Keys)`);
    continue;
  }
  failed = true;
  console.error(`check-locales: ${code}.json weicht von ${reference}.json ab`);
  if (missing.length > 0) {
    console.error(`  fehlende Keys (${missing.length}):\n${list(missing)}`);
  }
  if (extra.length > 0) {
    console.error(`  ueberzaehlige Keys (${extra.length}):\n${list(extra)}`);
  }
}

if (failed) process.exit(1);
console.log(`check-locales: alle ${files.length} Locale-Dateien stimmen mit ${reference}.json ueberein`);
