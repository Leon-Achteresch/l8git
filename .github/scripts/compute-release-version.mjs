import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [major, minor] = pkg.version.split(".");

const grepPattern = `"version": "${major}\\.${minor}\\.`;

let baseCommit = "";
try {
  baseCommit = execSync(
    `git log -1 --format=%H -- package.json -G ${JSON.stringify(grepPattern)}`,
    { encoding: "utf8" },
  ).trim();
} catch {
  baseCommit = "";
}

const patch = baseCommit
  ? execSync(`git rev-list --count ${baseCommit}..HEAD`, { encoding: "utf8" }).trim()
  : execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();

process.stdout.write(`${major}.${minor}.${patch}`);
