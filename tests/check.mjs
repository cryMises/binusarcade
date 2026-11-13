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
      disableClearsAndBlocks: disabledAfter.enabled === false && claimDisabledRes.status === 403,
    };
  } finally {
    globalThis.fetch = origFetch;
    db.close();
  }
}

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
  ["Relay DO defaults disabled", relayChecks.disabledDefault],
  ["Relay DO blocks non-admin toggle", relayChecks.nonAdminBlocked],
  ["Relay DO mints claim without leaking token", relayChecks.enabledMintsClaim],
  ["Relay DO claim returns token and rotates", relayChecks.claimReturnsTokenAndRotates],
  ["Relay DO rejects reused QR with 410", relayChecks.reuseRejected410],
  ["Relay DO disable clears and blocks claims", relayChecks.disableClearsAndBlocks],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log(`\n${jsFiles.length + 2} files parsed, ${checks.length} checks passed.`);
