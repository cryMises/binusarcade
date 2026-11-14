import { avatarUrl, getSession, hasSession, isAdmin, isPersistentSession, setPersistentSession } from "./api.js";
import { login, logout, restoreSession, userInitials, userLabel } from "./auth.js";
import {
  cover,
  el,
  icon,
  langSwitch,
  toast,
} from "./components.js";
import { APP_VERSION, FEATURES, ROMM_ORIGIN } from "./config.js";
import { initI18n, locale, setLocale, t } from "./i18n.js";
import { addRoute, readHash, rerender, startRouter } from "./router.js";
import { applyTheme, currentTheme, initTheme } from "./theme.js";
import { adminView, profileView, scoresView } from "./views/profile.js";
import { detailView } from "./views/detail.js";
import { homeView } from "./views/home.js";
import { libraryView } from "./views/library.js";
import { shelfView } from "./views/shelf.js";
import { registerView } from "./views/register.js";
import { signupView } from "./views/signup.js";
import { shortPlatformLabel } from "./config.js";
import { fetchTrialSettings, resolveTrial, trialView } from "./views/trial.js";

const app = document.getElementById("app");
let routerStarted = false;
let registerCleanup = null;
let chrome = null;

const NAV_ITEMS = [
  { key: "home", href: "#/", label: "Home", icon: "home" },
  { key: "library", href: "#/library", label: "Library", icon: "grid" },
  { key: "shelf", href: "#/shelf", label: "Shelf", icon: "book" },
  { key: "me", href: "#/me", label: "Me", icon: "user" },
];

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

let publicSettings = null;
let trialState = null;
let trialRouteStarted = false;
let signedOutRender = 0;

async function loadPublicState({ force = false } = {}) {
  /* A trial that failed to resolve once (cold Worker, flaky network) must not
   * stay "off" until reload: retry while settings still enable it. */
  const retryTrial = Boolean(publicSettings?.trialEnabled && publicSettings?.trialGameId && !trialState);
  if (!force && publicSettings && !retryTrial) return { settings: publicSettings, trial: trialState };
  /* Don't cache a transient relay failure as "no trial": logins would keep
   * hiding the trial until a full reload. */
  const settings = await fetchTrialSettings({ strict: true });
  publicSettings = settings;
  trialState = await resolveTrial(settings).catch(() => null);
  document.documentElement.dataset.publicSettings = "ready";
  return { settings: publicSettings, trial: trialState };
}

async function renderSignedOut() {
  const renderId = ++signedOutRender;
  const { path } = readHash();
  const params = new URLSearchParams(window.location.search);
  const hasInvite = params.has("token") || params.has("claim");

  if (path === "/trial") {
    /* Avoid tearing down an active trial (e.g. during gameplay) on re-renders. */
    if (app.querySelector("[data-trial-view]") && registerCleanup) {
      document.title = `${t("Try one game")} · Binus Arcade`;
      return;
    }
    registerCleanup?.();
    registerCleanup = null;
    let { trial } = await loadPublicState().catch(() => ({ trial: trialState }));
    if (!trial?.rom) {
      ({ trial } = await loadPublicState({ force: true }).catch(() => ({ trial: null })));
    }
    if (renderId !== signedOutRender || hasSession()) return;
    if (!trial?.rom) {
      renderLogin(t("The trial game isn't available right now. Sign in for the full library."));
      if (location.hash === "#/trial") history.replaceState(null, "", "#/");
      return;
    }
    const view = trialView({ path, query: readHash().query }, trial);
    registerCleanup = view?.cleanup || null;
    app.replaceChildren(view?.el || view);
    document.title = `${t("Try one game")} · Binus Arcade`;
    return;
  }

  if (path === "/register" || (!window.location.hash && hasInvite)) {
    registerCleanup?.();
    const { settings } = await loadPublicState().catch(() => ({ settings: { registrationEnabled: true } }));
    if (renderId !== signedOutRender || hasSession()) return;
    if (settings?.registrationEnabled === false && !hasInvite) {
      registerCleanup = null;
      renderLogin(t("Registration is currently closed. Ask the admin for access."));
      return;
    }
    const view = registerView();
    registerCleanup = view.cleanup || null;
    app.replaceChildren(view.el);
    document.title = `${t("Create account")} · Binus Arcade`;
    return;
  }

  registerCleanup?.();
  registerCleanup = null;
  /* Try to apply public settings quickly without blocking sign-in. */
  const quick = Promise.race([
    loadPublicState(),
    new Promise((resolve) => setTimeout(() => resolve(null), 900)),
  ]);
  const initial = await quick.catch(() => null);
  if (renderId !== signedOutRender || hasSession()) return;
  if (initial?.settings) {
    renderLogin("", initial);
  } else {
    renderLogin();
    loadPublicState()
      .then(({ settings, trial }) => {
        if (renderId !== signedOutRender || hasSession()) return;
        if (readHash().path !== "/") return;
        renderLogin("", { settings, trial });
      })
      .catch(() => {
        /* fail soft: keep sign-in/register-per-default */
      });
  }
}

function onSignedOutHash() {
  if (hasSession()) {
    window.removeEventListener("hashchange", onSignedOutHash);
    return;
  }
  renderSignedOut();
}

async function boot() {
  initI18n();
  initTheme();
  bindGlobalEvents();
  registerServiceWorker();

  if (!hasSession()) {
    renderSignedOut();
    window.addEventListener("hashchange", onSignedOutHash);
    return;
  }

  const session = getSession();

  if (session?.user) {
    mountShell();
    restoreSession({ background: true }).catch((error) => {
      if (error?.status === 401 || error?.status === 403) return;
      /* Network failures keep the cached shell usable. */
      toast(t("Couldn't refresh the session. Cached data may be stale."), { tone: "warn" });
    });
    return;
  }

  renderBoot(t("Checking your session…"));
  try {
    await restoreSession();
    mountShell();
  } catch (error) {
    renderLogin(error?.message || t("The RomM server didn't answer. Try signing in again."));
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
        el("img", { class: "splash-logo", src: "./icons/icon.svg", alt: "", width: 72, height: 72, decoding: "async" }),
        el("h1", { class: "marker" }, "Binus Arcade"),
        el("p", { class: "note splash-note" }, note || t("Connecting to your library…")),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Login                                                              */
/* ------------------------------------------------------------------ */

function renderLogin(message = "", opts = {}) {
  const flash = message || takeFlash();
  document.title = `${t("Sign in")} · Binus Arcade`;

  const settings = opts.settings || publicSettings || { registrationEnabled: true };
  const trial = opts.trial !== undefined ? opts.trial : trialState;
  const registrationEnabled = settings?.registrationEnabled !== false;
  const showTrial = Boolean(trial?.rom && settings?.trialEnabled && settings?.trialGameId);

  const previousName = document.getElementById("login-username")?.value || "";

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
    value: previousName,
  });

  const password = el("input", {
    class: "input",
    id: "login-password",
    name: "password",
    type: "password",
    autocomplete: "current-password",
    required: true,
  });

  const passwordToggle = el(
    "button",
    {
      class: "password-toggle",
      type: "button",
      "aria-label": t("Show password"),
      "aria-pressed": "false",
      title: t("Show password"),
      on: {
        click: () => {
          const showing = password.type === "text";
          password.type = showing ? "password" : "text";
          const label = showing ? t("Show password") : t("Hide password");
          passwordToggle.setAttribute("aria-label", label);
          passwordToggle.setAttribute("aria-pressed", showing ? "false" : "true");
          passwordToggle.setAttribute("title", label);
          passwordToggle.replaceChildren(icon(showing ? "eye" : "eye-off", 18));
        },
      },
    },
    icon("eye", 18),
  );

  const passwordWrap = el("div", { class: "input-password-wrap" }, password, passwordToggle);

  const remember = el("input", {
    class: "check-input",
    id: "login-remember",
    name: "remember",
    type: "checkbox",
    checked: isPersistentSession(),
  });

  const rememberRow = el(
    "label",
    { class: "check-row", for: "login-remember" },
    remember,
    el(
      "span",
      { class: "check-copy" },
      el("span", { class: "check-title" }, t("Stay signed in on this device")),
      el("span", { class: "check-note" }, t("Best on your own phone or laptop.")),
    ),
  );

  const submit = el(
    "button",
    { class: "btn btn-primary", type: "submit" },
    icon("play", 18),
    t("Sign in"),
  );

  const form = el(
    "form",
    { class: "login-form" },
    el(
      "div",
      { class: "field" },
      el("label", { for: "login-username" }, t("RomM username")),
      username,
    ),
    el(
      "div",
      { class: "field" },
      el("label", { for: "login-password" }, t("Password")),
      passwordWrap,
    ),
    rememberRow,
    errorBox,
    submit,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!username.value.trim() || !password.value) {
      toast(t("Fill in both fields."), { tone: "warn" });
      return;
    }

    submit.disabled = true;
    submit.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), t("Signing in…"));
    form.querySelector(".login-error")?.remove();

    try {
      setPersistentSession(remember.checked);
      await login(username.value.trim(), password.value);
      password.value = "";
      if (!document.querySelector(".topbar")) mountShell();
    } catch (error) {
      submit.disabled = false;
      submit.replaceChildren(icon("play", 18), t("Sign in"));
      const msg =
        error?.status === 0
          ? t(
              "Can't reach the RomM server. Ask the server owner to allow this origin in ROMM_CORS_ALLOWED_ORIGINS, then try again.",
            )
          : error?.status === 401
            ? t("That username and password didn't match.")
            : error?.detail || error?.message || t("Couldn't sign in. Try again.");
      const box = el("div", { class: "login-error", role: "alert" }, icon("alert", 18), el("span", {}, msg));
      form.insertBefore(box, submit);
    }
  });

  const poster = el(
    "div",
    { class: "login-poster" },
    el("div", { class: "eyebrow" }, t("Self-hosted game library")),
    el("h1", { class: "hero-title" }, "Binus Arcade"),
    el(
      "p",
      { class: "note" },
      t("Your RomM library, tuned for a phone. Stats, shelves, and saves — no clutter."),
    ),
  );

  const registerRow = registrationEnabled
    ? el(
        "p",
        { class: "login-register-row" },
        t("Have an invite? "),
        el("a", { class: "login-register-link", href: "#/register" }, t("Create account")),
      )
    : null;

  const trialBlock = showTrial
    ? el(
        "section",
        { class: "login-trial block", "data-trial-block": "" },
        el("div", { class: "eyebrow" }, t("Try one game")),
        el(
          "div",
          { class: "login-trial-body", style: { display: "flex", gap: "12px", alignItems: "center", margin: "8px 0 12px" } },
          el("div", { style: { width: "72px", flex: "0 0 auto" } }, cover(trial.rom, { size: "small", eager: true })),
          el(
            "div",
            { class: "login-trial-copy", style: { minWidth: 0 } },
            el("strong", { style: { display: "block" } }, trial.rom.name || t("Trial game")),
            el("span", { class: "note" }, shortPlatformLabel(trial.rom)),
          ),
        ),
        el(
          "a",
          { class: "btn btn-keycap btn-mint", href: "#/trial" },
          icon("play", 18),
          t("Try one game"),
        ),
        el("p", { class: "note", style: { marginTop: "8px" } }, t("No login needed. Progress won't be saved.")),
      )
    : null;

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
          el(
            "div",
            { class: "login-card-top" },
            el("div", { class: "eyebrow" }, t("RomM account")),
            langSwitch(),
          ),
          el("h2", {}, t("Sign in")),
          el(
            "p",
            { class: "note" },
            t("Sign in with your RomM account. Your password never touches storage."),
          ),
          form,
          registerRow,
          trialBlock,
          el(
            "details",
            { class: "login-note login-help" },
            el("summary", {}, t("Trouble signing in?")),
            el(
              "p",
              {},
              t(
                "This site has to be allowed on your RomM server. If signing in fails, ask the server admin to add it to ",
              ),
              el("code", {}, "ROMM_CORS_ALLOWED_ORIGINS"),
              ".",
            ),
            el(
              "a",
              {
                class: "login-help-link",
                href: ROMM_ORIGIN,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              t("Open stock RomM"),
              icon("external", 13),
            ),
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
  window.removeEventListener("hashchange", onSignedOutHash);
  registerCleanup?.();
  registerCleanup = null;
  if (readHash().path === "/register") {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/`);
  }

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
      "aria-label": t("Switch to dark mode"),
      title: t("Switch to dark mode"),
    },
    el("span", { "data-icon-moon": "" }, icon("moon", 21)),
    el("span", { "data-icon-sun": "", hidden: true }, icon("sun", 21)),
  );

  const searchLink = el(
    "a",
    { class: "icon-btn", href: "#/library", "aria-label": t("Search the library") },
    icon("search", 21),
  );

  const avatarLink = el(
    "a",
    { class: "avatar", href: "#/me", "aria-label": t("Account for {name}", { name: userLabel(user) }) },
    avatar
      ? el("img", { src: avatar, alt: "", loading: "lazy" })
      : userInitials(user),
  );

  const navLinks = NAV_ITEMS.map((item) => ({
    item,
    top: navLink(item.key, item.href, item.label),
    bottom: navLink(item.key, item.href, item.label, item.icon),
  }));

  const topbar = el(
    "header",
    { class: "topbar" },
    el(
      "div",
      { class: "wrap topbar-inner" },
      el(
        "a",
        { class: "brand", href: "#/" },
        el("img", { class: "brand-badge", src: "./icons/icon.svg", alt: "", width: 34, height: 34, decoding: "async" }),
        el("span", { class: "brand-word" }, "Binus Arcade"),
      ),
      el(
        "nav",
        { class: "topbar-nav", "aria-label": t("Main") },
        ...navLinks.map((entry) => entry.top),
      ),
      el("div", { class: "topbar-actions" }, searchLink, langSwitch(), themeButton, avatarLink),
    ),
  );

  const netBanner = el(
    "div",
    { class: "net-banner", role: "status", hidden: navigator.onLine },
    t("Offline · cached shell only. Reconnect to load your library."),
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
    { class: "bottom-nav", "aria-label": t("Bottom") },
    ...navLinks.map((entry) => entry.bottom),
  );

  chrome = { navLinks, searchLink, avatarLink, netBanner, themeButton };

  app.replaceChildren(topbar, netBanner, main, bottomNav);

  if (!routerStarted) {
    addRoute("/", homeView);
    addRoute("/library", libraryView);
    addRoute("/platform/:slug", libraryView);
    addRoute("/game/:id", detailView);
    addRoute("/shelf", shelfView);
    addRoute("/scores", scoresView);
    addRoute("/me", profileView);
    addRoute("/admin", adminView);
    addRoute("/signup", signupView);
    addRoute("/register", (ctx) => {
      ctx.navigate("/", { replace: true });
      return el("div");
    });
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
    el("span", {}, t(label)),
  );
}

/* Every language pill reflects the active locale, wherever it was rendered. */
function syncLangSwitches() {
  document.querySelectorAll("button[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === locale()));
  });
}

/* Re-label the shell in place when the language changes. */
function refreshShell() {
  if (!chrome) return;
  syncLangSwitches();
  for (const { item, top, bottom } of chrome.navLinks) {
    for (const link of [top, bottom]) {
      const span = link.querySelector("span");
      if (span) span.textContent = t(item.label);
    }
  }
  chrome.searchLink.setAttribute("aria-label", t("Search the library"));
  chrome.avatarLink.setAttribute(
    "aria-label",
    t("Account for {name}", { name: userLabel(getSession()?.user || {}) }),
  );
  chrome.themeButton.setAttribute("aria-pressed", String(currentTheme() === "dark"));
  applyTheme(currentTheme());
  chrome.netBanner.textContent = t(
    "Offline · cached shell only. Reconnect to load your library.",
  );
  document.querySelectorAll(".topbar-nav").forEach((nav) => nav.setAttribute("aria-label", t("Main")));
  document.querySelectorAll(".bottom-nav").forEach((nav) => nav.setAttribute("aria-label", t("Bottom")));
}

function updateChrome({ path, route }) {
  let active = "home";
  if (path.startsWith("/library") || path.startsWith("/platform")) active = "library";
  else if (path.startsWith("/shelf")) active = "shelf";
  else if (path.startsWith("/scores")) active = "scores";
  else if (path.startsWith("/me") || path.startsWith("/admin") || path.startsWith("/signup")) active = "me";

  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  const titles = {
    "/": "Binus Arcade",
    "/library": t("Library"),
    "/platform/:slug": t("Platform"),
    "/game/:id": t("Game"),
    "/shelf": t("Shelf"),
    "/scores": t("Scores"),
    "/me": t("Account"),
    "/admin": t("Admin"),
    "/signup": t("Signup QR"),
  };
  if (route !== "/game/:id") {
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
    flashAndReload(event.detail?.message || t("Your session expired. Sign in again."));
  });

  window.addEventListener("binusarcade:auth", (event) => {
    if (event.detail === null) {
      flashAndReload(t("Signed out."));
      return;
    }
    if (!document.querySelector(".topbar")) {
      mountShell();
    }
  });

  window.addEventListener("binusarcade:lang", () => {
    syncLangSwitches();
    if (!hasSession()) {
      renderSignedOut();
      return;
    }
    if (!document.querySelector(".topbar")) {
      renderBoot();
      return;
    }
    refreshShell();
    rerender();
  });

  document.addEventListener("click", (event) => {
    const choice = event.target.closest?.("button[data-lang]");
    if (choice) {
      event.preventDefault();
      setLocale(choice.dataset.lang);
      return;
    }

    const external = event.target.closest?.('a[href^="http"]');
    if (external && !external.target) {
      external.target = "_blank";
      external.rel = "noopener noreferrer";
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__binusarcadeInstallPrompt = event;
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
