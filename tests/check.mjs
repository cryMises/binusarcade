import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const jsFiles = walk(join(root, "js")).filter((file) => file.endsWith(".js"));
const swFile = join(root, "sw.js");

for (const file of [...jsFiles, swFile]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

const config = await import(pathToFileURL(join(root, "js/config.js")));
const api = await import(pathToFileURL(join(root, "js/api.js")));

const checks = [
  ["GBA core", config.coresForPlatform("gba")[0] === "mgba"],
  ["PS alias", config.coresForPlatform("ps")[0] === "pcsx_rearmed"],
  ["NDS core", config.coresForPlatform("nds")[0] === "melonds"],
  ["Ruffle browser", config.isRufflePlatform("browser") === true],
  ["Unknown platform safe", config.coresForPlatform("mystery").length === 0],
  ["Array query repeats", api.buildUrl("/roms", { platform_ids: [1, 2] }).includes("platform_ids=1&platform_ids=2")],
  ["Empty query dropped", !api.buildUrl("/roms", { search_term: "" }).includes("search_term")],
  ["Content URL", api.romContentUrl({ id: 7, fs_name: "game.gba" }, { id: 9, file_name: "game.gba" }).includes("/api/roms/7/content/game.gba")],
  ["Stock URL", config.stockRomUrl(7).endsWith("/rom/7")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log(`\n${jsFiles.length + 1} files parsed, ${checks.length} checks passed.`);
