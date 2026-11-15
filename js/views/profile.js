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
  timeAgo,
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

const REPORT_TYPE_LABELS = {
  wont_load: "Won't load",
  black_screen: "Black screen",
  controls: "Controls don't work",
  no_sound: "No sound",
  save_problem: "Save problem",
  other: "Other",
};

const REPORT_STATUS_LABELS = {
  open: "Ticket open",
  resolved: "Fixed",
  dismissed: "Closed",
};

const REQUEST_STATUS_LABELS = {
  open: "Open request",
  planned: "Planned",
  added: "Added",
  denied: "Denied",
};

/* Console slugs that can carry an admin note (matches the request-box list). */
const NOTE_PLATFORMS = [
  ["atari2600", "Atari 2600"],
  ["flash", "Flash"],
  ["gb", "Game Boy"],
  ["gba", "Game Boy Advance"],
  ["gbc", "Game Boy Color"],
  ["genesis", "Genesis / Mega Drive"],
  ["nds", "Nintendo DS"],
  ["nes", "NES"],
  ["psx", "PlayStation"],
  ["psp", "PSP"],
  ["snes", "SNES"],
];

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

  const reportBody = el("div", { class: "report-list" }, loadingLine(t("Loading your reports…")));
  const reportSection = el(
    "section",
    { class: "section" },
    el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, t("My reports"))),
    el(
      "p",
      { class: "note" },
      t("Tickets you filed while signed in. The admin reply shows here; reopen a fixed ticket if the game still breaks."),
    ),
    reportBody,
  );

  async function loadMyReports() {
    if (!hasSignupRelay()) {
      reportSection.remove();
      return;
    }
    try {
      const payload = await api.myReports();
      const rows = Array.isArray(payload?.reports) ? payload.reports : [];
      clear(reportBody);
      if (!rows.length) {
        reportBody.append(
          el("p", { class: "note report-empty" }, t("No reports yet. If a game breaks, use Report a problem on its page.")),
        );
        return;
      }
      rows.forEach((row) => reportBody.append(reportTicket(row)));
    } catch {
      clear(reportBody);
      reportBody.append(el("p", { class: "note report-empty" }, t("Couldn't load your reports right now.")));
    }
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
    reportSection,
    siteFooter(),
  );

  void loadMyReports();
  return root;
}

function reportTicket(row) {
  let current = row;
  const status = el(
    "span",
    { class: `chip-cat report-status status-${current.status}` },
    t(REPORT_STATUS_LABELS[current.status] || "Ticket open"),
  );

  const reopen = el(
    "button",
    { class: "btn btn-keycap-sm btn-ghost report-reopen", type: "button" },
    t("Reopen ticket"),
  );

  const del = el(
    "button",
    { class: "btn btn-keycap-sm btn-ghost report-delete", type: "button" },
    icon("close", 14),
    t("Delete ticket"),
  );

  const actions = el("div", { class: "report-ticket-actions" }, current.status === "open" ? null : reopen, del);

  const card = el(
    "article",
    { class: `report-ticket status-${current.status}` },
    el(
      "div",
      { class: "report-ticket-head" },
      el("strong", {}, current.rom_title || t("Game {id}", { id: current.rom_id })),
      status,
    ),
    el(
      "p",
      { class: "report-meta" },
      [t(REPORT_TYPE_LABELS[current.type] || "Other"), timeAgo(current.created_at)].filter(Boolean).join(" · "),
    ),
    current.note ? el("p", { class: "report-ticket-note" }, current.note) : null,
    current.admin_note
      ? el(
          "div",
          { class: "report-reply" },
          el("span", { class: "report-reply-label" }, t("Admin reply")),
          el("p", {}, current.admin_note),
        )
      : null,
    actions,
  );

  reopen.addEventListener("click", async () => {
    reopen.disabled = true;
    try {
      await api.reopenReport(current.id);
      current = { ...current, status: "open" };
      status.textContent = t("Ticket open");
      status.className = "chip-cat report-status status-open";
      reopen.remove();
      toast(t("Ticket reopened. The admin sees it again."), { tone: "success" });
    } catch (error) {
      reopen.disabled = false;
      toast(error.message || t("Couldn't reopen the ticket."), { tone: "error" });
    }
  });

  del.addEventListener("click", async () => {
    if (!window.confirm(t("Delete this ticket? This can't be undone."))) return;
    del.disabled = true;
    try {
      await api.deleteReport(current.id);
      card.remove();
      toast(t("Ticket deleted."), { tone: "success" });
    } catch (error) {
      del.disabled = false;
      toast(error.message || t("Couldn't delete the ticket."), { tone: "error" });
    }
  });

  return card;
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
  const noteFields = NOTE_PLATFORMS.map(([slug, label]) => {
    const input = el("textarea", {
      class: "input",
      rows: "2",
      maxlength: "500",
      id: `note-${slug}`,
      placeholder: t("Leave empty for no note"),
      "aria-label": label,
    });
    return { slug, label, input };
  });
  const trialToggle = el("input", { type: "checkbox", class: "switch-input", id: "trial-enabled" });
  const regToggle = el("input", { type: "checkbox", class: "switch-input", id: "registration-enabled", checked: true });
  const saveBtn = el("button", { class: "btn btn-keycap btn-mint", type: "button" }, icon("save", 18), t("Save settings"));
  let selectedGame = null;
  let settings = {
    trialGameId: null,
    trialEnabled: false,
    registrationEnabled: true,
    generalNotes: {},
  };
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
    for (const { slug, input } of noteFields) {
      input.value = settings.generalNotes?.[slug] || "";
    }    status.replaceChildren(el("p", { class: "note" }, t("Settings loaded.")));
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
      const data = await api.roms({ search_term: q, limit: 12, with_total: true });
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
      const generalNotes = {};
      for (const { slug, input } of noteFields) {
        const text = input.value.trim();
        if (text) generalNotes[slug] = text;
      }
      const next = {
        trialGameId: selectedGame?.id ?? settings.trialGameId ?? null,
        trialEnabled: trialToggle.checked,
        registrationEnabled: regToggle.checked,
        generalNotes,
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

  /* ---------------------------------------------------------------- */
  /* Community moderation: broken-game reports + game requests        */
  /* ---------------------------------------------------------------- */

  const communityAbort = new AbortController();
  let reportGroups = [];
  let requestRows = [];

  const reportsBadge = el("span", { class: "admin-badge", hidden: "" });
  const requestsBadge = el("span", { class: "admin-badge", hidden: "" });
  const reportsBody = el("div", { class: "admin-queue" }, loadingLine(t("Loading reports…")));
  const requestsBody = el("div", { class: "admin-queue" }, loadingLine(t("Loading requests…")));

  const typeLabel = (type) => t(REPORT_TYPE_LABELS[type] || "Other");

  function renderReports() {
    clear(reportsBody);
    reportsBadge.textContent = String(reportGroups.length);
    reportsBadge.hidden = !reportGroups.length;
    if (!reportGroups.length) {
      reportsBody.append(el("p", { class: "note admin-queue-empty" }, t("No open reports. Nice.")));
      return;
    }
    reportGroups.forEach((group) => {
      const wall = el("div", { class: "admin-report-entries" });
      group.reports.forEach((report) => {
        wall.append(
          el(
            "div",
            { class: "admin-report-entry" },
            el("span", { class: "admin-report-type" }, typeLabel(report.type)),
            el("span", { class: "admin-report-reporter" }, t("by {name}", { name: report.reporter })),
            el("span", { class: "admin-report-time" }, timeAgo(report.created_at)),
            report.note ? el("p", { class: "admin-report-note" }, report.note) : null,
          ),
        );
      });

      const commentInput = el("textarea", {
        class: "input admin-report-comment",
        rows: "2",
        maxlength: "500",
        placeholder: t("Short fix or explanation for the player (optional)"),
        "aria-label": t("Reply to the player"),
      });

      let resolving = false;
      const act = async (action) => {
        if (resolving) return;
        resolving = true;
        try {
          await api.resolveReport(group.reports[0].id, action, commentInput.value.trim());
          reportGroups = reportGroups.filter((item) => item !== group);
          renderReports();
          toast(action === "dismiss" ? t("Report dismissed.") : t("Report resolved."), { tone: "success" });
        } catch (error) {
          toast(error.message || t("Couldn't update the report."), { tone: "error" });
        } finally {
          resolving = false;
        }
      };

      reportsBody.append(
        el(
          "details",
          { class: "admin-report-group" },
          el(
            "summary",
            {},
            el(
              "span",
              { class: "admin-report-head" },
              el("strong", {}, group.rom_title || t("Game {id}", { id: group.rom_id })),
              el("span", { class: "admin-report-count" }, t("{n} reports", { n: group.count })),
            ),
            el(
              "span",
              { class: "admin-report-types" },
              Object.entries(group.types)
                .map(([type, count]) => `${typeLabel(type)}${count > 1 ? ` ×${count}` : ""}`)
                .join(" · "),
            ),
          ),
          el(
            "div",
            { class: "admin-report-actions" },
            commentInput,
            el(
              "button",
              { class: "btn btn-keycap-sm btn-mint", type: "button", on: { click: () => act("resolve") } },
              icon("save", 14),
              t("Resolve"),
            ),
            el(
              "button",
              { class: "btn btn-keycap-sm btn-ghost", type: "button", on: { click: () => act("dismiss") } },
              t("Dismiss"),
            ),
            el(
              "a",
              { class: "btn btn-keycap-sm btn-quiet", href: `#/game/${encodeURIComponent(group.rom_id)}` },
              t("Open game"),
              icon("arrow-right", 14),
            ),
          ),
          wall,
        ),
      );
    });
  }

  function renderRequests() {
    clear(requestsBody);
    const openCount = requestRows.filter((row) => row.status === "open").length;
    requestsBadge.textContent = String(openCount);
    requestsBadge.hidden = !openCount;
    if (!requestRows.length) {
      requestsBody.append(el("p", { class: "note admin-queue-empty" }, t("No game requests yet.")));
      return;
    }
    requestRows.forEach((row) => {
      const busy = new Set();
      const act = async (status) => {
        if (busy.has(status)) return;
        busy.add(status);
        try {
          const saved = await api.setRequestStatus(row.id, status);
          row.status = saved.status;
          renderRequests();
          toast(t("Request marked {status}.", { status: t(REQUEST_STATUS_LABELS[status]) }), { tone: "success" });
        } catch (error) {
          toast(error.message || t("Couldn't update the request."), { tone: "error" });
        } finally {
          busy.delete(status);
        }
      };

      const statusButton = (status, label) =>
        row.status === status
          ? null
          : el(
              "button",
              { class: "btn btn-keycap-sm btn-ghost", type: "button", on: { click: () => act(status) } },
              label,
            );

      requestsBody.append(
        el(
          "article",
          { class: `admin-request${row.status === "denied" ? " is-denied" : ""}` },
          el(
            "div",
            { class: "admin-request-head" },
            el("strong", {}, row.title),
            el("span", { class: `chip-cat admin-request-status status-${row.status}` }, t(REQUEST_STATUS_LABELS[row.status] || "Open")),
            el("span", { class: "admin-request-votes" }, t("{n} votes", { n: row.votes })),
          ),
          el(
            "p",
            { class: "admin-request-meta" },
            [
              row.platform_slug ? String(row.platform_slug).toUpperCase() : null,
              t("by {name}", { name: row.requester || t("Guest") }),
              timeAgo(row.created_at),
            ]
              .filter(Boolean)
              .join(" · "),
          ),
          row.note ? el("p", { class: "admin-request-note" }, row.note) : null,
          el(
            "div",
            { class: "admin-request-actions" },
            statusButton("planned", t("Plan")),
            statusButton("added", t("Mark added")),
            statusButton("denied", t("Deny")),
            statusButton("open", t("Reopen")),
            el(
              "button",
              {
                class: "btn btn-keycap-sm btn-ghost admin-request-delete",
                type: "button",
                on: {
                  click: async (event) => {
                    if (!window.confirm(t("Delete this request and its votes?"))) return;
                    const button = event.currentTarget;
                    if (button.disabled) return;
                    button.disabled = true;
                    try {
                      await api.deleteRequest(row.id);
                      requestRows = requestRows.filter((item) => item !== row);
                      renderRequests();
                      toast(t("Request deleted."), { tone: "success" });
                    } catch (error) {
                      button.disabled = false;
                      toast(error.message || t("Couldn't delete the request."), { tone: "error" });
                    }
                  },
                },
              },
              icon("close", 14),
              t("Delete"),
            ),
          ),
        ),
      );
    });
  }

  if (roleAdmin) {
    api
      .adminReports({ signal: communityAbort.signal })
      .then((payload) => {
        if (disposed) return;
        reportGroups = Array.isArray(payload?.groups) ? payload.groups : [];
        renderReports();
      })
      .catch((error) => {
        if (error?.name === "AbortError" || disposed) return;
        clear(reportsBody);
        reportsBody.append(el("p", { class: "note admin-queue-empty" }, t("Reports unavailable right now.")));
      });

    api
      .requests({ all: true, signal: communityAbort.signal })
      .then((payload) => {
        if (disposed) return;
        requestRows = Array.isArray(payload?.requests) ? payload.requests : [];
        renderRequests();
      })
      .catch((error) => {
        if (error?.name === "AbortError" || disposed) return;
        clear(requestsBody);
        requestsBody.append(el("p", { class: "note admin-queue-empty" }, t("Requests unavailable right now.")));
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
      el(
        "details",
        { class: "admin-note-panel" },
        el("summary", {}, icon("book", 16), t("Notes per console")),
        el(
          "p",
          { class: "note" },
          t("Shown on that console's game pages. Leave a console empty to hide its note."),
        ),
        el(
          "div",
          { class: "admin-note-grid" },
          ...noteFields.map(({ slug, label, input }) =>
            el(
              "details",
              { class: "admin-note-item" },
              el("summary", {}, label),
              el(
                "label",
                { class: "field", for: `note-${slug}` },
                el("span", { class: "field-label" }, label),
                input,
              ),
            ),
          ),
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
    roleAdmin
      ? el(
          "section",
          { class: "block admin-queue-block" },
          el("div", { class: "eyebrow" }, t("Community")),
          el(
            "div",
            { class: "admin-queue-head" },
            el("h2", { class: "marker marker-sm" }, t("Broken-game reports")),
            reportsBadge,
          ),
          el("p", { class: "note" }, t("Grouped by game. Resolving one report clears the whole group.")),
          reportsBody,
        )
      : null,
    roleAdmin
      ? el(
          "section",
          { class: "block admin-queue-block" },
          el("div", { class: "eyebrow" }, t("Community")),
          el(
            "div",
            { class: "admin-queue-head" },
            el("h2", { class: "marker marker-sm" }, t("Game requests")),
            requestsBadge,
          ),
          el("p", { class: "note" }, t("Sorted by votes. Denied requests stay hidden from players.")),
          requestsBody,
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
      communityAbort.abort();
      signupStateController?.abort();
      closeSignupPanel();
      for (const url of blobUrls) URL.revokeObjectURL(url);
      blobUrls.clear();
    },
  };
}
