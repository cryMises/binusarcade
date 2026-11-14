/* RomM API client.
 *
 * Auth note: RomM's session cookie is SameSite=Lax, so a GitHub Pages origin
 * cannot use cookie auth. We use RomM's documented OAuth2 password/refresh
 * token endpoint instead. Tokens live in sessionStorage by default and in
 * localStorage when "stay signed in" is on; passwords are never stored or
 * logged.
 */

import {
  API_BASE,
  CACHE_TTL,
  REQUEST_TIMEOUT,
  ROMM_ORIGIN,
  SIGNUP_RELAY_URL,
  STORAGE,
  deviceId,
} from "./config.js";
import { t } from "./i18n.js";

export class ApiError extends Error {
  constructor(message, { status = 0, detail = "", cause = null, retryable = false } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
  }
}

export function isAbortError(error) {
  return error?.name === "AbortError" || error?.cause?.name === "AbortError";
}

function dispatch(name, detail) {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

function localStore() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function sessionStore() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

/* Staying signed in is the default; only an explicit "0" opts out. */
export function isPersistentSession() {
  try {
    return localStore()?.getItem(STORAGE.sessionPersist) !== "0";
  } catch {
    return true;
  }
}

/* Where the session is written first, and where the stale copy may linger. */
function sessionStores() {
  const local = localStore();
  const session = sessionStore();
  return isPersistentSession() ? [local, session] : [session, local];
}

function readStoredSession() {
  const [primary, secondary] = sessionStores();
  let raw = null;
  try {
    raw = primary?.getItem(STORAGE.session) || null;
  } catch {
    /* ignore */
  }
  if (raw) return raw;
  try {
    raw = secondary?.getItem(STORAGE.session) || null;
  } catch {
    return null;
  }
  if (raw) {
    /* Upgrade a session written before the storage mode changed. */
    try {
      primary?.setItem(STORAGE.session, raw);
      secondary?.removeItem(STORAGE.session);
    } catch {
      /* ignoring the move is safe: the session still loads */
    }
  }
  return raw;
}

let memorySession = null;

export function getSession() {
  if (memorySession) return memorySession;
  try {
    const raw = readStoredSession();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  memorySession = session;
  const [primary, secondary] = sessionStores();
  try {
    primary?.setItem(STORAGE.session, JSON.stringify(session));
    secondary?.removeItem(STORAGE.session);
  } catch {
    /* Private mode / quota: the in-memory session still works for this page. */
  }
  dispatch("binusarcade:session", session);
  return session;
}

/* Moves any stored session between localStorage and sessionStorage so the
 * "stay signed in" choice applies immediately, without signing the user out. */
export function setPersistentSession(remember) {
  const next = Boolean(remember);
  let raw = null;
  try {
    raw = sessionStore()?.getItem(STORAGE.session) || null;
  } catch {
    /* ignore */
  }
  if (!raw) {
    try {
      raw = localStore()?.getItem(STORAGE.session) || null;
    } catch {
      /* ignore */
    }
  }

  try {
    localStore()?.setItem(STORAGE.sessionPersist, next ? "1" : "0");
  } catch {
    /* ignore */
  }

  const [primary, secondary] = sessionStores();
  if (raw) {
    try {
      primary?.setItem(STORAGE.session, raw);
      secondary?.removeItem(STORAGE.session);
    } catch {
      /* keep the old copy rather than losing the session */
      try {
        const fallback = next ? sessionStore() : localStore();
        fallback?.setItem(STORAGE.session, raw);
      } catch {
        /* ignore */
      }
    }
  }
  return next;
}

export function updateSession(patch) {
  const session = getSession() || {};
  return setSession({ ...session, ...patch });
}

export function clearSession() {
  memorySession = null;
  for (const store of [localStore(), sessionStore()]) {
    try {
      store?.removeItem(STORAGE.session);
    } catch {
      /* ignore */
    }
  }
  dispatch("binusarcade:session", null);
}

export function hasSession() {
  return Boolean(getSession()?.tokens?.access_token);
}

export function isAdmin(session = getSession()) {
  return (
    session?.user?.role === "admin" ||
    session?.permissions?.is_admin === true
  );
}

export function isRoleAdmin(session = getSession()) {
  return session?.user?.role === "admin";
}

function tokenExpiresAt(session) {
  const savedAt = Number(session?.saved_at || 0);
  const expires = Number(session?.tokens?.expires || 0);
  return savedAt + expires * 1000;
}

function refreshExpiresAt(session) {
  const savedAt = Number(session?.saved_at || 0);
  const expires = Number(session?.tokens?.refresh_expires || 0);
  return savedAt + expires * 1000;
}

function canRefresh(session) {
  if (!session?.tokens?.refresh_token) return false;
  const at = refreshExpiresAt(session);
  return !at || Date.now() < at - 30_000;
}

function sessionExpired(reason = "Your session expired. Sign in again.") {
  clearSession();
  dispatch("binusarcade:session-expired", { message: reason });
}

/* ------------------------------------------------------------------ */
/* URLs and requests                                                   */
/* ------------------------------------------------------------------ */

export function buildUrl(path, query) {
  const base = /^https?:/i.test(path) ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const url = new URL(base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (item === undefined || item === null || item === "") continue;
        url.searchParams.append(key, String(item));
      }
    }
  }
  return url.toString();
}

async function parseError(response) {
  let detail = "";
  try {
    const text = await response.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        if (typeof json?.detail === "string") detail = json.detail;
        else if (Array.isArray(json?.detail)) {
          detail = json.detail.map((item) => item?.msg || "Invalid value").join("; ");
        } else if (json?.message) detail = String(json.message);
        else detail = text.slice(0, 300);
      } catch {
        detail = text.slice(0, 300);
      }
    }
  } catch {
    /* ignore */
  }
  return detail;
}

function errorFor(status, detail) {
  if (status === 401) return new ApiError(t("Not signed in or token expired."), { status, detail });
  if (status === 403) return new ApiError(t("You don't have permission for that."), { status, detail });
  if (status === 404) return new ApiError(t("Not found on the RomM server."), { status, detail });
  if (status === 422) return new ApiError(detail || t("RomM rejected the request."), { status, detail });
  if (status >= 500) {
    return new ApiError(t("The RomM server hit a snag. Try again in a moment."), {
      status,
      detail,
      retryable: true,
    });
  }
  return new ApiError(detail || t("Request failed ({status}).", { status }), { status, detail });
}

function networkError(cause) {
  return new ApiError(
    t("Can't reach the arcade server. Check the RomM CORS setting and your connection."),
    { status: 0, cause, retryable: true },
  );
}

function mergeSignals(timeout, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeout);

  const onAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function rawRequest(
  path,
  {
    method = "GET",
    query,
    body,
    headers = {},
    signal,
    timeout = REQUEST_TIMEOUT,
    auth = true,
    keepalive = false,
    responseType = "json",
    retry = true,
  } = {},
) {
  const url = buildUrl(path, query);
  const requestHeaders = { Accept: "application/json", ...headers };

  let requestBody = body;
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      requestBody = body;
    } else if (body instanceof URLSearchParams) {
      requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
      requestBody = body.toString();
    } else if (body instanceof Blob || body instanceof ArrayBuffer) {
      requestBody = body;
    } else {
      requestHeaders["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }
  }

  if (auth) {
    const token = await accessToken();
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const { signal: mergedSignal, done } = mergeSignals(timeout, signal);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: mergedSignal,
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
      keepalive,
      redirect: "follow",
    });
  } catch (error) {
    done();
    if (isAbortError(error) || error?.name === "TimeoutError") {
      if (signal?.aborted) throw error;
      throw new ApiError(t("The arcade server took too long to answer."), {
        status: 0,
        cause: error,
        retryable: true,
      });
    }
    throw networkError(error);
  } finally {
    done();
  }

  if (response.status === 401 && auth && retry) {
    const session = getSession();
    if (canRefresh(session)) {
      try {
        await refreshAccessToken();
        return rawRequest(path, {
          method,
          query,
          body,
          headers,
          signal,
          timeout,
          auth,
          keepalive,
          responseType,
          retry: false,
        });
      } catch {
        sessionExpired();
        throw errorFor(401, await parseError(response));
      }
    }
    sessionExpired();
    throw errorFor(401, await parseError(response));
  }

  if (!response.ok) {
    throw errorFor(response.status, await parseError(response));
  }

  if (responseType === "response") return response;
  if (responseType === "blob") return response.blob();
  if (responseType === "arrayBuffer") return response.arrayBuffer();
  if (response.status === 204) return null;

  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return response.text();
}

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

/* RomM issues a token with exactly the scopes requested. An empty scope
 * produces a valid token with no permissions, so every later API call 403s. */
const APP_USER_SCOPES = [
  "me.read",
  "roms.read",
  "platforms.read",
  "assets.read",
  "devices.read",
  "roms.user.read",
  "roms.user.write",
  "assets.write",
  "devices.write",
];

const APP_SCOPES = [...APP_USER_SCOPES, "users.read", "users.write"];

const APP_READ_SCOPES = APP_USER_SCOPES.filter((scope) => scope.endsWith(".read"));

function passwordBody(username, password, scopes) {
  return new URLSearchParams({
    grant_type: "password",
    username,
    password,
    scope: scopes.join(" "),
  });
}

export async function requestToken(username, password) {
  const request = (scopes) =>
    rawRequest("/token", {
      method: "POST",
      body: passwordBody(username, password, scopes),
      auth: false,
      timeout: 20_000,
    });

  for (const scopes of [APP_SCOPES, APP_USER_SCOPES]) {
    try {
      return await request(scopes);
    } catch (error) {
      if (error?.status !== 403 || !/scope/i.test(error?.detail || "")) throw error;
      /* Non-admin and viewer accounts lack elevated scopes; step down safely. */
    }
  }
  return request(APP_READ_SCOPES);
}

let refreshPromise = null;

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const session = getSession();
    if (!canRefresh(session)) throw new ApiError(t("Session expired."), { status: 401 });

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.tokens.refresh_token,
    });

    const tokens = await rawRequest("/token", {
      method: "POST",
      body,
      auth: false,
      retry: false,
      timeout: 20_000,
    });

    setSession({ ...session, tokens, saved_at: Date.now() });
    return tokens.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function accessToken() {
  const session = getSession();
  if (!session?.tokens?.access_token) {
    throw new ApiError(t("Sign in to open the arcade."), { status: 401 });
  }
  if (Date.now() < tokenExpiresAt(session) - 30_000) {
    return session.tokens.access_token;
  }
  if (canRefresh(session)) return refreshAccessToken();
  sessionExpired();
  throw new ApiError(t("Session expired."), { status: 401 });
}

export async function fetchWithAuth(url, options = {}) {
  const token = await accessToken();
  let response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    credentials: "omit",
    mode: "cors",
    cache: "no-store",
  });

  if (response.status === 401 && canRefresh(getSession())) {
    try {
      await refreshAccessToken();
      const next = await accessToken();
      response = await fetch(url, {
        ...options,
        headers: { ...(options.headers || {}), Authorization: `Bearer ${next}` },
        credentials: "omit",
        mode: "cors",
        cache: "no-store",
      });
    } catch {
      sessionExpired();
    }
  }

  if (!response.ok) {
    throw errorFor(response.status, await parseError(response));
  }
  return response;
}

function hostOf(url) {
  try {
    return new URL(url).host || "the RomM server";
  } catch {
    return "the RomM server";
  }
}

async function readDownloadBlob(response, { signal, onProgress } = {}) {
  const total = Number(response.headers.get("content-length") || 0);
  const type = response.headers.get("content-type") || "application/octet-stream";

  if (!response.body || typeof response.body.getReader !== "function") {
    const blob = await response.blob();
    onProgress?.({ received: blob.size, total: blob.size || total, done: true });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress?.({ received, total, done: false });
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) throw error;
    throw new ApiError(
      `The game download stopped after ${received} bytes. Check your connection and try again.`,
      { status: 0, cause: error, retryable: true },
    );
  } finally {
    reader.releaseLock();
  }

  const blob = new Blob(chunks, { type });
  onProgress?.({ received, total: total || received, done: true });
  return blob;
}

export async function downloadBlob(url, { signal, onProgress } = {}) {
  let response;
  try {
    response = await fetchWithAuth(url, { signal });
  } catch (error) {
    if (isAbortError(error) || error instanceof ApiError) throw error;
    throw new ApiError(
      t("Couldn't start the game download from {host}. The browser blocked the file request (CORS) or the connection dropped.", { host: hostOf(url) }),
      { status: 0, cause: error, retryable: true },
    );
  }
  return readDownloadBlob(response, { signal, onProgress });
}

/* Token-less download for kiosk guest mode (no Authorization, credentials omit). */
export async function publicDownloadBlob(url, { signal, onProgress } = {}) {
  let response;
  try {
    response = await fetch(url, {
      signal,
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
    });
  } catch (error) {
    if (isAbortError(error) || error instanceof ApiError) throw error;
    throw new ApiError(
      t("Couldn't start the game download from {host}. The browser blocked the file request (CORS) or the connection dropped.", { host: hostOf(url) }),
      { status: 0, cause: error, retryable: true },
    );
  }
  if (!response.ok) {
    throw errorFor(response.status, await parseError(response));
  }
  return readDownloadBlob(response, { signal, onProgress });
}

/* Token-less RomM API request (succeeds only when server kiosk/guest access allows). */
export function publicRequest(path, options = {}) {
  return rawRequest(path, { ...options, auth: false, retry: false });
}

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

const cache = new Map();

export async function cached(key, loader, ttl = CACHE_TTL) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearCache() {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

export function assetUrl(path) {
  if (!path || typeof path !== "string") return null;
  if (path.startsWith("/")) return `${ROMM_ORIGIN}${path}`;
  try {
    const url = new URL(path, ROMM_ORIGIN);
    if (url.origin === ROMM_ORIGIN) return url.href;
  } catch {
    /* ignore */
  }
  return null;
}

export function coverUrl(rom, size = "large") {
  if (!rom) return null;
  if (rom.coverUrl) return rom.coverUrl;
  const path =
    size === "small"
      ? rom.path_cover_small || rom.path_cover_large
      : rom.path_cover_large || rom.path_cover_small;
  return assetUrl(path);
}

export function screenshotUrl(path) {
  return assetUrl(path);
}

export function avatarUrl(user) {
  return assetUrl(user?.avatar_path);
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export function hasSignupRelay() {
  return Boolean(String(SIGNUP_RELAY_URL || "").trim());
}

export function relayUrl(path = "") {
  const base = String(SIGNUP_RELAY_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${base}${suffix}`;
}

async function relayRequest(path, { method = "GET", body, auth = false, signal, timeout = 12_000 } = {}) {
  const base = String(SIGNUP_RELAY_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new ApiError(t("Signup relay is not configured."), { status: 0 });
  }
  const headers = { Accept: "application/json" };
  let requestBody;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  if (auth) {
    headers.Authorization = `Bearer ${await accessToken()}`;
  }
  const { signal: mergedSignal, done } = mergeSignals(timeout, signal);
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: requestBody,
      signal: mergedSignal,
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
    });
  } catch (error) {
    done();
    if (isAbortError(error) || error?.name === "TimeoutError") {
      if (signal?.aborted) throw error;
      throw new ApiError(t("Signup relay timed out."), { status: 0, cause: error, retryable: true });
    }
    throw new ApiError(t("Couldn't reach the signup relay."), { status: 0, cause: error, retryable: true });
  }
  done();
  if (!response.ok) {
    const detail = await parseError(response);
    throw errorFor(response.status, detail);
  }
  return response.json();
}

export const api = {
  heartbeat() {
    return rawRequest("/heartbeat", { auth: false, timeout: 10_000 });
  },

  register({ username, email, password, token }) {
    if (hasSignupRelay()) {
      return relayRequest("/register", {
        method: "POST",
        body: { username, email, password, token },
        timeout: 20_000,
      });
    }
    return rawRequest("/users/register", {
      method: "POST",
      body: { username, email, password, token },
      auth: false,
      timeout: 20_000,
    });
  },

  me() {
    return rawRequest("/users/me");
  },

  permissions() {
    return rawRequest("/permissions/me");
  },

  logout() {
    return rawRequest("/logout", { method: "POST", timeout: 8000 }).catch(() => null);
  },

  platforms() {
    return cached("platforms", () => rawRequest("/platforms"));
  },

  platform(id) {
    return rawRequest(`/platforms/${encodeURIComponent(id)}`);
  },

  filters() {
    return rawRequest("/roms/filters");
  },

  stats() {
    return rawRequest("/stats");
  },

  roms(params = {}, { cacheKey, signal } = {}) {
    const load = () => rawRequest("/roms", { query: params, signal });
    return cacheKey ? cached(`roms:${cacheKey}`, load) : load();
  },

  rom(id, { signal } = {}) {
    return rawRequest(`/roms/${encodeURIComponent(id)}`, { signal });
  },

  romSimple(id, { signal } = {}) {
    return rawRequest(`/roms/${encodeURIComponent(id)}/simple`, { signal });
  },

  romFiles(id, { signal } = {}) {
    return rawRequest(`/roms/${encodeURIComponent(id)}/files`, { signal });
  },

  randomRom(platformIds) {
    return rawRequest("/roms/random", {
      query: { platform_ids: platformIds },
    });
  },

  playSessions(params = {}, { signal } = {}) {
    return rawRequest("/play-sessions", { query: params, signal });
  },

  activity() {
    return rawRequest("/activity");
  },

  saves(romId, { signal } = {}) {
    return rawRequest("/saves", { query: { rom_id: romId }, signal });
  },

  states(romId, { signal } = {}) {
    return rawRequest("/states", { query: { rom_id: romId }, signal });
  },

  savesSummary(romId) {
    return rawRequest("/saves/summary", { query: { rom_id: romId } });
  },

  downloadSave(id) {
    return rawRequest(`/saves/${encodeURIComponent(id)}/content`, {
      responseType: "blob",
      timeout: 120_000,
    });
  },

  downloadState(id) {
    return rawRequest(`/states/${encodeURIComponent(id)}/content`, {
      responseType: "blob",
      timeout: 120_000,
    });
  },

  uploadSave({ romId, blob, fileName, emulator, slot, device }) {
    const form = new FormData();
    form.append("saveFile", blob, fileName || "save.sav");
    return rawRequest("/saves", {
      method: "POST",
      query: {
        rom_id: romId,
        emulator: emulator || undefined,
        slot: slot || undefined,
        device_id: device || deviceId(),
        overwrite: true,
      },
      body: form,
      timeout: 120_000,
    });
  },

  uploadState({ romId, blob, fileName, emulator, device }) {
    const form = new FormData();
    form.append("stateFile", blob, fileName || "state.state");
    return rawRequest("/states", {
      method: "POST",
      query: {
        rom_id: romId,
        emulator: emulator || undefined,
        device_id: device || deviceId(),
      },
      body: form,
      timeout: 120_000,
    });
  },

  confirmSaveDownloaded(id, device = deviceId()) {
    return rawRequest(`/saves/${encodeURIComponent(id)}/downloaded`, {
      method: "POST",
      query: { device_id: device },
    }).catch(() => null);
  },

  updateRomUser(id, data = {}, { updateLastPlayed = false } = {}) {
    return rawRequest(`/roms/${encodeURIComponent(id)}/props`, {
      method: "PUT",
      query: updateLastPlayed ? { update_last_played: true } : undefined,
      body: data,
    });
  },

  recordPlaySession(sessions) {
    return rawRequest("/play-sessions", {
      method: "POST",
      body: { device_id: deviceId() || null, sessions },
      keepalive: true,
      timeout: 15_000,
    }).catch(() => null);
  },

  users({ signal } = {}) {
    return rawRequest("/users", { signal });
  },

  createInviteLink({ role = "user", expiration = 3600 } = {}, { signal } = {}) {
    return rawRequest("/users/invite-link", {
      method: "POST",
      query: { role, expiration },
      signal,
      timeout: 20_000,
    });
  },

  relayInvite({ signal } = {}) {
    return relayRequest("/invite", { signal });
  },

  relayClaim(claimId, { signal } = {}) {
    return relayRequest("/claim", { method: "POST", body: { claimId }, signal });
  },

  relayRegistered(token) {
    if (!hasSignupRelay() || !token) return Promise.resolve(null);
    return relayRequest("/registered", { method: "POST", body: { token }, timeout: 6_000 }).catch(() => null);
  },

  relayAdminState({ signal } = {}) {
    return relayRequest("/admin/state", { auth: true, signal });
  },

  relaySetEnabled(enabled, { signal } = {}) {
    return relayRequest("/admin/state", { method: "POST", body: { enabled: Boolean(enabled) }, auth: true, signal });
  },

  relayRotate({ signal } = {}) {
    return relayRequest("/admin/rotate", { method: "POST", auth: true, signal });
  },

  settings({ signal } = {}) {
    return relayRequest("/settings", { signal, timeout: 10_000 });
  },

  saveSettings(settings, { signal } = {}) {
    return relayRequest("/settings", {
      method: "POST",
      body: settings,
      auth: true,
      signal,
      timeout: 12_000,
    });
  },

  /* Trial endpoints are served by the relay Worker (no RomM-origin calls from guest). */
  trialMeta({ signal } = {}) {
    return relayRequest("/trial/meta", { signal, timeout: 12_000 });
  },
};

/* Build the playable file list deterministically. */
export function romFileChoices(rom) {
  const files = Array.isArray(rom?.files) ? [...rom.files] : [];
  if (!files.length) return [];
  files.sort((a, b) => String(a.file_name || "").localeCompare(String(b.file_name || "")));
  return files;
}

export function romContentUrl(rom, file) {
  const fileName =
    file?.file_name ||
    (rom?.has_nested_single_file && rom?.files?.length === 1
      ? rom.files[0].file_name
      : rom?.fs_name);
  const encoded = encodeURIComponent(fileName || "");
  const query = new URLSearchParams({ purpose: "play" });
  if (file?.id) query.set("file_ids", String(file.id));
  return `${API_BASE}/roms/${encodeURIComponent(rom.id)}/content/${encoded}?${query}`;
}

export function firmwareUrl(firmware) {
  if (!firmware?.id || !firmware?.file_name) return null;
  return `${API_BASE}/firmware/${encodeURIComponent(firmware.id)}/content/${encodeURIComponent(
    firmware.file_name,
  )}`;
}
