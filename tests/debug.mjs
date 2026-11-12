import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
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

const session = { tokens: { access_token: "t", token_type: "bearer", expires: 3600, refresh_token: "r", refresh_expires: 86400 }, saved_at: Date.now(), user: { id: 1, username: "pongo", role: "user" }, permissions: { is_admin: false } };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript((value) => { try { sessionStorage.setItem("binusarcade.session", JSON.stringify(value)); } catch (e) { console.error("seed fail", e.message); } }, session);
const page = await context.newPage();
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR", e.stack || e.message));
page.on("requestfailed", (r) => console.log("FAILED", r.url(), r.failure()?.errorText));
page.on("response", (r) => { if (r.url().includes("centralindia")) console.log("RESP", r.status(), r.url()); });
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "authorization,content-type" };
await page.route("https://crymises-music.centralindia.cloudapp.azure.com:8449/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  console.log("MOCK", req.method(), url.pathname, url.search);
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (url.pathname.startsWith("/assets/")) return route.fulfill({ status: 200, path: join(root, "icons", "icon-192.png"), headers: { "content-type": "image/png" } });
  if (url.pathname.endsWith("/platforms")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify([{ id: 1, slug: "gba", fs_slug: "gba", name: "GBA", display_name: "GBA", rom_count: 1 }]) });
  if (url.pathname.endsWith("/users/me")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(session.user) });
  if (url.pathname.endsWith("/permissions/me")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ is_admin: false }) });
  if (/\/roms\/1$/.test(url.pathname)) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ id: 1, name: "Test Game", platform_id: 1, platform_slug: "gba", platform_fs_slug: "gba", platform_display_name: "GBA", fs_name_no_ext: "Test Game", fs_name: "Test Game.gba", fs_size_bytes: 100, path_cover_small: null, metadatum: {}, files: [{ id: 10, file_name: "Test Game.gba", file_size_bytes: 100 }] }) });
  if (url.pathname.endsWith("/roms")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ items: [{ id: 1, name: "Test Game", platform_id: 1, platform_slug: "gba", platform_fs_slug: "gba", platform_display_name: "GBA", fs_name_no_ext: "Test Game", path_cover_small: null, metadatum: {} }], total: 1 }) });
  if (url.pathname.endsWith("/saves") || url.pathname.endsWith("/states")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "[]" });
  if (url.pathname.endsWith("/play-sessions")) return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "[]" });
  return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "{}" });
});
await page.goto(base + "#/play/1");
await page.waitForTimeout(5000);
await page.click("[data-theme-toggle]");
console.log("THEME", await page.getAttribute("html", "data-theme"), await page.evaluate(() => localStorage.getItem("binusarcade.theme")));
console.log("URL", page.url());
console.log("TEXT", (await page.locator("body").innerText()).slice(0, 1200));
console.log("HTML", (await page.content()).slice(0, 800));
await page.screenshot({ path: join(root, "tests", "debug.png"), fullPage: true });
await browser.close();
await new Promise((r) => server.close(r));
