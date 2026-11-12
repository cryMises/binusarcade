import http from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rom = readFileSync(join(root, "tests/fixtures/tiny.nes"));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const raw = decodeURIComponent((req.url || "/").split("?")[0]);
  const target = normalize(join(root, raw.endsWith("/") ? "/index.html" : raw));
  if (!target.startsWith(root) || !existsSync(target) || statSync(target).isDirectory()) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
  createReadStream(target).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const origin = "https://crymises-music.centralindia.cloudapp.azure.com:8449";
const session = { tokens: { access_token: "t", token_type: "bearer", expires: 3600, refresh_token: "r", refresh_expires: 86400 }, saved_at: Date.now(), user: { id: 1, username: "pongo", role: "user" }, permissions: { is_admin: false } };
const rom_obj = {
  id: 5, name: "Tiny NES Test", platform_id: 1, platform_slug: "nes", platform_fs_slug: "nes", platform_display_name: "Nintendo Entertainment System",
  fs_name: "tiny.nes", fs_name_no_ext: "Tiny NES Test", fs_size_bytes: rom.length, path_cover_small: null,
  metadatum: {}, files: [{ id: 50, file_name: "tiny.nes", file_size_bytes: rom.length }], has_multiple_files: false, has_nested_single_file: true,
};
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "authorization,content-type" };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript((value) => { try { sessionStorage.setItem("binusarcade.session", JSON.stringify(value)); } catch {} }, session);
const page = await context.newPage();
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("requestfailed", (r) => console.log("FAILED", r.url(), r.failure()?.errorText));
await page.route(`${origin}/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  console.log("MOCK", req.method(), url.pathname);
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const j = (body) => route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (url.pathname.includes("/content/")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/octet-stream", "content-length": String(rom.length) }, body: rom });
  if (url.pathname.endsWith("/roms/5")) return j(rom_obj);
  if (url.pathname.endsWith("/platforms")) return j([{ id: 1, slug: "nes", fs_slug: "nes", name: "NES", display_name: "NES", rom_count: 1, firmware: [] }]);
  if (url.pathname.endsWith("/users/me")) return j(session.user);
  if (url.pathname.endsWith("/permissions/me")) return j({ is_admin: false });
  if (url.pathname.endsWith("/saves") || url.pathname.endsWith("/states")) return j([]);
  return j({});
});
await page.route("https://fonts.googleapis.com/**", (r) => r.abort());
await page.route("https://fonts.gstatic.com/**", (r) => r.abort());
await page.goto(`${base}#/play/5`);
await page.waitForSelector("[data-start]");
await page.screenshot({ path: join(root, "tests/screenshots/ejs-before.png") });
await page.click("[data-start]");
await page.waitForSelector(".play-stage iframe", { timeout: 15000 });
console.log("IFRAME READY");
try {
  await page.waitForSelector("text=Playing. Save and save-state sync are on.", { timeout: 45000 });
  console.log("EJS STARTED");
} catch (e) {
  console.log("NO START", e.message);
  const frame = page.frames().find((f) => f.url().includes("play-frame"));
  if (frame) console.log("FRAME TEXT", (await frame.locator("body").innerText()).slice(0, 1000));
}
await page.waitForTimeout(2000);
await page.screenshot({ path: join(root, "tests/screenshots/ejs-after.png"), fullPage: true });
await browser.close();
await new Promise((r) => server.close(r));
