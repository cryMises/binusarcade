import {
  api,
  avatarUrl,
  coverUrl,
  downloadBlob,
  getSession,
  hasSignupRelay,
  isAdmin,
  isPersistentSession,
  isRoleAdmin,
  relayUrl,
  setPersistentSession,
} from "../api.js";
import {
  clear,
  el,
  icon,
  cartridgeMini,
  langSwitch,
  loadingLine,
  siteFooter,
  toast,
} from "../components.js";
import {
  stockAccountUrl,
  stockAdminUrl,
  ROMM_ORIGIN,
  normalizePlatform,
  shortPlatformLabel,
} from "../config.js";
import { logout, userInitials, userLabel } from "../auth.js";
import { t } from "../i18n.js";
import { createSignupPanel } from "./signup.js";

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
              { class: "profile-row", href: "#/admin" },
              el("span", { class: "profile-row-icon" }, icon("settings", 18)),
              t("Admin console"),
              el("span", { class: "chev" }, "→"),
            )
          : null,
        logoutButton,
      ),
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

  return root;
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
  const roleAdmin = isRoleAdmin(session);
  const root = el("div", { class: "view wrap" });

  if (!admin) {
    root.append(
      el(
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

  /* Trial and registration settings */
  const status = el("div", { class: "admin-settings-status" }, loadingLine(t("Loading settings…")));
  const currentGame = el("div", { class: "admin-trial-current" });
  const searchInput = el("input", {
    class: "input",
    type: "search",
    placeholder: t("Search games to set as trial"),
    "aria-label": t("Search games"),
  });
  const searchBtn = el("button", { class: "btn btn-keycap-sm btn-primary", type: "button" }, icon("search", 16), t("Search"));
  const results = el("div", { class: "admin-trial-results" });
  const trialToggle = el("input", { type: "checkbox", class: "switch-input", id: "trial-enabled" });
  const regToggle = el("input", { type: "checkbox", class: "switch-input", id: "registration-enabled", checked: true });
  const saveBtn = el("button", { class: "btn btn-keycap btn-mint", type: "button" }, icon("save", 18), t("Save settings"));
  let selectedGame = null;
  let settings = { trialGameId: null, trialEnabled: false, registrationEnabled: true };
  let disposed = false;

  /* Signup QR (relay) */
  const relayEnabled = hasSignupRelay();
  const signupSlot = el("div", { class: "signup-slot", "data-signup-slot": "", hidden: true });
  let signupPanel = null;
  let signupToggled = false;
  let signupStateController = null;
  const blobUrls = new Set();

  function closeSignupPanel() {
    signupPanel?.cleanup?.();
    signupPanel = null;
    clear(signupSlot);
    signupSlot.hidden = true;
  }

  const signupSwitchNote = el(
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
        if (relayEnabled) signupSwitchNote.textContent = t("Off · Create account asks for admin code");
        closeSignupPanel();
      },
    });
    signupSlot.append(signupPanel.el);
    signupSlot.hidden = false;
    if (relayEnabled) signupSwitchNote.textContent = t("Enabled · Anyone on Create account sees QR");
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
              signupToggled = true;
              const nextOpen = button.getAttribute("aria-checked") !== "true";
              button.setAttribute("aria-checked", nextOpen ? "true" : "false");
              if (nextOpen) {
                openSignupPanel();
              } else {
                closeSignupPanel();
                if (relayEnabled) {
                  signupSwitchNote.textContent = t("Off · Create account asks for admin code");
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
          signupSwitchNote,
        ),
        el(
          "span",
          { class: "switch-track", "aria-hidden": "true" },
          el("span", { class: "switch-thumb" }),
        ),
      )
    : null;

  function gameLabel(rom) {
    if (!rom) return t("No trial game selected");
    const platform = shortPlatformLabel(normalizePlatform(rom.platform_slug || rom.platform_fs_slug || ""));
    return `${rom.name || rom.title || t("Game")} · ${platform}`;
  }

  function trialCoverImg(rom, className = "trial-cover-sm") {
    const url = coverUrl(rom, "small");
    const img = el("img", { class: className, alt: "" });
    if (!url) {
      img.hidden = true;
      return img;
    }
    const relay = relayUrl("");
    const needsAuth = url.startsWith("http") && (!relay || !url.startsWith(relay));
    if (!needsAuth) {
      img.src = url;
      return img;
    }
    void (async () => {
      try {
        const blob = await downloadBlob(url);
        if (disposed) return;
        const objectUrl = URL.createObjectURL(blob);
        blobUrls.add(objectUrl);
        img.src = objectUrl;
      } catch {
        if (!disposed) img.hidden = true;
      }
    })();
    return img;
  }

  function renderCurrent() {
    if (!selectedGame && !settings.trialGameId) {
      currentGame.replaceChildren(
        el("p", { class: "note" }, t("No trial game selected. Pick a game below and save.")),
      );
      return;
    }
    const rom = selectedGame;
    if (!rom) {
      currentGame.replaceChildren(
        el("div", { class: "trial-mini" }, el("div", {}, el("strong", {}, t("Game ID: {id}", { id: settings.trialGameId }))), el("p", { class: "note" }, t("Selected game details will load after save/reload if accessible."))),
      );
      return;
    }
    currentGame.replaceChildren(
      el(
        "div",
        { class: "trial-pick trial-current" },
        trialCoverImg(rom),
        el(
          "div",
          { class: "trial-pick-copy" },
          el("strong", {}, rom.name || rom.title || t("Game")),
          el("div", { class: "note" }, gameLabel(rom)),
        ),
        el(
          "button",
          { class: "btn btn-keycap-sm btn-ghost", type: "button", on: { click: () => { selectedGame = null; settings.trialGameId = null; renderCurrent(); } } },
          t("Clear"),
        ),
      ),
    );
  }

  async function load() {
    try {
      settings = await api.settings();
    } catch (error) {
      status.replaceChildren(el("p", { class: "note" }, error?.detail || error?.message || t("Couldn't load settings.")));
      renderCurrent();
      return;
    }
    if (disposed) return;
    trialToggle.checked = Boolean(settings.trialEnabled);
    regToggle.checked = settings.registrationEnabled !== false;
    status.replaceChildren(el("p", { class: "note" }, t("Settings loaded.")));
    if (settings.trialGameId) {
      try {
        selectedGame = await api.rom(settings.trialGameId);
      } catch {
        selectedGame = null;
      }
      if (selectedGame && !selectedGame.coverUrl) {
        try {
          const meta = await api.trialMeta();
          if (meta?.id === settings.trialGameId && meta?.coverUrl) {
            selectedGame = { ...selectedGame, coverUrl: meta.coverUrl };
          }
        } catch {
          /* authed blob fallback handles cover when proxy meta isn't available */
        }
      }
    } else {
      selectedGame = null;
    }
    if (disposed) return;
    renderCurrent();
  }

  async function search() {
    const q = searchInput.value.trim();
    if (!q) return;
    results.replaceChildren(loadingLine(t("Searching…")));
    try {
      const data = await api.roms({ search: q, limit: 12, with_total: true });
      if (disposed) return;
      const items = data.items || [];
      if (!items.length) {
        results.replaceChildren(el("p", { class: "note" }, t("No games found.")));
        return;
      }
      results.replaceChildren(
        ...items.map((rom) =>
          el(
            "button",
            {
              class: "trial-result",
              type: "button",
              on: {
                click: () => {
                  selectedGame = rom;
                  settings.trialGameId = rom.id;
                  renderCurrent();
                  toast(t("Trial game selected."), { tone: "success" });
                },
              },
            },
            trialCoverImg(rom),
            el(
              "span",
              { class: "trial-result-copy" },
              el("strong", {}, rom.name || rom.title || t("Game")),
              el("span", { class: "note" }, gameLabel(rom)),
            ),
          ),
        ),
      );
    } catch (error) {
      if (disposed) return;
      results.replaceChildren(el("p", { class: "note" }, error?.detail || error?.message || t("Search failed.")));
    }
  }

  searchBtn.addEventListener("click", () => void search());
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void search();
    }
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const next = {
        trialGameId: selectedGame?.id ?? settings.trialGameId ?? null,
        trialEnabled: trialToggle.checked,
        registrationEnabled: regToggle.checked,
      };
      if (next.trialEnabled && !next.trialGameId) {
        toast(t("Pick a trial game before enabling trial."), { tone: "warn" });
        return;
      }
      settings = await api.saveSettings(next);
      trialToggle.checked = Boolean(settings.trialEnabled);
      regToggle.checked = settings.registrationEnabled !== false;
      toast(t("Settings saved."), { tone: "success" });
      status.replaceChildren(el("p", { class: "note" }, t("Saved. Login page will use these settings.")));
    } catch (error) {
      toast(error?.detail || error?.message || t("Couldn't save settings."), { tone: "error" });
    } finally {
      saveBtn.disabled = false;
    }
  });

  if (roleAdmin && relayEnabled) {
    signupStateController = new AbortController();
    api
      .relayAdminState({ signal: signupStateController.signal })
      .then((state) => {
        if (signupToggled || signupStateController?.signal.aborted) return;
        if (state?.enabled) {
          signupSwitch?.setAttribute("aria-checked", "true");
          openSignupPanel(state);
        } else {
          signupSwitch?.setAttribute("aria-checked", "false");
          signupSwitchNote.textContent = t("Off · Create account asks for admin code");
        }
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        signupSwitchNote.textContent = t("Relay unreachable · Try toggling again");
      });
  }

  root.append(
    el(
      "section",
      { class: "block" },
      el("div", { class: "eyebrow" }, t("Admin")),
      el("h1", { class: "marker" }, t("Trial and registration")),
      el(
        "p",
        { class: "note" },
        t("Control the login page trial and self-registration. The trial game is served through the relay Worker; RomM stays closed to anonymous access."),
      ),
      status,
      el(
        "div",
        { class: "admin-settings-grid" },
        el(
          "label",
          { class: "toggle-row", for: "trial-enabled" },
          trialToggle,
          el("span", {}, t("Show trial game on login")),
        ),
        el(
          "label",
          { class: "toggle-row", for: "registration-enabled" },
          regToggle,
          el("span", {}, t("Allow self-registration")),
        ),
      ),
      el("h2", { class: "section-subhead" }, t("Trial game")),
      currentGame,
      el(
        "div",
        { class: "admin-trial-search" },
        searchInput,
        searchBtn,
      ),
      results,
      el("div", { class: "stub-actions" }, saveBtn),
    ),
    roleAdmin
      ? el(
          "section",
          { class: "block" },
          el("div", { class: "eyebrow" }, t("Signup")),
          el("h2", { class: "marker marker-sm" }, t("Signup QR panel")),
          el(
            "p",
            { class: "note" },
            t("Share a single-use QR so players can create their own account."),
          ),
          el("div", { class: "profile-list" }, signupSwitch),
          signupSlot,
        )
      : null,
    el(
      "section",
      { class: "block stub-card" },
      el("div", { class: "eyebrow" }, t("Stock RomM")),
      el("h2", { class: "marker marker-sm" }, t("Admin console")),
      el(
        "p",
        { class: "note" },
        t(
          "Server administration stays in stock RomM, where permissions are enforced.",
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
    ),
    siteFooter(),
  );

  renderCurrent();
  void load();

  return {
    el: root,
    cleanup() {
      disposed = true;
      signupStateController?.abort();
      closeSignupPanel();
      for (const url of blobUrls) URL.revokeObjectURL(url);
      blobUrls.clear();
    },
  };
}
