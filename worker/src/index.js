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
const SETTINGS_KEY = "app-settings";
const DEFAULT_SETTINGS = {
  trialGameId: null,
  trialEnabled: false,
  registrationEnabled: true,
};

function trialSecret(env) {
  return String(env?.TRIAL_API_TOKEN || "").trim();
}

function trialBase(request) {
  const url = new URL(request.url);
  return `${url.origin}`;
}

function normalizeTrialId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

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
  /* Fail closed: an empty/missing ALLOWED_ORIGINS disables cross-origin access
   * instead of reflecting any site. */
  if (origin && allowed.has(origin)) {
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

function extractCsrfCookie(headers) {
  const list = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie") || ""];
  for (const raw of list) {
    const match = String(raw || "").match(/romm_csrftoken=([^;,\s]+)/);
    if (match) return match[1];
  }
  return "";
}

function normalizeSettings(input = {}) {
  const id = input?.trialGameId;
  let trialGameId = null;
  if (id !== null && id !== undefined && id !== "") {
    const n = Number(id);
    trialGameId = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  return {
    trialGameId,
    trialEnabled: Boolean(input?.trialEnabled),
    registrationEnabled:
      typeof input?.registrationEnabled === "boolean"
        ? input.registrationEnabled
        : DEFAULT_SETTINGS.registrationEnabled,
  };
}

async function readSettings(env) {
  try {
    const kv = env?.SETTINGS;
    if (!kv || typeof kv.get !== "function") return { ...DEFAULT_SETTINGS };
    const raw = await kv.get(SETTINGS_KEY, "text");
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeSettings(env, next) {
  const kv = env?.SETTINGS;
  if (!kv || typeof kv.put !== "function") {
    throw new Error("SETTINGS KV binding is missing. Bind a KV namespace named SETTINGS.");
  }
  const value = normalizeSettings(next);
  await kv.put(SETTINGS_KEY, JSON.stringify(value));
  return value;
}

async function verifyAdminRequest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, detail: "Missing admin bearer token." };
  }
  const romm = String(env?.ROMM_ORIGIN || "").replace(/\/+$/, "");
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

export class SignupRelayDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.ipClaimAt = new Map();
    this.ipRegisterAt = new Map();
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
    return verifyAdminRequest(request, this.env);
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
        const settings = await readSettings(this.env);
        if (!settings.registrationEnabled) {
          return json({ enabled: false }, 200, request, this.env);
        }
        const state = await this.ensureActiveInvite();
        return json(this.publicPayload(state), 200, request, this.env);
      }

      if (path === "/claim" && request.method === "POST") {
        const settings = await readSettings(this.env);
        if (!settings.registrationEnabled) {
          return json({ detail: "Registration is closed." }, 403, request, this.env);
        }
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

      if (path === "/register" && request.method === "POST") {
        const settings = await readSettings(this.env);
        if (!settings.registrationEnabled) {
          return json({ detail: "Registration is closed." }, 403, request, this.env);
        }

        const ip = request.headers.get("CF-Connecting-IP") || "";
        const now = Date.now();
        if (ip) {
          const prev = this.ipRegisterAt.get(ip) || 0;
          if (now - prev < CLAIM_COOLDOWN_MS) {
            return json({ detail: "Slow down a moment and try submitting again." }, 429, request, this.env);
          }
          if (this.ipRegisterAt.size > 500) this.ipRegisterAt.clear();
          this.ipRegisterAt.set(ip, now);
        }

        const body = await readJsonBody(request);
        const payload = {
          username: String(body?.username || "").trim(),
          email: String(body?.email || "").trim(),
          password: String(body?.password || ""),
          token: String(body?.token || "").trim(),
        };
        if (!payload.username || !payload.email || !payload.password || !payload.token) {
          return json({ detail: "Fill in every field, including the invite token." }, 422, request, this.env);
        }

        const romm = String(this.env.ROMM_ORIGIN || "").replace(/\/+$/, "");
        const hbRes = await fetch(`${romm}/api/heartbeat`, {
          headers: { Accept: "application/json" },
        });
        const csrf = extractCsrfCookie(hbRes.headers);
        if (!hbRes.ok || !csrf) {
          return json({ detail: "Couldn't reach RomM to start registration." }, 502, request, this.env);
        }

        const regRes = await fetch(`${romm}/api/users/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Origin: romm,
            Referer: `${romm}/register`,
            Cookie: `romm_csrftoken=${csrf}`,
            "X-CSRFToken": csrf,
          },
          body: JSON.stringify(payload),
        });

        const rawText = await regRes.text().catch(() => "");
        let regData;
        try {
          regData = rawText ? JSON.parse(rawText) : {};
        } catch {
          regData = { detail: rawText.slice(0, 300) || `RomM returned ${regRes.status}.` };
        }

        if (regRes.ok) {
          const state = this.getState();
          if (state.enabled && payload.token === state.romm_token) {
            if (state.claim_id) {
              this.sql().exec(
                "INSERT OR REPLACE INTO used_claims (claim_id, used_at) VALUES (?, ?)",
                state.claim_id,
                Date.now(),
              );
            }
            try {
              await this.mintInvite();
            } catch {
              /* Registration succeeded; next poll retries minting. */
            }
          }
        }

        return json(regData, regRes.status, request, this.env);
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
      console.error("relay error", error);
      return json({ detail: "Relay error." }, 502, request, this.env);
    }
  }
}

async function handleSettings(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/settings") return null;

  if (request.method === "GET") {
    const settings = await readSettings(env);
    return json(settings, 200, request, env);
  }

  if (request.method === "POST") {
    const auth = await verifyAdminRequest(request, env);
    if (!auth.ok) return json({ detail: auth.detail }, auth.status, request, env);
    const body = await readJsonBody(request);
    const saved = await writeSettings(env, body);
    return json(saved, 200, request, env);
  }

  return json({ detail: "Method not allowed." }, 405, request, env);
}

function trialCorsResponse(response, request, env) {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  const cors = corsHeaders(request, env);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  /* Streams must remain streams; avoid buffering. */
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function rommTrialFetch(env, path, { method = "GET", headers = {} } = {}) {
  const token = trialSecret(env);
  const romm = String(env?.ROMM_ORIGIN || "").replace(/\/+$/, "");
  return fetch(`${romm}${path}`, {
    method,
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
      Accept: headers.Accept || "application/json",
    },
  });
}

async function fetchTrialRom(env, trialGameId) {
  const res = await rommTrialFetch(env, `/api/roms/${encodeURIComponent(trialGameId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = text.slice(0, 200) || `RomM returned ${res.status}.`;
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function pickCoverPath(rom, env) {
  const origin = String(env?.ROMM_ORIGIN || "").replace(/\/+$/, "");
  const asPath = (value) => {
    if (!value) return null;
    const raw = String(value);
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        if (origin && `${u.origin}` === origin) return `${u.pathname}${u.search}`;
      } catch {
        /* ignore */
      }
      return null;
    }
    return raw.startsWith("/") ? raw : `/${raw.replace(/^\/+/, "")}`;
  };
  return asPath(rom?.url_cover) || asPath(rom?.path_cover_large) || asPath(rom?.path_cover_small);
}

async function handleTrial(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/trial")) return null;

  /* Fixed endpoint set, read-only. No other RomM paths proxied. */
  const allowed = path === "/trial/meta" || path === "/trial/cover" || path === "/trial/content";
  if (!allowed) {
    return json({ detail: "Not found." }, 403, request, env);
  }
  if (request.method !== "GET") {
    return json({ detail: "Method not allowed." }, 403, request, env);
  }

  if (!trialSecret(env)) {
    return json({ detail: "Trial is unavailable." }, 503, request, env);
  }

  const settings = await readSettings(env);
  const trialGameId = normalizeTrialId(settings.trialGameId);
  if (!settings.trialEnabled || !trialGameId) {
    return json({ detail: "Trial is not available." }, 403, request, env);
  }

  try {
    if (path === "/trial/meta") {
      const rom = await fetchTrialRom(env, trialGameId);
      const meta = {
        id: rom.id,
        name: rom.name || rom.fs_name_no_ext || rom.fs_name || "Trial game",
        fs_name: rom.fs_name || null,
        fs_name_no_tags: rom.fs_name_no_tags || null,
        fs_name_no_ext: rom.fs_name_no_ext || null,
        platform_id: rom.platform_id ?? null,
        platform_slug: rom.platform_slug || rom.platform_fs_slug || null,
        platform_fs_slug: rom.platform_fs_slug || null,
        platform_display_name: rom.platform_display_name || rom.platform_custom_name || rom.platform_name || null,
        summary: rom.summary || null,
        metadatum: rom.metadatum || null,
        files: Array.isArray(rom.files) ? rom.files : [],
        has_nested_single_file: Boolean(rom.has_nested_single_file),
        path_cover_small: rom.path_cover_small || null,
        path_cover_large: rom.path_cover_large || null,
        url_cover: rom.url_cover || null,
        coverUrl: `${trialBase(request)}/trial/cover`,
      };
      return json(meta, 200, request, env);
    }

    if (path === "/trial/cover") {
      const rom = await fetchTrialRom(env, trialGameId);
      const coverPath = pickCoverPath(rom, env);
      if (!coverPath) {
        return json({ detail: "Cover not found." }, 404, request, env);
      }
      const res = await rommTrialFetch(env, coverPath, { headers: { Accept: "image/*,*/*;q=0.8" } });
      if (!res.ok) {
        return json({ detail: "Cover unavailable." }, res.status === 404 ? 404 : 502, request, env);
      }
      return trialCorsResponse(res, request, env);
    }

    if (path === "/trial/content") {
      const fileName = String(url.searchParams.get("file_name") || "").trim();
      const fileIds = String(url.searchParams.get("file_ids") || "").trim();
      if (!fileName) {
        return json({ detail: "Missing file_name." }, 400, request, env);
      }
      /* Never forward an arbitrary path: file_name must be one of the files
       * RomM reports for the configured trial game. */
      const rom = await fetchTrialRom(env, trialGameId);
      const files = Array.isArray(rom.files) ? rom.files : [];
      const file = files.find((item) => String(item?.file_name || "") === fileName);
      const matchesFsName = !files.length && String(rom?.fs_name || "") === fileName && !fileIds;
      if (!file && !matchesFsName) {
        return json({ detail: "Unknown trial game file." }, 400, request, env);
      }
      if (file && fileIds && String(file.id ?? "") !== fileIds) {
        return json({ detail: "Unknown trial game file." }, 400, request, env);
      }
      const params = new URLSearchParams({ purpose: "play" });
      if (fileIds) params.set("file_ids", fileIds);
      const contentPath = `/api/roms/${encodeURIComponent(trialGameId)}/content/${encodeURIComponent(fileName)}?${params.toString()}`;
      const res = await rommTrialFetch(env, contentPath, { headers: { Accept: "*/*" } });
      if (!res.ok) {
        return json({ detail: "Couldn't load the trial game file." }, res.status === 404 ? 404 : 502, request, env);
      }
      return trialCorsResponse(res, request, env);
    }

    return json({ detail: "Not found." }, 403, request, env);
  } catch (error) {
    const status = error?.status === 404 ? 404 : 502;
    return json({ detail: status === 404 ? "Trial game not found." : "Trial is temporarily unavailable." }, status, request, env);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    try {
      const settingsResponse = await handleSettings(request, env);
      if (settingsResponse) return settingsResponse;
    } catch (error) {
      console.error("settings error", error);
      return json({ detail: "Settings error." }, 502, request, env);
    }
    try {
      const trialResponse = await handleTrial(request, env);
      if (trialResponse) return trialResponse;
    } catch (error) {
      console.error("trial error", error);
      return json({ detail: "Trial error." }, 502, request, env);
    }
    const id = env.RELAY.idFromName("global");
    return env.RELAY.get(id).fetch(request);
  },
};
