import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
const workerFile = join(root, "worker", "src", "index.js");

for (const file of [...jsFiles, swFile, workerFile]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

const config = await import(pathToFileURL(join(root, "js/config.js")));
const api = await import(pathToFileURL(join(root, "js/api.js")));
const { SignupRelayDO } = await import(pathToFileURL(workerFile));

/* Exercise SignupRelayDO against real in-memory SQLite + mocked RomM fetch. */
async function checkRelayDO() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(query, ...params) {
      if (params.length === 0 && /CREATE TABLE|INSERT OR IGNORE/i.test(query)) {
        db.exec(query);
        return { one: () => undefined, toArray: () => [] };
      }
      const stmt = db.prepare(query);
      if (/^\s*SELECT/i.test(query)) {
        return {
          one: () => stmt.get(...params),
          toArray: () => stmt.all(...params),
        };
      }
      stmt.run(...params);
      return { one: () => undefined, toArray: () => [] };
    },
  };

  let mintSeq = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    const auth = init.headers?.Authorization || init.headers?.authorization || "";
    if (target.endsWith("/api/users/me")) {
      if (auth === "Bearer admin-jwt") {
        return new Response(JSON.stringify({ id: 1, role: "admin" }), { status: 200 });
      }
      if (auth === "Bearer user-jwt") {
        return new Response(JSON.stringify({ id: 2, role: "user" }), { status: 200 });
      }
      return new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 });
    }
    if (target.endsWith("/api/token")) {
      return new Response(JSON.stringify({ access_token: "svc-access", refresh_token: "svc-ref", expires: 900 }), {
        status: 200,
      });
    }
    if (target.includes("/api/users/invite-link")) {
      mintSeq += 1;
      return new Response(JSON.stringify({ token: `romm-invite-${mintSeq}`, url: null }), { status: 201 });
    }
    if (target.endsWith("/api/heartbeat")) {
      return new Response(JSON.stringify({ SYSTEM: { VERSION: "5.4.1" } }), {
        status: 200,
        headers: { "Set-Cookie": "romm_csrftoken=csrf-test-token; Path=/; SameSite=Lax" },
      });
    }
    if (target.endsWith("/api/users/register")) {
      const cookie = init.headers?.Cookie || "";
      const csrf = init.headers?.["X-CSRFToken"] || "";
      if (!cookie.includes("romm_csrftoken=csrf-test-token") || csrf !== "csrf-test-token") {
        return new Response(JSON.stringify({ detail: "CSRF token verification failed" }), { status: 403 });
      }
      const payload = JSON.parse(init.body || "{}");
      if (payload.username === "bad") {
        return new Response(JSON.stringify({ detail: "Invalid token" }), { status: 400 });
      }
      return new Response(JSON.stringify({ id: 9, username: payload.username, email: payload.email, enabled: true }), {
        status: 201,
      });
    }
    throw new Error(`Unexpected fetch in DO test: ${target}`);
  };

  try {
    const relay = new SignupRelayDO(
      { storage: { sql } },
      {
        ROMM_ORIGIN: "https://romm.test",
        APP_PUBLIC_URL: "https://crymises.github.io/binusarcade",
        ALLOWED_ORIGINS: "https://crymises.github.io",
        ROMM_SERVICE_USERNAME: "svc",
        ROMM_SERVICE_PASSWORD: "pw",
      },
    );

    const call = (path, { method = "GET", body, token } = {}) =>
      relay.fetch(
        new Request(`https://relay.test${path}`, {
          method,
          headers: {
            Origin: "https://crymises.github.io",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
      );

    const disabledRes = await (await call("/invite")).json();
    const nonAdminRes = await call("/admin/state", { method: "POST", body: { enabled: true }, token: "user-jwt" });
    const enableRes = await call("/admin/state", { method: "POST", body: { enabled: true }, token: "admin-jwt" });
    const enabled = await enableRes.json();
    const pub1 = await (await call("/invite")).json();

    const claimOkRes = await call("/claim", { method: "POST", body: { claimId: pub1.claimId } });
    const claimOk = await claimOkRes.json();
    const pub2 = await (await call("/invite")).json();
    const reuseRes = await call("/claim", { method: "POST", body: { claimId: pub1.claimId } });
    const regBadRes = await call("/register", {
      method: "POST",
      body: { username: "bad", email: "bad@example.com", password: "password123", token: "wrong" },
    });
    const regOkRes = await call("/register", {
      method: "POST",
      body: { username: "friend", email: "friend@example.com", password: "password123", token: claimOk.token },
    });

    const disableRes = await call("/admin/state", { method: "POST", body: { enabled: false }, token: "admin-jwt" });
    const disabledAfter = await disableRes.json();
    const claimDisabledRes = await call("/claim", { method: "POST", body: { claimId: pub2.claimId } });

    return {
      disabledDefault: disabledRes.enabled === false && !disabledRes.claimId,
      nonAdminBlocked: nonAdminRes.status === 403,
      enabledMintsClaim:
        enabled.enabled === true &&
        Boolean(enabled.claimId) &&
        pub1.claimId === enabled.claimId &&
        !JSON.stringify(pub1).includes("romm-invite-"),
      claimReturnsTokenAndRotates:
        claimOkRes.status === 200 &&
        claimOk.token === "romm-invite-1" &&
        claimOk.rotated === true &&
        Boolean(pub2.claimId) &&
        pub2.claimId !== pub1.claimId,
      reuseRejected410: reuseRes.status === 410,
      registerProxiesCsrf: regBadRes.status === 400 && regOkRes.status === 201,
      disableClearsAndBlocks: disabledAfter.enabled === false && claimDisabledRes.status === 403,
    };
  } finally {
    globalThis.fetch = origFetch;
    db.close();
  }
}

const i18n = await import(pathToFileURL(join(root, "js/i18n.js")));

const localeFiles = ["core", "home", "library", "detail", "profile", "register"];
const localeModules = {};
for (const name of localeFiles) {
  localeModules[name] = (await import(pathToFileURL(join(root, "js/locales", `id-${name}.js`)))).default || {};
}
const mergedLocale = Object.assign({}, ...Object.values(localeModules));

const duplicateKeys = [];
const conflictingKeys = [];
{
  const seen = new Map();
  for (const [file, dict] of Object.entries(localeModules)) {
    for (const [key, value] of Object.entries(dict)) {
      if (!seen.has(key)) {
        seen.set(key, { file, value });
        continue;
      }
      const first = seen.get(key);
      duplicateKeys.push(key);
      if (first.value !== value) conflictingKeys.push(`${key} (${first.file} vs ${file})`);
    }
  }
}
const emptyValues = Object.entries(mergedLocale).filter(
  ([, value]) => typeof value !== "string" || !value.trim(),
);
const placeholderMismatch = Object.entries(mergedLocale).filter(([key, value]) => {
  const source = (String(key).match(/\{(\w+)\}/g) || []).sort().join(",");
  const target = (String(value).match(/\{(\w+)\}/g) || []).sort().join(",");
  return source !== target;
});

for (const key of duplicateKeys) console.error(`duplicate locale key (same value, harmless): ${key}`);
for (const key of conflictingKeys) console.error(`conflicting locale translation: ${key}`);
for (const [key] of emptyValues) console.error(`empty locale value: ${key}`);
for (const [key, value] of placeholderMismatch) console.error(`placeholder mismatch: ${key} -> ${value}`);

const relayChecks = await checkRelayDO();

const checks = [
  ["Platform alias", config.normalizePlatform("ps") === "psx"],
  ["Platform accent", Boolean(config.colorForPlatform("gba", "Game Boy Advance"))],
  ["Unknown platform safe", config.platformLabelOf({ platform_slug: "mystery" }) === "mystery"],
  ["Array query repeats", api.buildUrl("/roms", { platform_ids: [1, 2] }).includes("platform_ids=1&platform_ids=2")],
  ["Empty query dropped", !api.buildUrl("/roms", { search_term: "" }).includes("search_term")],
  ["Content URL", api.romContentUrl({ id: 7, fs_name: "game.gba" }, { id: 9, file_name: "game.gba" }).includes("/api/roms/7/content/game.gba")],
  ["Stock URL", config.stockRomUrl(7).endsWith("/rom/7")],
  ["Signup invite URL", config.signupInviteUrl("abc.123") === `${config.APP_PUBLIC_URL}/?token=abc.123#/register`],
  ["Signup claim URL", config.signupClaimUrl("c123") === `${config.APP_PUBLIC_URL}/?claim=c123#/register`],
  ["Register API method", typeof api.api.register === "function"],
  ["Invite link API method", typeof api.api.createInviteLink === "function"],
  ["Users API method", typeof api.api.users === "function"],
  ["Strict admin role check", api.isRoleAdmin({ user: { role: "admin" } }) && !api.isRoleAdmin({ user: { role: "user" }, permissions: { is_admin: true } })],
  ["i18n defaults to Indonesian", i18n.DEFAULT_LOCALE === "id" && i18n.locale() === "id"],
  ["i18n translates known strings", i18n.t("Home") === "Beranda" && i18n.t("Sign in") === "Masuk"],
  ["i18n falls back to the English source", i18n.t("Not a real key zzz") === "Not a real key zzz"],
  ["i18n interpolates params", i18n.t("Hi {name}, {n} left", { name: "Ada", n: 3 }) === "Hi Ada, 3 left"],
  ["i18n plurals pick the right form", i18n.tn(1, "1 save", "{n} saves", { n: 1 }) !== i18n.tn(2, "1 save", "{n} saves", { n: 2 })],
  ["i18n dictionaries have no empty values", emptyValues.length === 0],
  ["i18n dictionaries have no conflicting translations", conflictingKeys.length === 0],
  ["i18n dictionaries keep placeholders", placeholderMismatch.length === 0],
  ["i18n covers every view area", localeFiles.every((name) => Object.keys(localeModules[name]).length > 0)],

  ["Relay DO defaults disabled", relayChecks.disabledDefault],
  ["Relay DO blocks non-admin toggle", relayChecks.nonAdminBlocked],
  ["Relay DO mints claim without leaking token", relayChecks.enabledMintsClaim],
  ["Relay DO claim returns token and rotates", relayChecks.claimReturnsTokenAndRotates],
  ["Relay DO rejects reused QR with 410", relayChecks.reuseRejected410],
  ["Relay DO proxies register with CSRF cookie", relayChecks.registerProxiesCsrf],
  ["Relay DO disable clears and blocks claims", relayChecks.disableClearsAndBlocks],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log(`\n${jsFiles.length + 2} files parsed, ${checks.length} checks passed.`);
