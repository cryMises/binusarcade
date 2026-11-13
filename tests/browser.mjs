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

async function mockRomm(page, { failContent = false, userRole = "user", inviteOptions = null } = {}) {
  const state = inviteOptions || {
    mintCount: 0,
    users: [
      { id: 1, username: "pongo", role: userRole },
    ],
    failMintStatus: 0,
    rejectAdminScopes: false,
  };

  await page.route("https://crymises-music.centralindia.cloudapp.azure.com:8449/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    recorded.push({ method: request.method(), path, query: url.searchParams.toString() });

    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }

    if (url.pathname.startsWith("/assets/")) {
      const wide = url.pathname.includes("/3.png");
      const w = wide ? 400 : 240;
      const h = wide ? 200 : 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${wide ? "#6043C8" : "#371F69"}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-size="22">${w}x${h}</text></svg>`;
      return route.fulfill({
        status: 200,
        headers: { "content-type": "image/svg+xml", ...cors },
        body: svg,
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
      const params = new URLSearchParams(request.postData() || "");
      tokenScopes = params.get("scope") || "";
      if (params.get("username") === "pending") {
        return send(route, { detail: "Insufficient scope" }, 403);
      }
      if (state.rejectAdminScopes && /\busers\.(read|write)\b/.test(tokenScopes)) {
        return send(route, { detail: "Insufficient scope" }, 403);
      }
      return send(route, session.tokens);
    }
    if (path === "/users/register") {
      const payload = JSON.parse(request.postData() || "{}");
      if (payload.username === "badinvite") {
        return send(route, { detail: [{ msg: "Invite token expired" }] }, 422);
      }
      return send(route, { id: 2, username: payload.username, email: payload.email, enabled: true }, 201);
    }
    if (path === "/users/invite-link" && request.method() === "POST") {
      if (state.failMintStatus) {
        return send(route, { detail: "Insufficient scope" }, state.failMintStatus);
      }
      state.mintCount += 1;
      return send(route, { token: `invite-token-${state.mintCount}`, url: null }, 201);
    }
    if (path === "/users") return send(route, state.users);
    if (path === "/users/me") return send(route, { ...session.user, role: userRole });
    if (path === "/permissions/me") return send(route, { is_admin: userRole === "admin" });
    if (path === "/logout") return send(route, {});
    if (path === "/platforms") return send(route, platforms);
    if (path === "/stats") {
      return send(route, {
        PLATFORMS: 6,
        ROMS: 12,
        SAVES: 2,
        STATES: 3,
        SCREENSHOTS: 6,
        TOTAL_FILESIZE_BYTES: 150_073_344,
        METADATA_COVERAGE: {
          igdb: [
            { source: "Matched", matched: 10 },
            { source: "Unmatched", matched: 2 },
          ],
        },
        REGION_BREAKDOWN: {
          regions: [
            { region: "USA", count: 8 },
            { region: "Japan", count: 4 },
          ],
        },
      });
    }
    if (path === "/activity") {
      return send(route, [
        {
          user_id: 1,
          username: "pongo",
          rom_id: 1,
          rom_name: "Mario Kart: Super Circuit",
          platform_slug: "gba",
          platform_name: "Game Boy Advance",
          started_at: new Date(Date.now() - 600_000).toISOString(),
        },
      ]);
    }
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
    if (path === "/saves") {
      if (url.searchParams.get("rom_id")) return send(route, []);
      return send(route, [
        { id: 1, rom_id: 1, slot: "Slot 1", file_name: "mk.sav", file_size_bytes: 32768 },
        { id: 2, rom_id: 2, slot: "Default", file_name: "plat.sav", file_size_bytes: 65536 },
      ]);
    }
    if (path === "/states") return send(route, []);
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

async function newPage(
  browser,
  {
    signedIn = true,
    viewport = { width: 390, height: 844 },
    failContent = false,
    userRole = "user",
    inviteOptions = null,
    installClock = false,
  } = {},
) {
  const context = await browser.newContext({ viewport });
  if (signedIn) {
    const seeded = {
      ...session,
      user: { ...session.user, role: userRole },
      permissions: { is_admin: userRole === "admin" },
    };
    await context.addInitScript((value) => {
      sessionStorage.setItem("binusarcade.session", JSON.stringify(value));
    }, seeded);
  }
  const page = await context.newPage();
  if (installClock) {
    await page.clock.install();
  }
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // The test aborts Google Fonts; failed font requests are expected.
    if (/Failed to load resource/.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  await mockRomm(page, { failContent, userRole, inviteOptions });
  return { context, page };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok  ${message}`);
}

const browser = await chromium.launch();
try {
  /* Signed-in home (stats-only, no play affordances) */
  {
    const { context, page } = await newPage(browser);
    await page.goto(base);
    await page.waitForSelector(".stat-card", { timeout: 10_000 });
    assert(await page.isVisible("text=Library stats"), "home shows Library stats");
    assert((await page.locator(".stat-card").count()) === 6, "home renders 6 stat cards from /stats");
    assert((await page.locator(".system-row").count()) === 6, "systems breakdown renders from /platforms");
    assert(await page.isVisible("text=2 saves across 2 slots"), "home summarizes saves from /saves");
    assert(await page.isVisible("text=pongo started Mario Kart: Super Circuit"), "home renders activity feed");
    assert((await page.locator(".game-card").count()) === 6, "recently added grid renders detail cards");
    assert((await page.locator('a[href^="#/play/"]').count()) === 0, "home has zero links to play view");
    assert((await page.locator('button:has-text("Play"), a:has-text("Play")').count()) === 0, "home has no play buttons");
    await page.screenshot({ path: join(screenshots, "home-390-light.png"), fullPage: true });

    await page.click("[data-theme-toggle]");
    const theme = await page.getAttribute("html", "data-theme");
    assert(theme === "dark", "theme toggle switches to dark");
    await page.waitForTimeout(200);
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
    assert(await page.isVisible("text=No games matched"), "combined filters show the empty state");

    await page.screenshot({ path: join(screenshots, "library-390-empty.png"), fullPage: true });
    await context.close();
  }

  /* Detail and play views */
  {
    const { context, page } = await newPage(browser);
    await page.goto(`${base}#/game/1`);
    await page.waitForSelector(".detail-title", { timeout: 10_000 });
    assert(await page.isVisible("text=Mario Kart: Super Circuit"), "detail renders game title");
    assert((await page.locator('a[href^="#/play/"]').count()) === 0, "detail has no play link");
    assert(await page.isVisible("text=Open in stock RomM"), "detail links to stock RomM");
    assert(await page.isVisible("text=Screenshots"), "detail renders screenshots");
    await page.screenshot({ path: join(screenshots, "detail-390.png"), fullPage: true });

    await page.goto(`${base}#/play/1`);
    await page.waitForSelector("text=Page not found", { timeout: 10_000 });
    assert(await page.isVisible("text=Back to Home"), "removed /play route falls back cleanly");
    assert((await page.locator("iframe").count()) === 0, "play route does not mount an emulator");

    await context.close();
  }

  /* Login flow and token-only storage */
  {
    const { context, page } = await newPage(browser, { signedIn: false });
    await page.goto(base);
    await page.waitForSelector("#login-username");
    assert(await page.isVisible("text=Create account"), "login links to invite registration");
    await page.fill("#login-username", "pongo");
    await page.fill("#login-password", "supersecret");
    await page.click('button[type="submit"]');
    await page.waitForSelector(".stat-card", { timeout: 10_000 });
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

  /* Invite registration flow: token prefill, 422 verbatim, 403 activation wait, 201 auto-login */
  {
    const { context, page } = await newPage(browser, { signedIn: false });
    await page.goto(`${base}?token=invite-123#/register`);
    await page.waitForSelector("#register-username");
    assert((await page.inputValue("#register-token")) === "invite-123", "register prefills ?token= from URL");
    await page.screenshot({ path: join(screenshots, "register-390.png"), fullPage: true });

    await page.fill("#register-username", "badinvite");
    await page.fill("#register-email", "bad@example.com");
    await page.fill("#register-password", "pass12345");
    await page.fill("#register-confirm", "pass12345");
    await page.click('button[type="submit"]');
    await page.waitForSelector(".login-error", { timeout: 10_000 });
    assert(await page.isVisible("text=Invite token expired"), "register shows 422 server validation verbatim");

    await page.fill("#register-username", "pending");
    await page.click('button[type="submit"]');
    await page.waitForSelector(".register-waiting", { timeout: 10_000 });
    assert(await page.isVisible("text=Waiting for activation"), "register handles 403 deny-by-default activation");
    await context.close();
  }

  /* Register without ?token= via Login link + valid 201 auto-login with ?token= */
  {
    const { context, page } = await newPage(browser, { signedIn: false });
    await page.goto(base);
    await page.waitForSelector(".login-register-link", { timeout: 10_000 });
    await page.click(".login-register-link");
    await page.waitForSelector("#register-username", { timeout: 10_000 });
    assert((await page.inputValue("#register-token")) === "", "register token starts empty without ?token=");
    assert(await page.isVisible("text=Registration is invite-only"), "register without token explains invite requirement");

    await page.goto(`${base}?token=invite-456`);
    await page.waitForSelector("#register-username", { timeout: 10_000 });
    assert((await page.inputValue("#register-token")) === "invite-456", "?token= opens register automatically");
    await page.fill("#register-username", "newplayer");
    await page.fill("#register-email", "new@example.com");
    await page.fill("#register-password", "pass12345");
    await page.fill("#register-confirm", "pass12345");
    await page.click('button[type="submit"]');
    await page.waitForSelector(".stat-card", { timeout: 10_000 });
    assert(await page.isVisible("text=Library stats"), "register auto-logins and lands on Home");
    await context.close();
  }

  /* Non-admin scope fallback on login + non-admin cannot see or open Signup QR */
  {
    const inviteOptions = {
      mintCount: 0,
      users: [{ id: 1, username: "pongo", role: "user" }],
      failMintStatus: 0,
      rejectAdminScopes: true,
    };
    const { context, page } = await newPage(browser, { signedIn: false, userRole: "user", inviteOptions });
    await page.goto(base);
    await page.waitForSelector("#login-username", { timeout: 10_000 });
    await page.fill("#login-username", "pongo");
    await page.fill("#login-password", "supersecret");
    await page.click('button[type="submit"]');
    await page.waitForSelector(".stat-card", { timeout: 10_000 });
    assert(
      tokenScopes.includes("roms.read") && tokenScopes.includes("roms.user.write") && !tokenScopes.includes("users.write"),
      "non-admin login falls back cleanly without admin user scopes",
    );

    const beforeCount = recorded.length;
    await page.goto(`${base}#/me`);
    await page.waitForSelector(".profile-list", { timeout: 10_000 });
    assert((await page.locator("[data-signup-switch]").count()) === 0, "non-admin does not see signup QR switch");

    await page.goto(`${base}#/signup`);
    await page.waitForSelector("text=Admin access required", { timeout: 10_000 });
    const signupCalls = recorded
      .slice(beforeCount)
      .filter((item) => item.path === "/users/invite-link" || item.path === "/users");
    assert(signupCalls.length === 0, "non-admin route gate makes no invite or user calls");
    await context.close();
  }

  /* Admin Signup QR switch, auto-refresh on new user + expiry, cleanup, and 403 handling */
  {
    const inviteOptions = {
      mintCount: 0,
      users: [{ id: 1, username: "pongo", role: "admin" }],
      failMintStatus: 0,
      rejectAdminScopes: false,
    };
    const { context, page } = await newPage(browser, {
      userRole: "admin",
      inviteOptions,
      installClock: true,
    });
    const beforeOpen = recorded.length;
    await page.goto(`${base}#/me`);
    await page.waitForSelector("[data-signup-switch]", { timeout: 10_000 });
    assert(
      (await page.getAttribute("[data-signup-switch]", "aria-checked")) === "false",
      "signup QR switch defaults to OFF",
    );
    assert(
      recorded.slice(beforeOpen).filter((item) => item.path === "/users/invite-link" || item.path === "/users").length === 0,
      "no invite or user calls happen while switch is OFF",
    );

    await page.click("[data-signup-switch]");
    await page.waitForSelector("[data-signup-qr] svg", { timeout: 10_000 });
    const firstLink = await page.inputValue("[data-signup-link]");
    assert(
      firstLink === "https://crymises.github.io/binusarcade/?token=invite-token-1#/register",
      "signup QR encodes configured app URL + token + #/register",
    );
    assert((await page.locator("[data-signup-timer]").innerText()).trim() === "60:00", "expiry countdown starts at 60:00");
    assert(await page.isVisible("[data-new-invite]"), "new invite button is shown");
    assert(await page.isVisible("text=Single-use player invite"), "security notice is shown");

    const qrBg = await page.evaluate(() => getComputedStyle(document.querySelector(".signup-qr-card")).backgroundColor);
    assert(qrBg === "rgb(255, 255, 255)", "QR card stays white for scanner contrast");
    await page.screenshot({ path: join(screenshots, "signup-qr-390.png"), fullPage: true });

    /* New user detected on 10s poll triggers fresh invite */
    inviteOptions.users.push({ id: 2, username: "friend", role: "user" });
    await page.clock.fastForward(10_500);
    await page.waitForFunction(
      () => document.querySelector("[data-signup-link]")?.value.includes("invite-token-2"),
      { timeout: 10_000 },
    );
    assert(
      (await page.inputValue("[data-signup-link]")).includes("invite-token-2"),
      "new user on 10s poll automatically refreshes the invite QR",
    );

    /* Countdown expiry triggers fresh invite */
    await page.clock.fastForward(3_600_000);
    await page.waitForFunction(
      () => document.querySelector("[data-signup-link]")?.value.includes("invite-token-3"),
      { timeout: 10_000 },
    );
    assert(
      (await page.inputValue("[data-signup-link]")).includes("invite-token-3"),
      "expiry automatically mints a fresh invite",
    );

    /* Toggling switch OFF stops polling and timers */
    await page.click("[data-signup-switch]");
    assert((await page.getAttribute("[data-signup-switch]", "aria-checked")) === "false", "switch toggles back OFF");
    const afterClose = recorded.length;
    await page.clock.fastForward(25_000);
    assert(
      recorded.slice(afterClose).filter((item) => item.path === "/users" || item.path === "/users/invite-link").length === 0,
      "closing signup switch stops all polling and timers",
    );

    /* Mint 403 surfaces missing users.write scope plainly */
    inviteOptions.failMintStatus = 403;
    await page.goto(`${base}#/signup`);
    await page.waitForSelector("[data-signup-error] .signup-error", { timeout: 10_000 });
    assert(
      (await page.locator("[data-signup-error]").innerText()).includes("users.write"),
      "mint 403 surfaces missing users.write scope plainly",
    );
    await context.close();
  }

  /* 360px narrow width across the primary views */
  {
    const { context, page } = await newPage(browser, { viewport: { width: 360, height: 800 } });
    for (const [route, selector] of [
      ["#/", ".stat-card"],
      ["#/library", ".game-grid .game-card"],
      ["#/game/1", ".detail-title"],
    ]) {
      await page.goto(`${base}${route}`);
      await page.waitForSelector(selector, { timeout: 10_000 });
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      assert(widths.scroll <= widths.inner + 1, `${route} has no horizontal scroll at 360px`);
    }
    await context.close();
  }

  /* Desktop width & dynamic showcase grid (max 3 per row, wide 2 per row, cover fits image aspect) */
  {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await page.goto(`${base}#/library`);
    await page.waitForSelector(".game-card.is-wide", { timeout: 10_000 });
    const showcase = await page.evaluate(() => {
      const grid = document.querySelector(".game-grid");
      const portrait = document.querySelector('.game-card[href="#/game/1"] .game-cover img');
      const wide = document.querySelector('.game-card[href="#/game/3"] .game-cover img');
      const pRect = portrait.getBoundingClientRect();
      const wRect = wide.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      return {
        portraitRatio: pRect.width / pRect.height,
        wideRatio: wRect.width / wRect.height,
        portraitWidthFrac: pRect.width / gridRect.width,
        wideWidthFrac: wRect.width / gridRect.width,
      };
    });
    assert(showcase.portraitRatio < 0.8, "portrait cover fits portrait image size");
    assert(showcase.wideRatio > 1.8, "wide cover fits wide image size");
    assert(showcase.portraitWidthFrac > 0.3 && showcase.portraitWidthFrac < 0.35, "portrait showcase is max 3 per row");
    assert(showcase.wideWidthFrac > 0.45 && showcase.wideWidthFrac < 0.52, "wide showcase is 2 per row");
    await page.screenshot({ path: join(screenshots, "library-1280.png"), fullPage: true });

    await page.goto(base);
    await page.waitForSelector(".stat-card", { timeout: 10_000 });
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    assert(widths.scroll <= widths.inner + 1, `home has no horizontal scroll at 1280px (${widths.scroll}/${widths.inner})`);
    assert(!(await page.isVisible(".bottom-nav")), "bottom nav is hidden on desktop");
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
