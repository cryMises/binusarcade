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
        params[part.slice(1)] = decodeURIComponent(segments[i]);
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
  div.className = "view wrap";
  const marker = document.createElement("h1");
  marker.className = "marker";
  marker.textContent = error ? "Couldn't load page" : "Page not found";
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = error
    ? "That page didn't load. Head back to Home and try again."
    : "That page doesn't exist.";
  const link = document.createElement("a");
  link.className = "btn btn-keycap btn-mint";
  link.href = "#/";
  link.textContent = "Back to Home";
  div.append(marker, note, link);
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
    setDocumentTitle("Page not found");
  } else {
    try {
      const result = await match.handler(ctx);
      if (result?.cleanup) currentCleanup = result.cleanup;
      node = result?.el || result?.node || result;
    } catch (error) {
      console.error("Route failed", error);
      node = fallback(error);
      setDocumentTitle("Couldn't load page");
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
