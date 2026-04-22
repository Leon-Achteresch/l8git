import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Ungueltige Version: ${version ?? "<leer>"}`);
}

const root = process.cwd();

function writeJsonVersion(relativePath) {
  const filePath = path.join(root, relativePath);
  const file = JSON.parse(readFileSync(filePath, "utf8"));
  file.version = version;
  writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
}

writeJsonVersion("package.json");
writeJsonVersion("src-tauri/tauri.conf.json");

const cargoTomlPath = path.join(root, "src-tauri/Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const packageVersionPattern = /^version = ".*"$/m;

if (!packageVersionPattern.test(cargoToml)) {
  throw new Error("Cargo.toml enthaelt keine Paketversion.");
}

const updatedCargoToml = cargoToml.replace(
  packageVersionPattern,
  `version = "${version}"`,
);

writeFileSync(cargoTomlPath, updatedCargoToml);
