import { avatarUrl, getSession, isAdmin } from "../api.js";
import {
  el,
  icon,
  cartridgeMini,
  siteFooter,
  toast,
} from "../components.js";
import {
  stockAccountUrl,
  stockAdminUrl,
  ROMM_ORIGIN,
} from "../config.js";
import { logout, userInitials, userLabel } from "../auth.js";

export function profileView() {
  const session = getSession();
  const user = session?.user || {};
  const admin = isAdmin(session);
  const root = el("div", { class: "view wrap profile-view" });
  const avatar = avatarUrl(user);

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
    "Switch paper tone",
    el("span", { class: "chev" }, "↔"),
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
            toast("Install from your browser menu: Add to Home screen.", { duration: 5000 });
            return;
          }
          prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice?.outcome === "accepted") toast("Binus Arcade added to your home screen.", { tone: "success" });
          window.__binusarcadeInstallPrompt = null;
        },
      },
    },
    el("span", { class: "profile-row-icon" }, icon("download", 18)),
    "Install on this phone",
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
    "Sign out",
    el("span", { class: "chev" }, "→"),
  );

  root.append(
    el("div", { class: "eyebrow" }, "Player card"),
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
          el("span", { class: "washi-tape" }, admin ? "Admin" : "Player"),
          user.last_login ? el("span", { class: "washi-tape mint" }, `Last login ${new Date(user.last_login).toLocaleDateString()}`) : null,
        ),
      ),
    ),
    el(
      "section",
      { class: "section" },
      el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, "Settings")),
      el(
        "div",
        { class: "profile-list" },
        themeToggle,
        installButton,
        el(
          "a",
          { class: "profile-row", href: stockAccountUrl(), target: "_blank", rel: "noopener noreferrer" },
          el("span", { class: "profile-row-icon" }, icon("user", 18)),
          "RomM account",
          el("span", { class: "chev" }, "↗"),
        ),
        admin
          ? el(
              "a",
              { class: "profile-row", href: stockAdminUrl(), target: "_blank", rel: "noopener noreferrer" },
              el("span", { class: "profile-row-icon" }, icon("settings", 18)),
              "Admin console",
              el("span", { class: "chev" }, "↗"),
            )
          : null,
        logoutButton,
      ),
    ),
    el(
      "section",
      { class: "section" },
      el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, "Personal shelf")),
      el(
        "div",
        { class: "block" },
        el(
          "p",
          { class: "note" },
          "Favorites, collections, ratings and the backlog are a v2 feature. Until then, the same account can manage them in stock RomM.",
        ),
        el(
          "div",
          { class: "stub-actions" },
          el(
            "a",
            { class: "btn btn-keycap-sm btn-yellow", href: `${ROMM_ORIGIN}`, target: "_blank", rel: "noopener noreferrer" },
            "Open stock RomM",
            icon("external", 14),
          ),
        ),
      ),
    ),
    siteFooter(),
  );

  return root;
}

export function scoresView() {
  const root = el("div", { class: "view wrap" });
  root.append(
    el(
      "section",
      { class: "block stub-card" },
      el("div", { class: "eyebrow" }, "Coming in v3"),
      cartridgeMini(),
      el("h1", { class: "marker" }, "High scores"),
      el(
        "p",
        { class: "note" },
        "Leaderboards and player stats are coming in a later update. Your playtime is already tracked in RomM.",
      ),
      el(
        "div",
        { class: "stub-actions" },
        el("a", { class: "btn btn-keycap btn-mint", href: "#/library" }, icon("grid", 18), "Browse the library"),
        el("a", { class: "btn btn-keycap-sm btn-ghost", href: "#/" }, "Back to Home"),
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
          el("div", { class: "eyebrow" }, "M5 · role gated"),
          el("h1", { class: "marker" }, "Admin console"),
          el(
            "p",
            { class: "note" },
            "The v1 app deliberately doesn't clone RomM's admin screens. Server administration stays in stock RomM, where permissions are enforced.",
          ),
          el(
            "div",
            { class: "stub-actions" },
            el(
              "a",
              { class: "btn btn-keycap btn-mint", href: stockAdminUrl(), target: "_blank", rel: "noopener noreferrer" },
              "Open RomM admin",
              icon("external", 16),
            ),
            el("a", { class: "btn btn-keycap-sm btn-ghost", href: "#/me" }, "Back to Me"),
          ),
        )
      : el(
          "section",
          { class: "block stub-card" },
          el("div", { class: "eyebrow" }, "Members only"),
          el("h1", { class: "marker" }, "No keys"),
          el(
            "p",
            { class: "note" },
            "This shelf is for RomM admins. Your account doesn't have the admin role, so the door stays shut.",
          ),
          el(
            "div",
            { class: "stub-actions" },
            el("a", { class: "btn btn-keycap btn-yellow", href: "#/me" }, "Back to Me"),
          ),
        ),
    siteFooter(),
  );
  return root;
}
