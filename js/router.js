import { t } from "./i18n.js";

const routes = [];
let mountNode = null;
let onRouteChange = null;
let currentCleanup = null;
let started = false;
let lastPath = "";

export function addRoute(pattern, handler) {
  const parts = pattern.split("/").filter(Boolean);
  routes.push({ pattern, parts, handler });
}

export function readHash() {
  const raw = (window.location.hash || "#/").replace(/^#/, "");
  const [pathPart, queryPart = ""] = raw.split("?");
  let path = pathPart || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  return { path, query: new URLSearchParams(queryPart), hash: raw };
}

function matchRoute(path) {
  const segments = path.split("/").filter(Boolean);
  for (const route of routes) {
    if (route.parts.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < route.parts.length; i += 1) {
      const part = route.parts[i];
      if (part.startsWith(":")) {
        try {
          params[part.slice(1)] = decodeURIComponent(segments[i]);
        } catch {
          ok = false;
          break;
        }
      } else if (part !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { ...route, params };
  }
  return null;
}

export function currentRoute() {
  const { path } = readHash();
  return matchRoute(path) || null;
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash === hash) {
    run();
    return;
  }
  if (replace) {
    history.replaceState(null, "", hash);
    run();
  } else {
    window.location.hash = hash;
  }
}

export function replaceQuery(path, params) {
  const query = params instanceof URLSearchParams ? params.toString() : String(params || "");
  const hash = `#${path.startsWith("/") ? path : `/${path}`}${query ? `?${query}` : ""}`;
  history.replaceState(null, "", hash);
}

export function setDocumentTitle(title) {
  document.title = title ? `${title} · Binus Arcade` : "Binus Arcade";
}

function fallback(error) {
  const div = document.createElement("div");
  div.className = "view wrap not-found-view";

  const card = document.createElement("section");
  card.className = "block stub-card not-found-card";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = error ? t("Something broke") : t("Not on this shelf");

  const marker = document.createElement("h1");
  marker.className = "marker";
  marker.textContent = error ? t("Couldn't load page") : t("Page not found");

  const note = document.createElement("p");
  note.className = "note";
  note.textContent = error
    ? t("That page didn't load. Head back to Home and try again.")
    : t("That page doesn't exist. The link may be old, or the game may have left the library.");

  const actions = document.createElement("div");
  actions.className = "stub-actions";
  const home = document.createElement("a");
  home.className = "btn btn-keycap btn-mint";
  home.href = "#/";
  home.textContent = t("Back to Home");
  const library = document.createElement("a");
  library.className = "btn btn-keycap btn-ghost";
  library.href = "#/library";
  library.textContent = t("Open the library");
  actions.append(home, library);

  card.append(eyebrow, marker, note, actions);
  div.append(card);
  return div;
}

async function run() {
  if (!mountNode) return;
  const { path, query } = readHash();
  const match = matchRoute(path);
  const ctx = {
    path,
    query,
    params: match?.params || {},
    route: match?.pattern || "not-found",
    navigate,
    replaceQuery,
  };

  try {
    currentCleanup?.();
  } catch (error) {
    console.error("View cleanup failed", error);
  }
  currentCleanup = null;

  if (path !== lastPath) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
  lastPath = path;

  let node = null;
  if (!match) {
    node = fallback();
    setDocumentTitle(t("Page not found"));
  } else {
    try {
      const result = await match.handler(ctx);
      if (result?.cleanup) currentCleanup = result.cleanup;
      node = result?.el || result?.node || result;
    } catch (error) {
      console.error("Route failed", error);
      node = fallback(error);
      setDocumentTitle(t("Couldn't load page"));
    }
  }

  if (node instanceof Node) mountNode.replaceChildren(node);
  onRouteChange?.({ ...ctx, route: match?.pattern || "not-found" });
}

export function startRouter(node, onRoute) {
  mountNode = node;
  onRouteChange = onRoute;
  if (started) {
    run();
    return;
  }
  started = true;
  window.addEventListener("hashchange", run);
  run();
}

export function rerender() {
  return run();
}
