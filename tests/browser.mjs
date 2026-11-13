import http from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const screenshots = join(root, "tests", "screenshots");
mkdirSync(screenshots, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const raw = decodeURIComponent((req.url || "/").split("?")[0]);
  const path = raw.endsWith("/") ? "/index.html" : raw;
  const target = normalize(join(root, path));
  if (!target.startsWith(root) || !existsSync(target) || statSync(target).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(target)] || "application/octet-stream" });
  createReadStream(target).pipe(res);
});

await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/`;

const games = [
  game(1, "Mario Kart: Super Circuit", "gba", "Game Boy Advance", 1, "Racing", "1", 8_388_608),
  game(2, "Pokémon Platinum", "nds", "Nintendo DS", 2, "RPG", "1", 134_217_728),
  game(3, "Super Metroid", "snes", "Super Nintendo", 3, "Action", "1", 4_194_304),
  game(4, "Sonic the Hedgehog", "genesis", "Sega Genesis", 4, "Action", "1", 1_048_576),
  game(5, "The Legend of Zelda", "nes", "Nintendo Entertainment System", 5, "Adventure", "1", 131_072),
  game(6, "A Browser Cartridge", "browser", "Browser", 6, "Puzzle", "1", 2_097_152),
];

function game(id, name, fsSlug, display, platformId, genre, playerCount, size) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    fs_name: `${name}.${fsSlug === "browser" ? "swf" : "rom"}`,
    fs_name_no_ext: name,
    fs_name_no_tags: name,
    fs_extension: fsSlug === "browser" ? "swf" : "rom",
    fs_size_bytes: size,
    platform_id: platformId,
    platform_slug: fsSlug,
    platform_fs_slug: fsSlug,
    platform_display_name: display,
    summary: `${name} is a test cartridge from the RomM shelf. It has enough words to wrap.`,
    path_cover_small: `/assets/romm/resources/covers/small/${id}.png`,
    path_cover_large: `/assets/romm/resources/covers/large/${id}.png`,
    metadatum: {
      genres: [genre],
      player_count: playerCount,
      first_release_date: 990_000_000 + id * 100,
      average_rating: 80 + id,
      regions: ["USA"],
      franchises: [],
    },
    rom_user: { last_played: id === 1 ? new Date(Date.now() - 86_400_000).toISOString() : null },
    has_multiple_files: false,
    has_nested_single_file: true,
    has_file_on_disk: true,
    is_identified: true,
    merged_screenshots: [`/assets/romm/resources/screenshots/${id}.png`],
    files: [{ id: id * 10, file_name: `${name}.rom`, file_size_bytes: size, category: "game" }],
  };
}

const platforms = [
  platform(1, "gba", "gba", "Game Boy Advance", 2),
  platform(2, "nds", "nds", "Nintendo DS", 1),
  platform(3, "snes", "snes", "Super Nintendo", 1),
  platform(4, "genesis", "genesis", "Sega Genesis", 1),
  platform(5, "nes", "nes", "Nintendo Entertainment System", 1),
  platform(6, "browser", "browser", "Browser", 1),
];

function platform(id, slug, fsSlug, name, count) {
  return {
    id,
    slug,
    fs_slug: fsSlug,
    name,
    display_name: name,
    rom_count: count,
    abbreviation: slug.toUpperCase(),
    description: `${name} shelf for the smoke test.`,
    firmware: [],
  };
}

const session = {
  tokens: {
    access_token: "test-access-token",
    token_type: "bearer",
    expires: 3600,
    refresh_token: "test-refresh-token",
    refresh_expires: 86_400,
  },
  saved_at: Date.now(),
  user: { id: 1, username: "pongo", role: "user", last_login: new Date().toISOString() },
  permissions: { is_admin: false },
};

let tokenScopes = "";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-csrftoken",
};

function send(route, body, status = 200) {
  return route.fulfill({
    status,
    headers: { ...cors, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const recorded = [];

async function mockRomm(page, { failContent = false } = {}) {
  await page.route("https://crymises-music.centralindia.cloudapp.azure.com:8449/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    recorded.push({ method: request.method(), path, query: url.searchParams.toString() });

    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }

    if (url.pathname.startsWith("/assets/")) {
      return route.fulfill({
        status: 200,
        headers: { "content-type": "image/png", ...cors },
        path: join(root, "icons", "icon-192.png"),
      });
    }

    if (/^\/roms\/\d+\/content\//.test(path)) {
      if (failContent) return route.abort("failed");
      return route.fulfill({
        status: 200,
        headers: { "content-type": "application/octet-stream", ...cors },
        body: Buffer.alloc(32),
      });
    }

    if (path === "/token") {
      tokenScopes = new URLSearchParams(request.postData() || "").get("scope") || "";
      return send(route, session.tokens);
    }
    if (path === "/users/me") return send(route, session.user);
    if (path === "/permissions/me") return send(route, session.permissions);
    if (path === "/logout") return send(route, {});
    if (path === "/platforms") return send(route, platforms);
    if (path === "/roms/filters") {
      return send(route, {
        genres: ["Racing", "RPG", "Action", "Adventure", "Puzzle"],
        franchises: [],
        collections: [],
        companies: [],
        publishers: [],
        developers: [],
        game_modes: [],
        age_ratings: [],
        player_counts: ["1", "2", "4"],
        regions: [],
        languages: [],
        tags: [],
        platforms: [1, 2, 3, 4, 5, 6],
      });
    }
    if (path === "/play-sessions") {
      if (request.method() === "POST") return send(route, {});
      return send(route, [
        {
          id: 1,
          rom_id: 1,
          start_time: new Date(Date.now() - 3_600_000).toISOString(),
          end_time: new Date(Date.now() - 1_800_000).toISOString(),
          duration_ms: 1_800_000,
        },
      ]);
    }
    if (path === "/saves" || path === "/states") return send(route, []);
    if (path === "/saves/summary") return send(route, { total_count: 0, slots: [] });

    if (path === "/roms") {
      let items = games;
      if (url.searchParams.get("last_played") === "true") items = [games[0]];
      const search = url.searchParams.get("search_term");
      if (search) items = items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));
      const platform = url.searchParams.get("platform_ids");
      if (platform) items = items.filter((item) => String(item.platform_id) === platform);
      const genre = url.searchParams.get("genres");
      if (genre) items = items.filter((item) => item.metadatum.genres.includes(genre));
      return send(route, { items, total: items.length, limit: 48, offset: 0 });
    }

    const romMatch = path.match(/^\/roms\/(\d+)$/);
    if (romMatch) {
      const rom = games.find((item) => item.id === Number(romMatch[1]));
      return rom ? send(route, rom) : send(route, { detail: "Not found" }, 404);
    }
    const filesMatch = path.match(/^\/roms\/(\d+)\/files$/);
    if (filesMatch) {
      const rom = games.find((item) => item.id === Number(filesMatch[1]));
      return send(route, rom?.files || []);
    }

    return send(route, {});
  });

  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
}

const errors = [];

async function newPage(browser, { signedIn = true, viewport = { width: 390, height: 844 }, failContent = false } = {}) {
  const context = await browser.newContext({ viewport });
  if (signedIn) {
    await context.addInitScript((value) => {
      sessionStorage.setItem("binusarcade.session", JSON.stringify(value));
    }, session);
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // The test aborts Google Fonts; failed font requests are expected.
    if (/Failed to load resource/.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  await mockRomm(page, { failContent });
  return { context, page };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok  ${message}`);
}

const browser = await chromium.launch();
try {
  /* Signed-in home */
  {
    const { context, page } = await newPage(browser);
    await page.goto(base);
    await page.waitForSelector(".continue-ticket", { timeout: 10_000 });
    assert(await page.isVisible("text=Continue playing"), "home shows Continue playing");
    assert(await page.isVisible("text=Mario Kart: Super Circuit"), "home continue ticket uses live data");
    assert((await page.locator(".shelf .cart").count()) === 6, "systems shelf renders from /platforms");
    assert((await page.locator(".game-card").count()) === 6, "recently added grid renders");
    await page.screenshot({ path: join(screenshots, "home-390-light.png"), fullPage: true });

    await page.click("[data-theme-toggle]");
    const theme = await page.getAttribute("html", "data-theme");
    assert(theme === "dark", "theme toggle switches to dark");
    await page.screenshot({ path: join(screenshots, "home-390-dark.png"), fullPage: true });

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    assert(widths.scroll <= widths.inner + 1, `home has no horizontal scroll at 390px (${widths.scroll}/${widths.inner})`);
    await context.close();
  }

  /* Library filters and search */
  {
    const { context, page } = await newPage(browser);
    await page.goto(`${base}#/library`);
    await page.waitForSelector(".game-grid .game-card", { timeout: 10_000 });
    assert((await page.locator(".game-grid .game-card").count()) === 6, "library renders all games");
    assert(await page.isVisible("text=Filters"), "library exposes filter panel");
    await page.click(".filter-panel summary");

    await page.click('button.chip-topic:has-text("Racing")');
    await page.waitForTimeout(400);
    assert(page.url().includes("genre=Racing"), "genre filter is written to the hash");
    assert((await page.locator(".game-grid .game-card").count()) === 1, "genre filter narrows the grid");

    await page.fill("#library-search", "metroid");
    await page.waitForTimeout(550);
    assert(page.url().includes("q=metroid"), "search is written to the hash");
    assert(await page.isVisible("text=No tape by that name"), "combined filters show the empty state");

    await page.screenshot({ path: join(screenshots, "library-390-empty.png"), fullPage: true });
    await context.close();
  }

  /* Detail and play views */
  {
    const { context, page } = await newPage(browser);
    await page.goto(`${base}#/game/1`);
    await page.waitForSelector(".detail-title", { timeout: 10_000 });
    assert(await page.isVisible("text=Mario Kart: Super Circuit"), "detail renders game title");
    assert(await page.isVisible("text=PLAY"), "detail shows a PLAY action");
    assert(await page.isVisible("text=Open in stock RomM"), "detail links to stock RomM");
    assert(await page.isVisible("text=Screenshots"), "detail renders screenshots");
    await page.screenshot({ path: join(screenshots, "detail-390.png"), fullPage: true });

    await page.goto(`${base}#/play/1`);
    await page.waitForSelector('[data-start]', { timeout: 10_000 });
    assert(await page.isVisible("text=START GAME"), "play page waits for an explicit start");
    assert(await page.isVisible("text=Saves on RomM"), "play page renders save shelf");

    await page.goto(`${base}#/play/2`);
    await page.waitForSelector('[data-start]', { timeout: 10_000 });
    assert(await page.isVisible("text=DS touch screen"), "NDS play page surfaces the touch limitation");
    await page.screenshot({ path: join(screenshots, "play-nds-390.png"), fullPage: true });

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    assert(widths.scroll <= widths.inner + 1, "play view has no horizontal scroll at 390px");
    await context.close();
  }

  /* A blocked cartridge download explains the failure instead of dumping the
     browser's raw TypeError. */
  {
    const { context, page } = await newPage(browser, { failContent: true });
    await page.goto(`${base}#/play/1`);
    await page.waitForSelector("[data-start]", { timeout: 10_000 });
    await page.click("[data-start]");
    await page.waitForSelector("[data-play-error] .play-warning", { timeout: 10_000 });
    const text = await page.locator("[data-play-error]").innerText();
    assert(text.includes("browser blocked the file request"), "blocked download names the CORS/network cause");
    assert(!text.includes("Failed to fetch"), "blocked download hides the raw TypeError");
    await context.close();
  }

  /* Chromium's ResizeObserver warning is routine EJS noise, not a game
     failure. Real errors must still reach the parent. */
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}play-frame.html`);
    await page.evaluate(() => {
      window.__messages = [];
      window.addEventListener("message", (event) => window.__messages.push(event.data));
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "ResizeObserver loop completed with undelivered notifications.",
        }),
      );
      window.dispatchEvent(
        new ErrorEvent("error", { message: "Wake Lock permission request denied" }),
      );
      window.dispatchEvent(new ErrorEvent("error", { message: "A real emulator failure" }));
    });
    const messages = await page.evaluate(() => window.__messages);
    assert(
      !messages.some((message) =>
        /ResizeObserver|Wake Lock/.test(String(message?.message || "")),
      ),
      "ResizeObserver and Wake Lock noise is ignored",
    );
    assert(
      messages.some((message) => String(message?.message || "").includes("A real emulator failure")),
      "real emulator errors still reach the parent",
    );
    await context.close();
  }

  /* Login flow and token-only storage */
  {
    const { context, page } = await newPage(browser, { signedIn: false });
    await page.goto(base);
    await page.waitForSelector("#login-username");
    assert(await page.isVisible("text=Back to the Hall"), "signed-out visitors get the login gate");
    await page.fill("#login-username", "pongo");
    await page.fill("#login-password", "supersecret");
    await page.click('button[type="submit"]');
    await page.waitForSelector(".continue-ticket", { timeout: 10_000 });
    const stored = await page.evaluate(() => ({
      session: sessionStorage.getItem("binusarcade.session") || "",
      local: JSON.stringify(localStorage),
    }));
    assert(stored.session.includes("test-access-token"), "signed-in session stores the token");
    assert(
      tokenScopes.includes("roms.read") && tokenScopes.includes("roms.user.write"),
      "token request asks for the scopes the app uses",
    );
    assert(!stored.session.includes("supersecret"), "password is not stored in sessionStorage");
    assert(!stored.local.includes("supersecret"), "password is not stored in localStorage");
    await page.screenshot({ path: join(screenshots, "home-390-login.png"), fullPage: true });
    await context.close();
  }

  /* 360px narrow width across the four primary views */
  {
    const { context, page } = await newPage(browser, { viewport: { width: 360, height: 800 } });
    for (const [route, selector] of [
      ["#/", ".continue-ticket"],
      ["#/library", ".game-grid .game-card"],
      ["#/game/1", ".detail-title"],
      ["#/play/1", "[data-start]"],
    ]) {
      await page.goto(`${base}${route}`);
      await page.waitForSelector(selector, { timeout: 10_000 });
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      assert(widths.scroll <= widths.inner + 1, `${route} has no horizontal scroll at 360px`);
    }
    await page.screenshot({ path: join(screenshots, "play-360.png"), fullPage: true });
    await context.close();
  }

  /* Desktop width */
  {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await page.goto(base);
    await page.waitForSelector(".continue-ticket", { timeout: 10_000 });
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    assert(widths.scroll <= widths.inner + 1, `home has no horizontal scroll at 1280px (${widths.scroll}/${widths.inner})`);
    await page.screenshot({ path: join(screenshots, "home-1280.png"), fullPage: true });
    await context.close();
  }

  if (errors.length) console.error("Browser errors:", errors);
  assert(errors.length === 0, `no browser console/page errors (${errors.length})`);
  console.log(`\nScreenshots: ${screenshots}`);
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
