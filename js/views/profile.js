import {
  api,
  avatarUrl,
  getSession,
  hasSignupRelay,
  isAdmin,
  isPersistentSession,
  isRoleAdmin,
  setPersistentSession,
} from "../api.js";
import {
  clear,
  el,
  icon,
  cartridgeMini,
  langSwitch,
  siteFooter,
  toast,
} from "../components.js";
import {
  stockAccountUrl,
  stockAdminUrl,
  ROMM_ORIGIN,
} from "../config.js";
import { logout, userInitials, userLabel } from "../auth.js";
import { t } from "../i18n.js";
import { createSignupPanel } from "./signup.js";

export function profileView() {
  const session = getSession();
  const user = session?.user || {};
  const admin = isAdmin(session);
  const roleAdmin = isRoleAdmin(session);
  const root = el("div", { class: "view wrap profile-view" });
  const avatar = avatarUrl(user);
  const relayEnabled = hasSignupRelay();
  const signupSlot = el("div", { class: "signup-slot", "data-signup-slot": "", hidden: true });
  let signupPanel = null;
  let userToggled = false;
  let stateController = null;

  function closeSignupPanel() {
    signupPanel?.cleanup?.();
    signupPanel = null;
    clear(signupSlot);
    signupSlot.hidden = true;
  }

  const avatarNode = el(
    "span",
    { class: "profile-avatar", "aria-hidden": "true" },
    avatar
      ? el("img", { src: avatar, alt: "", loading: "eager" })
      : userInitials(user),
  );

  const themeToggle = el(
    "button",
    {
      class: "profile-row",
      type: "button",
      "data-theme-toggle": "",
      "aria-pressed": "false",
    },
    el("span", { class: "profile-row-icon" }, icon("moon", 18)),
    t("Switch theme"),
    el("span", { class: "chev" }, "↔"),
  );

  const languageSwitch = langSwitch();

  const languageRow = el(
    "div",
    { class: "profile-row profile-lang-row" },
    el("span", { class: "profile-row-icon" }, icon("book", 18)),
    el(
      "span",
      { class: "profile-switch-copy" },
      el("span", { class: "profile-switch-title" }, t("Language")),
      el("span", { class: "profile-switch-note" }, t("Applies to every screen.")),
    ),
    languageSwitch,
  );

  const persistSwitch = el(
    "button",
    {
      class: "profile-row profile-switch",
      type: "button",
      role: "switch",
      "aria-checked": isPersistentSession() ? "true" : "false",
      "data-persist-switch": "",
      on: {
        click: (event) => {
          const button = event.currentTarget;
          const next = button.getAttribute("aria-checked") !== "true";
          button.setAttribute("aria-checked", next ? "true" : "false");
          setPersistentSession(next);
          toast(
            next
              ? t("Staying signed in on this device.")
              : t("You'll be signed out when you close the browser."),
            { tone: "success" },
          );
        },
      },
    },
    el("span", { class: "profile-row-icon" }, icon("lock", 18)),
    el(
      "span",
      { class: "profile-switch-copy" },
      el("span", { class: "profile-switch-title" }, t("Stay signed in")),
      el("span", { class: "profile-switch-note" }, t("Keeps you signed in after you close the browser.")),
    ),
    el(
      "span",
      { class: "switch-track", "aria-hidden": "true" },
      el("span", { class: "switch-thumb" }),
    ),
  );

  const installButton = el(
    "button",
    {
      class: "profile-row",
      type: "button",
      on: {
        click: async () => {
          const prompt = window.__binusarcadeInstallPrompt;
          if (!prompt) {
            toast(t("Install from your browser menu: Add to Home screen."), { duration: 5000 });
            return;
          }
          prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice?.outcome === "accepted") toast(t("Binus Arcade added to your home screen."), { tone: "success" });
          window.__binusarcadeInstallPrompt = null;
        },
      },
    },
    el("span", { class: "profile-row-icon" }, icon("download", 18)),
    t("Install on this phone"),
    el("span", { class: "chev" }, "→"),
  );

  const logoutButton = el(
    "button",
    {
      class: "profile-row",
      type: "button",
      on: {
        click: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await logout();
          } finally {
            button.disabled = false;
          }
        },
      },
    },
    el("span", { class: "profile-row-icon" }, icon("logout", 18)),
    t("Sign out"),
    el("span", { class: "chev" }, "→"),
  );

  const switchNote = el(
    "span",
    { class: "profile-switch-note" },
    relayEnabled ? t("Checking status…") : t("Off by default · Single-use player invite"),
  );

  function openSignupPanel(initialState = null) {
    closeSignupPanel();
    signupPanel = createSignupPanel({
      showFullScreen: true,
      initialState,
      onRelayDisabled: () => {
        if (signupSwitch) signupSwitch.setAttribute("aria-checked", "false");
        if (relayEnabled) switchNote.textContent = t("Off · Create account asks for admin code");
        closeSignupPanel();
      },
    });
    signupSlot.append(signupPanel.el);
    signupSlot.hidden = false;
    if (relayEnabled) switchNote.textContent = t("Enabled · Anyone on Create account sees QR");
  }

  const signupSwitch = roleAdmin
    ? el(
        "button",
        {
          class: "profile-row profile-switch",
          type: "button",
          role: "switch",
          "aria-checked": "false",
          "data-signup-switch": "",
          on: {
            click: async (event) => {
              const button = event.currentTarget;
              userToggled = true;
              const nextOpen = button.getAttribute("aria-checked") !== "true";
              button.setAttribute("aria-checked", nextOpen ? "true" : "false");
              if (nextOpen) {
                openSignupPanel();
              } else {
                closeSignupPanel();
                if (relayEnabled) {
                  switchNote.textContent = t("Off · Create account asks for admin code");
                  button.disabled = true;
                  try {
                    await api.relaySetEnabled(false);
                  } catch (error) {
                    toast(error?.detail || error?.message || t("Couldn't disable shared signup QR."));
                    button.setAttribute("aria-checked", "true");
                    openSignupPanel();
                  } finally {
                    button.disabled = false;
                  }
                }
              }
            },
          },
        },
        el("span", { class: "profile-row-icon" }, icon("qr", 18)),
        el(
          "span",
          { class: "profile-switch-copy" },
          el("span", { class: "profile-switch-title" }, t("Signup QR panel")),
          switchNote,
        ),
        el(
          "span",
          { class: "switch-track", "aria-hidden": "true" },
          el("span", { class: "switch-thumb" }),
        ),
      )
    : null;

  if (roleAdmin && relayEnabled) {
    stateController = new AbortController();
    api
      .relayAdminState({ signal: stateController.signal })
      .then((state) => {
        if (userToggled || stateController?.signal.aborted) return;
        if (state?.enabled) {
          signupSwitch?.setAttribute("aria-checked", "true");
          openSignupPanel(state);
        } else {
          signupSwitch?.setAttribute("aria-checked", "false");
          switchNote.textContent = t("Off · Create account asks for admin code");
        }
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        switchNote.textContent = t("Relay unreachable · Try toggling again");
      });
  }

  root.append(
    el("div", { class: "eyebrow" }, t("Account")),
    el(
      "section",
      { class: "profile-head block" },
      avatarNode,
      el(
        "div",
        { class: "profile-copy" },
        el("h1", {}, userLabel(user)),
        el(
          "div",
          { class: "library-head-notes" },
          el("span", { class: "washi-tape" }, admin ? t("Admin") : t("Player")),
          user.last_login ? el("span", { class: "washi-tape mint" }, t("Last login {date}", { date: new Date(user.last_login).toLocaleDateString() })) : null,
        ),
      ),
    ),
    el(
      "section",
      { class: "section" },
      el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, t("Settings"))),
      el(
        "div",
        { class: "profile-list" },
        themeToggle,
        languageRow,
        persistSwitch,
        installButton,
        el(
          "a",
          { class: "profile-row", href: stockAccountUrl(), target: "_blank", rel: "noopener noreferrer" },
          el("span", { class: "profile-row-icon" }, icon("user", 18)),
          t("RomM account"),
          el("span", { class: "chev" }, "↗"),
        ),
        admin
          ? el(
              "a",
              { class: "profile-row", href: stockAdminUrl(), target: "_blank", rel: "noopener noreferrer" },
              el("span", { class: "profile-row-icon" }, icon("settings", 18)),
              t("Admin console"),
              el("span", { class: "chev" }, "↗"),
            )
          : null,
        roleAdmin ? signupSwitch : null,
        logoutButton,
      ),
      roleAdmin ? signupSlot : null,
    ),
    el(
      "section",
      { class: "section" },
      el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, t("Personal shelf"))),
      el(
        "div",
        { class: "block" },
        el(
          "p",
          { class: "note" },
          t("Track your progress, ratings, and play history across the library."),
        ),
        el(
          "div",
          { class: "stub-actions" },
          el("a", { class: "btn btn-keycap-sm btn-yellow", href: "#/shelf" }, icon("book", 16), t("Open shelf")),
          el(
            "a",
            { class: "btn btn-keycap-sm btn-ghost", href: `${ROMM_ORIGIN}`, target: "_blank", rel: "noopener noreferrer" },
            t("Manage in stock RomM"),
            icon("external", 14),
          ),
        ),
      ),
    ),
    siteFooter(),
  );

  return {
    el: root,
    cleanup() {
      stateController?.abort();
      closeSignupPanel();
    },
  };
}

export function scoresView() {
  const root = el("div", { class: "view wrap" });
  root.append(
    el(
      "section",
      { class: "block stub-card" },
      el("div", { class: "eyebrow" }, t("Coming in v3")),
      cartridgeMini(),
      el("h1", { class: "marker" }, t("High scores")),
      el(
        "p",
        { class: "note" },
        t(
          "Leaderboards and player stats are coming in a later update. Your playtime is already tracked in RomM.",
        ),
      ),
      el(
        "div",
        { class: "stub-actions" },
        el("a", { class: "btn btn-keycap btn-mint", href: "#/library" }, icon("grid", 18), t("Browse the library")),
        el("a", { class: "btn btn-keycap-sm btn-ghost", href: "#/" }, t("Back to Home")),
      ),
    ),
    siteFooter(),
  );
  return root;
}

export function adminView() {
  const session = getSession();
  const admin = isAdmin(session);
  const root = el("div", { class: "view wrap" });

  root.append(
    admin
      ? el(
          "section",
          { class: "block stub-card" },
          el("div", { class: "eyebrow" }, t("This area is for admins.")),
          el("h1", { class: "marker" }, t("Admin console")),
          el(
            "p",
            { class: "note" },
            t(
              "The v1 app deliberately doesn't clone RomM's admin screens. Server administration stays in stock RomM, where permissions are enforced.",
            ),
          ),
          el(
            "div",
            { class: "stub-actions" },
            el(
              "a",
              { class: "btn btn-keycap btn-mint", href: stockAdminUrl(), target: "_blank", rel: "noopener noreferrer" },
              t("Open RomM admin"),
              icon("external", 16),
            ),
            el("a", { class: "btn btn-keycap-sm btn-ghost", href: "#/me" }, t("Back to Me")),
          ),
        )
      : el(
          "section",
          { class: "block stub-card" },
          el("div", { class: "eyebrow" }, t("Members only")),
          el("h1", { class: "marker" }, t("No access yet.")),
          el(
            "p",
            { class: "note" },
            t(
              "This shelf is for RomM admins. Your account doesn't have the admin role, so the door stays shut.",
            ),
          ),
          el(
            "div",
            { class: "stub-actions" },
            el("a", { class: "btn btn-keycap btn-yellow", href: "#/me" }, t("Back to Me")),
          ),
        ),
    siteFooter(),
  );
  return root;
}
