import { avatarUrl, getSession, hasSession, isAdmin } from "./api.js";
import { login, logout, restoreSession, userInitials, userLabel } from "./auth.js";
import {
  el,
  icon,
  toast,
} from "./components.js";
import { APP_VERSION, FEATURES, ROMM_ORIGIN } from "./config.js";
import { addRoute, startRouter } from "./router.js";
import { initTheme } from "./theme.js";
import { adminView, profileView, scoresView } from "./views/profile.js";
import { detailView } from "./views/detail.js";
import { homeView } from "./views/home.js";
import { libraryView } from "./views/library.js";
import { playView } from "./views/play.js";

const app = document.getElementById("app");
let routerStarted = false;

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

async function boot() {
  initTheme();
  bindGlobalEvents();
  registerServiceWorker();

  if (!hasSession()) {
    renderLogin();
    return;
  }

  const session = getSession();

  if (session?.user) {
    mountShell();
    restoreSession({ background: true }).catch((error) => {
      if (error?.status === 401 || error?.status === 403) return;
      /* Network failures keep the cached shell usable. */
      toast("Couldn't refresh the session. The shelf may be stale.", { tone: "warn" });
    });
    return;
  }

  renderBoot("Checking your player card…");
  try {
    await restoreSession();
    mountShell();
  } catch (error) {
    renderLogin(error?.message || "The RomM server didn't answer. Try signing in again.");
  }
}

function renderBoot(note) {
  app.replaceChildren(
    el(
      "div",
      { class: "boot-splash" },
      el(
        "div",
        { class: "splash-card" },
        el("span", { class: "tape-pin", "aria-hidden": "true" }),
        el("div", { class: "splash-cart", "aria-hidden": "true" }),
        el("h1", { class: "marker" }, "Binus Arcade"),
        el("p", { class: "note splash-note" }, note || "Blowing on the cartridge…"),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Login                                                              */
/* ------------------------------------------------------------------ */

function renderLogin(message = "") {
  const flash = message || takeFlash();
  document.title = "Sign in · Binus Arcade";

  const errorBox = flash
    ? el("div", { class: "login-error", role: "alert" }, icon("alert", 18), el("span", {}, flash))
    : null;

  const username = el("input", {
    class: "input",
    id: "login-username",
    name: "username",
    type: "text",
    autocomplete: "username",
    required: true,
    autocapitalize: "none",
    spellcheck: "false",
  });

  const password = el("input", {
    class: "input",
    id: "login-password",
    name: "password",
    type: "password",
    autocomplete: "current-password",
    required: true,
  });

  const submit = el(
    "button",
    { class: "btn btn-keycap btn-mint", type: "submit" },
    icon("play", 18),
    "Open the arcade",
  );

  const form = el(
    "form",
    { class: "login-form" },
    el(
      "div",
      { class: "field" },
      el("label", { for: "login-username" }, "RomM username"),
      username,
    ),
    el(
      "div",
      { class: "field" },
      el("label", { for: "login-password" }, "Password"),
      password,
    ),
    errorBox,
    submit,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!username.value.trim() || !password.value) {
      toast("Fill in both fields.", { tone: "warn" });
      return;
    }

    submit.disabled = true;
    const label = submit.querySelector("span");
    void label;
    submit.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), "Signing in…");
    form.querySelector(".login-error")?.remove();

    try {
      await login(username.value.trim(), password.value);
      password.value = "";
      mountShell();
    } catch (error) {
      submit.disabled = false;
      submit.replaceChildren(icon("play", 18), "Open the arcade");
      const message =
        error?.status === 0
          ? "Can't reach the RomM server. Ask the server owner to allow this origin in ROMM_CORS_ALLOWED_ORIGINS, then try again."
          : error?.status === 401
            ? "That username and password didn't match."
            : error?.detail || error?.message || "The arcade didn't open. Try again.";
      const box = el("div", { class: "login-error", role: "alert" }, icon("alert", 18), el("span", {}, message));
      form.insertBefore(box, submit);
    }
  });

  const poster = el(
    "div",
    { class: "login-poster" },
    el("div", { class: "eyebrow" }, "Your library, on the couch"),
    el("h1", { class: "hero-title" }, el("span", { class: "marker-line" }, "Binus Arcade")),
    el(
      "p",
      { class: "note" },
      "A paper-and-cartridge front end for the RomM shelf. Sign in with the same account you use on the server — browse 185 tapes, then play in the browser.",
    ),
    el(
      "div",
      { class: "login-tapes" },
      el("span", { class: "washi-tape" }, "Phone first"),
      el("span", { class: "washi-tape mint" }, "Save synced"),
      el("span", { class: "washi-tape blue" }, "No install"),
    ),
  );

  app.replaceChildren(
    el(
      "main",
      { class: "login-screen" },
      el(
        "div",
        { class: "login-wrap" },
        poster,
        el(
          "section",
          { class: "login-card" },
          el("span", { class: "tape-pin", "aria-hidden": "true" }),
          el("div", { class: "eyebrow" }, "Player check-in"),
          el("h2", {}, "Back to the Hall"),
          el("p", { class: "note" }, "Sign in with your RomM account. The password never touches storage."),
          form,
          el(
            "p",
            { class: "login-note" },
            "This is a self-hosted arcade. The server must allow this site in ",
            el("code", {}, "ROMM_CORS_ALLOWED_ORIGINS"),
            ". ",
            el(
              "a",
              { href: ROMM_ORIGIN, target: "_blank", rel: "noopener noreferrer" },
              "Open stock RomM",
            ),
            ".",
          ),
        ),
      ),
    ),
  );

  username.focus();
}

function takeFlash() {
  try {
    const message = sessionStorage.getItem("binusarcade.flash");
    if (message) sessionStorage.removeItem("binusarcade.flash");
    return message || "";
  } catch {
    return "";
  }
}

function flashAndReload(message) {
  try {
    sessionStorage.setItem("binusarcade.flash", message);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/* ------------------------------------------------------------------ */
/* Shell                                                              */
/* ------------------------------------------------------------------ */

function mountShell() {
  const session = getSession();
  const user = session?.user || {};
  const avatar = avatarUrl(user);

  const themeButton = el(
    "button",
    {
      class: "icon-btn",
      type: "button",
      "data-theme-toggle": "",
      "aria-pressed": "false",
      "aria-label": "Switch to dark mode",
      title: "Switch to dark mode",
    },
    el("span", { "data-icon-moon": "" }, icon("moon", 21)),
    el("span", { "data-icon-sun": "", hidden: true }, icon("sun", 21)),
  );

  const searchLink = el(
    "a",
    { class: "icon-btn", href: "#/library", "aria-label": "Search the library" },
    icon("search", 21),
  );

  const avatarLink = el(
    "a",
    { class: "avatar", href: "#/me", "aria-label": `Player card for ${userLabel(user)}` },
    avatar
      ? el("img", { src: avatar, alt: "", loading: "lazy" })
      : userInitials(user),
  );

  const topbar = el(
    "header",
    { class: "topbar" },
    el(
      "div",
      { class: "wrap topbar-inner" },
      el(
        "a",
        { class: "brand", href: "#/" },
        el("span", { class: "brand-badge", "aria-hidden": "true" }, "B"),
        el("span", { class: "brand-word" }, "Binus Arcade"),
      ),
      el(
        "nav",
        { class: "topbar-nav", "aria-label": "Main" },
        navLink("hall", "#/", "Hall"),
        navLink("library", "#/library", "Library"),
        navLink("scores", "#/scores", "Scores"),
        navLink("me", "#/me", "Me"),
      ),
      el("div", { class: "topbar-actions" }, searchLink, themeButton, avatarLink),
    ),
  );

  const netBanner = el(
    "div",
    { class: "net-banner", role: "status", hidden: navigator.onLine },
    "Offline · showing the last shelf. Reconnect to load games and sync saves.",
  );
  window.addEventListener("online", () => {
    netBanner.hidden = true;
  });
  window.addEventListener("offline", () => {
    netBanner.hidden = false;
  });

  const main = el("main", { id: "view" });
  const bottomNav = el(
    "nav",
    { class: "bottom-nav", "aria-label": "Bottom" },
    navLink("hall", "#/", "Hall", "home"),
    navLink("library", "#/library", "Library", "grid"),
    navLink("scores", "#/scores", "Scores", "trophy"),
    navLink("me", "#/me", "Me", "user"),
  );

  app.replaceChildren(topbar, netBanner, main, bottomNav);

  if (!routerStarted) {
    addRoute("/", homeView);
    addRoute("/library", libraryView);
    addRoute("/platform/:slug", libraryView);
    addRoute("/game/:id", detailView);
    addRoute("/play/:id", playView);
    addRoute("/scores", scoresView);
    addRoute("/me", profileView);
    addRoute("/admin", adminView);
    routerStarted = true;
    startRouter(main, updateChrome);
  } else {
    startRouter(main, updateChrome);
  }

  initTheme();
}

function navLink(key, href, label, iconName) {
  return el(
    "a",
    { href, dataset: { nav: key }, "data-nav": key },
    iconName ? icon(iconName, 21) : null,
    el("span", {}, label),
  );
}

function updateChrome({ path, route }) {
  document.body.classList.toggle("is-playing", path.startsWith("/play"));
  let active = "hall";
  if (path.startsWith("/library") || path.startsWith("/platform")) active = "library";
  else if (path.startsWith("/scores")) active = "scores";
  else if (path.startsWith("/me") || path.startsWith("/admin")) active = "me";

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  const titles = {
    "/": "Binus Arcade",
    "/library": "Library",
    "/platform/:slug": "System shelf",
    "/game/:id": "Game sleeve",
    "/play/:id": "Play",
    "/scores": "Scores",
    "/me": "Player card",
    "/admin": "Admin",
  };
  if (route !== "/game/:id" && route !== "/play/:id") {
    const title = titles[route] || "Binus Arcade";
    document.title = title === "Binus Arcade" ? title : `${title} · Binus Arcade`;
  }
  void isAdmin;
  void FEATURES;
  void APP_VERSION;
}

/* ------------------------------------------------------------------ */
/* Global listeners                                                   */
/* ------------------------------------------------------------------ */

function bindGlobalEvents() {
  window.addEventListener("binusarcade:session-expired", (event) => {
    flashAndReload(event.detail?.message || "Your session expired. Sign in again.");
  });

  window.addEventListener("binusarcade:auth", (event) => {
    if (event.detail === null) {
      flashAndReload("Signed out. See you at the next high score.");
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__binusarcadeInstallPrompt = event;
  });

  document.addEventListener("click", (event) => {
    const external = event.target.closest?.('a[href^="http"]');
    if (external && !external.target) {
      external.target = "_blank";
      external.rel = "noopener noreferrer";
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.name === "AbortError") return;
    console.error("Unhandled request", event.reason);
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!location.protocol.startsWith("http")) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((error) => {
    console.warn("Service worker registration skipped", error);
  });
}

/* Keep the logout import used by the profile view; boot the app. */
void logout;

boot();
