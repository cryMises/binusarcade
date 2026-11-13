/* Cloudflare Worker + SQLite Durable Object relay for Binus Arcade signup QRs.
 * Holds the admin-controlled enabled flag and rotates single-use RomM invite
 * tokens atomically when claimed or expired.
 *
 * Required Wrangler secrets:
 *   ROMM_SERVICE_USERNAME  (RomM admin/service account username)
 *   ROMM_SERVICE_PASSWORD  (RomM admin/service account password)
 */

const INVITE_TTL_MS = 3_600_000;
const CLAIM_COOLDOWN_MS = 1_500;
const USED_RETENTION_MS = 48 * 3_600_000;
const TOKEN_SKEW_MS = 30_000;
const SERVICE_SCOPES = "me.read users.read users.write";

function parseAllowedOrigins(raw) {
  return new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env?.ALLOWED_ORIGINS);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin && (allowed.size === 0 || allowed.has(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(data, status = 200, request = null, env = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(request ? corsHeaders(request, env) : { "Cache-Control": "no-store" }),
    },
  });
}

function todayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function randomClaimId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function buildQrUrl(appUrl, claimId) {
  const base = String(appUrl || "").replace(/\/+$/, "");
  return `${base}/?claim=${encodeURIComponent(claimId)}#/register`;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export class SignupRelayDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.ipClaimAt = new Map();
    this.recentMints = [];
    this.initialized = false;
  }

  sql() {
    return this.ctx.storage.sql;
  }

  initSchema() {
    if (this.initialized) return;
    const s = this.sql();
    s.exec(`
      CREATE TABLE IF NOT EXISTS relay_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0,
        claim_id TEXT,
        romm_token TEXT,
        expires_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0,
        day_key TEXT NOT NULL DEFAULT '',
        day_mints INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO relay_state (id, enabled) VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS used_claims (
        claim_id TEXT PRIMARY KEY,
        used_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS service_auth (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER NOT NULL DEFAULT 0,
        refresh_expires_at INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO service_auth (id) VALUES (1);
    `);
    this.initialized = true;
  }

  getState() {
    this.initSchema();
    return this.sql().exec("SELECT * FROM relay_state WHERE id = 1").one();
  }

  publicPayload(state) {
    if (!state.enabled) {
      return { enabled: false };
    }
    return {
      enabled: true,
      claimId: state.claim_id,
      qrUrl: state.claim_id ? buildQrUrl(this.env.APP_PUBLIC_URL, state.claim_id) : null,
      expiresAt: state.expires_at,
      updatedAt: state.updated_at,
    };
  }

  async verifyAdmin(request) {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return { ok: false, status: 401, detail: "Missing admin bearer token." };
    }
    const romm = String(this.env.ROMM_ORIGIN || "").replace(/\/+$/, "");
    let res;
    try {
      res = await fetch(`${romm}/api/users/me`, {
        headers: { Authorization: auth, Accept: "application/json" },
      });
    } catch {
      return { ok: false, status: 502, detail: "Couldn't reach RomM to verify admin." };
    }
    if (res.status === 401) {
      return { ok: false, status: 401, detail: "Admin session expired." };
    }
    if (!res.ok) {
      return { ok: false, status: 403, detail: "Admin verification failed." };
    }
    const user = await res.json();
    if (user?.role !== "admin") {
      return { ok: false, status: 403, detail: "Admin role required." };
    }
    return { ok: true, user };
  }

  async getServiceToken({ forceRefresh = false } = {}) {
    this.initSchema();
    const now = Date.now();
    const row = this.sql().exec("SELECT * FROM service_auth WHERE id = 1").one();

    if (!forceRefresh && row.access_token && now < Number(row.expires_at) - TOKEN_SKEW_MS) {
      return row.access_token;
    }

    const romm = String(this.env.ROMM_ORIGIN || "").replace(/\/+$/, "");
    let tokens = null;

    if (!forceRefresh && row.refresh_token && (!row.refresh_expires_at || now < Number(row.refresh_expires_at) - TOKEN_SKEW_MS)) {
      const res = await fetch(`${romm}/api/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: row.refresh_token,
        }).toString(),
      });
      if (res.ok) tokens = await res.json();
    }

    if (!tokens) {
      const username = this.env.ROMM_SERVICE_USERNAME;
      const password = this.env.ROMM_SERVICE_PASSWORD;
      if (!username || !password) {
        throw new Error("Worker missing ROMM_SERVICE_USERNAME or ROMM_SERVICE_PASSWORD secret.");
      }
      const res = await fetch(`${romm}/api/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "password",
          username,
          password,
          scope: SERVICE_SCOPES,
        }).toString(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`RomM service login failed (${res.status}): ${text.slice(0, 120)}`);
      }
      tokens = await res.json();
    }

    const accessExpires = now + Number(tokens.expires || 900) * 1000;
    const refreshExpires = tokens.refresh_expires ? now + Number(tokens.refresh_expires) * 1000 : 0;
    this.sql().exec(
      `UPDATE service_auth
       SET access_token = ?, refresh_token = ?, expires_at = ?, refresh_expires_at = ?
       WHERE id = 1`,
      tokens.access_token || null,
      tokens.refresh_token || null,
      accessExpires,
      refreshExpires,
    );
    return tokens.access_token;
  }

  async mintInvite() {
    const now = Date.now();
    const state = this.getState();
    const day = todayKey(now);
    const dayMints = state.day_key === day ? Number(state.day_mints || 0) : 0;
    const maxDaily = Number(this.env.MAX_DAILY_MINTS || 500);
    if (dayMints >= maxDaily) {
      throw new Error("Daily invite cap reached.");
    }

    this.recentMints = this.recentMints.filter((t) => now - t < 60_000);
    if (this.recentMints.length >= 25) {
      throw new Error("Too many invite refreshes in one minute. Try again shortly.");
    }
    this.recentMints.push(now);

    const romm = String(this.env.ROMM_ORIGIN || "").replace(/\/+$/, "");
    let token = await this.getServiceToken();
    let res = await fetch(`${romm}/api/users/invite-link?role=user&expiration=3600`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (res.status === 401) {
      token = await this.getServiceToken({ forceRefresh: true });
      res = await fetch(`${romm}/api/users/invite-link?role=user&expiration=3600`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`RomM invite mint failed (${res.status}): ${text.slice(0, 140)}`);
    }

    const invite = await res.json();
    if (!invite?.token) {
      throw new Error("RomM returned an empty invite token.");
    }

    const claimId = randomClaimId();
    const expiresAt = now + INVITE_TTL_MS;
    this.sql().exec(
      `UPDATE relay_state
       SET claim_id = ?, romm_token = ?, expires_at = ?, updated_at = ?, day_key = ?, day_mints = ?
       WHERE id = 1`,
      claimId,
      invite.token,
      expiresAt,
      now,
      day,
      dayMints + 1,
    );

    /* Prune stale claim records opportunistically without extra alarms. */
    this.sql().exec("DELETE FROM used_claims WHERE used_at < ?", now - USED_RETENTION_MS);
    return this.getState();
  }

  async ensureActiveInvite() {
    let state = this.getState();
    if (!state.enabled) return state;
    if (!state.claim_id || !state.romm_token || Date.now() >= Number(state.expires_at)) {
      state = await this.mintInvite();
    }
    return state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, this.env) });
    }

    try {
      if (path === "/invite" && request.method === "GET") {
        const state = await this.ensureActiveInvite();
        return json(this.publicPayload(state), 200, request, this.env);
      }

      if (path === "/claim" && request.method === "POST") {
        const ip = request.headers.get("CF-Connecting-IP") || "";
        const now = Date.now();
        if (ip) {
          const prev = this.ipClaimAt.get(ip) || 0;
          if (now - prev < CLAIM_COOLDOWN_MS) {
            return json({ detail: "Slow down a moment and try scanning again." }, 429, request, this.env);
          }
          if (this.ipClaimAt.size > 500) this.ipClaimAt.clear();
          this.ipClaimAt.set(ip, now);
        }

        const body = await readJsonBody(request);
        const claimId = String(body?.claimId || "").trim();
        const state = this.getState();

        if (!state.enabled) {
          return json(
            { detail: "Signup QR is turned off. Ask the admin for a signup code." },
            403,
            request,
            this.env,
          );
        }

        if (!claimId || claimId !== state.claim_id) {
          const used = claimId
            ? this.sql().exec("SELECT 1 AS hit FROM used_claims WHERE claim_id = ?", claimId).toArray()
            : [];
          return json(
            {
              detail: used.length
                ? "This invite QR was already scanned. Tap Create account to get the updated QR."
                : "This invite QR was replaced or expired. Tap Create account to get the updated QR.",
            },
            410,
            request,
            this.env,
          );
        }

        if (now >= Number(state.expires_at)) {
          await this.mintInvite();
          return json(
            { detail: "This invite QR expired. Tap Create account to get the updated QR." },
            410,
            request,
            this.env,
          );
        }

        /* Mark used and clear active token BEFORE minting replacement so concurrent claims fail closed. */
        const tokenToReturn = state.romm_token;
        this.sql().exec(
          "INSERT OR REPLACE INTO used_claims (claim_id, used_at) VALUES (?, ?)",
          claimId,
          now,
        );
        this.sql().exec(
          "UPDATE relay_state SET claim_id = NULL, romm_token = NULL, expires_at = 0, updated_at = ? WHERE id = 1",
          now,
        );

        let rotated = false;
        try {
          await this.mintInvite();
          rotated = true;
        } catch {
          /* Returning the claimed token still succeeds; next /invite poll retries minting. */
        }

        return json({ token: tokenToReturn, rotated }, 200, request, this.env);
      }

      if (path === "/registered" && request.method === "POST") {
        const body = await readJsonBody(request);
        const usedToken = String(body?.token || "").trim();
        const state = this.getState();
        if (state.enabled && usedToken && usedToken === state.romm_token) {
          if (state.claim_id) {
            this.sql().exec(
              "INSERT OR REPLACE INTO used_claims (claim_id, used_at) VALUES (?, ?)",
              state.claim_id,
              Date.now(),
            );
          }
          await this.mintInvite();
        }
        return json({ ok: true }, 200, request, this.env);
      }

      if (path === "/admin/state" && request.method === "GET") {
        const auth = await this.verifyAdmin(request);
        if (!auth.ok) return json({ detail: auth.detail }, auth.status, request, this.env);
        const state = await this.ensureActiveInvite();
        return json(this.publicPayload(state), 200, request, this.env);
      }

      if (path === "/admin/state" && request.method === "POST") {
        const auth = await this.verifyAdmin(request);
        if (!auth.ok) return json({ detail: auth.detail }, auth.status, request, this.env);
        const body = await readJsonBody(request);
        const enabled = Boolean(body?.enabled);
        const now = Date.now();

        if (!enabled) {
          const prev = this.getState();
          if (prev.claim_id) {
            this.sql().exec(
              "INSERT OR REPLACE INTO used_claims (claim_id, used_at) VALUES (?, ?)",
              prev.claim_id,
              now,
            );
          }
          this.sql().exec(
            "UPDATE relay_state SET enabled = 0, claim_id = NULL, romm_token = NULL, expires_at = 0, updated_at = ? WHERE id = 1",
            now,
          );
          return json({ enabled: false }, 200, request, this.env);
        }

        this.sql().exec("UPDATE relay_state SET enabled = 1, updated_at = ? WHERE id = 1", now);
        const state = await this.ensureActiveInvite();
        return json(this.publicPayload(state), 200, request, this.env);
      }

      if (path === "/admin/rotate" && request.method === "POST") {
        const auth = await this.verifyAdmin(request);
        if (!auth.ok) return json({ detail: auth.detail }, auth.status, request, this.env);
        const now = Date.now();
        const prev = this.getState();
        if (prev.claim_id) {
          this.sql().exec(
            "INSERT OR REPLACE INTO used_claims (claim_id, used_at) VALUES (?, ?)",
            prev.claim_id,
            now,
          );
        }
        this.sql().exec("UPDATE relay_state SET enabled = 1, updated_at = ? WHERE id = 1", now);
        const state = await this.mintInvite();
        return json(this.publicPayload(state), 200, request, this.env);
      }

      return json({ detail: "Not found." }, 404, request, this.env);
    } catch (error) {
      return json({ detail: error?.message || "Relay error." }, 502, request, this.env);
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    const id = env.RELAY.idFromName("global");
    return env.RELAY.get(id).fetch(request);
  },
};
