import {
  api,
  clearCache,
  clearSession,
  getSession,
  hasSession,
  isAdmin,
  requestToken,
  setSession,
  updateSession,
} from "./api.js";

export { getSession, hasSession, isAdmin };

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function login(username, password) {
  const tokens = await requestToken(username, password);
  const session = { tokens, saved_at: Date.now(), user: null, permissions: null };
  setSession(session);

  try {
    const [user, permissions] = await Promise.all([
      api.me(),
      api.permissions().catch(() => null),
    ]);
    const next = updateSession({ user, permissions });
    emit("binusarcade:auth", next);
    return next;
  } catch (error) {
    clearSession();
    throw error;
  }
}

/* Restore a session that already holds a token. Uses the cached user for
 * immediate boot; verifies and refreshes it in the background. */
export async function restoreSession({ background = false } = {}) {
  const session = getSession();
  if (!session?.tokens?.access_token) return null;

  if (background && session.user) {
    api
      .me()
      .then((user) => updateSession({ user }))
      .catch(() => {
        /* the session-expired event handles hard auth failures */
      });
    return session;
  }

  try {
    const [user, permissions] = await Promise.all([
      api.me(),
      api.permissions().catch(() => null),
    ]);
    const next = updateSession({ user, permissions });
    emit("binusarcade:auth", next);
    return next;
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) clearSession();
    throw error;
  }
}

export async function logout() {
  await api.logout();
  clearSession();
  clearCache();
  emit("binusarcade:auth", null);
}

export function userLabel(user = getSession()?.user) {
  return user?.username || "Player";
}

export function userInitials(user = getSession()?.user) {
  const name = userLabel(user);
  return name.slice(0, 2).toUpperCase();
}
