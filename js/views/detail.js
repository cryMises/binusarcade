import { api, coverUrl, isAbortError } from "../api.js";
import {
  clear,
  cover,
  el,
  errorState,
  formatBytes,
  formatDate,
  formatPlaytime,
  formatReleaseYear,
  icon,
  loadingLine,
  miniLedger,
  screenshotModal,
  screenshotUrl,
  siteFooter,
  sumSessionMs,
  timeAgo,
  toast,
} from "../components.js";
import {
  colorForPlatform,
  platformLabelOf,
  platformSlugOf,
  shortPlatformLabel,
  stockAdminUrl,
  stockRomUrl,
} from "../config.js";

function daysSince(date) {
  if (!date) return null;
  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.round((Date.now() - value) / 86_400_000));
}

export function detailView(ctx) {
  const root = el("div", { class: "view wrap detail-view" });
  const id = Number(ctx.params.id);

  root.append(
    el(
      "a",
      { class: "back-link", href: "#/" },
      icon("arrow-left", 17),
      "Hall",
    ),
    el("div", { class: "detail-loading" }, loadingLine("Opening the game sleeve…")),
  );

  (async () => {
    if (!Number.isFinite(id) || id <= 0) {
      showError(root, new Error("That game id doesn't look right."));
      return;
    }

    let rom;
    try {
      rom = await api.rom(id);
    } catch (error) {
      showError(root, error);
      return;
    }

    const platformSlug = platformSlugOf(rom);
    const accent = colorForPlatform(platformSlug, platformLabelOf(rom));
    const name = rom.name || rom.fs_name_no_ext || "Untitled cartridge";
    document.title = `${name} · Binus Arcade`;

    const [savesResult, statesResult, sessionsResult] = await Promise.allSettled([
      api.saves(rom.id),
      api.states(rom.id),
      api.playSessions({ rom_id: rom.id, limit: 100 }),
    ]);

    const saves = savesResult.status === "fulfilled" && Array.isArray(savesResult.value) ? savesResult.value : [];
    const states = statesResult.status === "fulfilled" && Array.isArray(statesResult.value) ? statesResult.value : [];
    const sessions =
      sessionsResult.status === "fulfilled" && Array.isArray(sessionsResult.value)
        ? sessionsResult.value
        : [];

    const playtime = sumSessionMs(sessions);
    const lastPlayed =
      rom.rom_user?.last_played ||
      sessions
        .slice()
        .sort((a, b) => new Date(b.end_time || b.start_time) - new Date(a.end_time || a.start_time))[0]
        ?.end_time ||
      null;

    clear(root);
    root.append(backLink(platformSlug, rom), buildHero({ rom, platformSlug, accent, name }));
    root.append(buildLedgers({ rom, playtime, lastPlayed, saves, states }));
    root.append(
      buildTabs({ rom, saves, states, sessions, playtime, lastPlayed }),
    );
    root.append(buildFootlinks(rom));
    root.append(siteFooter());
  })();

  return root;
}

function backLink(platformSlug, rom) {
  return el(
    "a",
    {
      class: "back-link",
      href: platformSlug ? `#/platform/${encodeURIComponent(rom.platform_slug || platformSlug)}` : "#/library",
    },
    icon("arrow-left", 17),
    platformLabelOf(rom),
  );
}

function buildHero({ rom, platformSlug, accent, name }) {
  const year = formatReleaseYear(rom.metadatum?.first_release_date);
  const playerCount = rom.metadatum?.player_count;
  const rating = rom.metadatum?.average_rating;
  const genres = Array.isArray(rom.metadatum?.genres) ? rom.metadatum.genres.slice(0, 4) : [];

  const chips = el("div", { class: "meta-chips" });
  if (year) chips.append(el("span", { class: "chip-topic" }, year));
  if (playerCount) {
    chips.append(
      el("span", { class: "chip-topic" }, `${playerCount} player${String(playerCount) === "1" ? "" : "s"}`),
    );
  }
  if (rating) chips.append(el("span", { class: "chip-topic tone-yellow" }, `${Math.round(rating)}% rating`));
  genres.forEach((genre) => chips.append(el("span", { class: "chip-topic" }, genre)));
  if (rom.metadatum?.regions?.length) {
    chips.append(el("span", { class: "chip-topic" }, rom.metadatum.regions.join(", ")));
  }

  return el(
    "section",
    { class: "detail-hero" },
    el(
      "div",
      { class: "detail-cover-stack" },
      el("span", { class: "tape-pin", "aria-hidden": "true" }),
      el("div", { class: "detail-cover" }, cover(rom, { size: "large", eager: true })),
    ),
    el(
      "div",
      { class: "detail-info" },
      el("div", { class: "eyebrow" }, "Game sleeve"),
      el("h1", { class: "detail-title" }, name),
      el(
        "div",
        { class: "detail-platform-row" },
        el(
          "span",
          { class: "washi-tape", style: { "--rule": accent } },
          shortPlatformLabel(rom),
        ),
        rom.is_identified === false
          ? el("span", { class: "rubber-stamp red" }, "Unidentified")
          : el("span", { class: "rubber-stamp green" }, "In the vault"),
        rom.has_file_on_disk === false ? el("span", { class: "rubber-stamp red" }, "File missing") : null,
      ),
      chips,
      el(
        "div",
        { class: "detail-actions" },
        el(
          "a",
          { class: "btn btn-keycap btn-mint btn-play", href: `#/play/${encodeURIComponent(rom.id)}` },
          icon("play", 21),
          "PLAY",
        ),
        el(
          "a",
          {
            class: "btn btn-keycap-sm btn-ghost",
            href: stockRomUrl(rom.id),
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Open in stock RomM",
          icon("external", 14),
        ),
        rom.has_manual && api.assetUrl(rom.path_manual)
          ? el(
              "a",
              { class: "btn btn-keycap-sm btn-ghost", href: api.assetUrl(rom.path_manual), target: "_blank", rel: "noopener noreferrer" },
              "Manual",
              icon("book", 14),
            )
          : null,
      ),
      el(
        "p",
        { class: "detail-summary" },
        rom.summary || "No description was scraped for this cartridge yet. The game still runs.",
      ),
    ),
  );
}

function buildLedgers({ rom, playtime, lastPlayed, saves, states }) {
  return el(
    "section",
    { class: "detail-ledger", "aria-label": "Game facts" },
    miniLedger("Playtime", formatPlaytime(playtime), `${sessionsText(playtime)}`),
    miniLedger("Last played", lastPlayed ? timeAgo(lastPlayed) : "Never", lastPlayed ? formatDate(lastPlayed, { withTime: true }) : "Start a session"),
    miniLedger("Saves", String(saves.length), saves.length ? formatDate(saves[0].updated_at || saves[0].created_at) : "Cloud shelf empty"),
    miniLedger("States", String(states.length), states.length ? formatDate(states[0].updated_at || states[0].created_at) : "Save states mirror saves"),
  );
}

function sessionsText(playtime) {
  return playtime ? "across play sessions" : "session clock";
}

function buildTabs({ rom, saves, states, sessions, playtime }) {
  const aboutPanel = el(
    "div",
    { class: "tab-panel", role: "tabpanel", id: "tab-about", "aria-labelledby": "tab-about-button" },
    el(
      "div",
      { class: "block" },
      el("h2", { class: "marker marker-sm" }, "The cartridge"),
      el(
        "div",
        { class: "ledger" },
        el("div", { class: "ledger-label" }, "File"),
        el("div", { class: "ledger-value", style: { "font-size": "1rem", "overflow-wrap": "anywhere" } }, rom.fs_name || "—"),
        el(
          "div",
          { class: "ledger-note" },
          `${formatBytes(rom.fs_size_bytes)} · ${rom.fs_extension || "unknown format"} · ${sessions.length} session${sessions.length === 1 ? "" : "s"}`,
        ),
      ),
      el(
        "div",
        { class: "ledger" },
        el("div", { class: "ledger-label" }, "Play activity"),
        el("div", { class: "ledger-split" }, el("span", {}, `${formatPlaytime(playtime)} played`), el("span", {}, `${sessions.length} sessions`)),
        el("div", { class: "ledger-note" }, "Synced from RomM play sessions."),
      ),
      rom.metadatum?.franchises?.length
        ? el("div", { class: "ledger" }, el("div", { class: "ledger-label" }, "Franchise"), el("div", { class: "ledger-value", style: { "font-size": "1rem" } }, rom.metadatum.franchises.join(", ")))
        : null,
    ),
    buildScreenshots(rom),
  );

  const personalPanel = el(
    "div",
    {
      class: "tab-panel",
      role: "tabpanel",
      id: "tab-personal",
      "aria-labelledby": "tab-personal-button",
      hidden: true,
    },
    el(
      "div",
      { class: "block" },
      el("h2", { class: "marker marker-sm" }, "Personal shelf"),
      el(
        "p",
        { class: "note" },
        "Ratings, backlog, completion and custom shelves land in v2. For now, manage them in stock RomM — the button below opens the same game there.",
      ),
      el(
        "div",
        { class: "stub-actions" },
        el(
          "a",
          { class: "btn btn-keycap-sm btn-yellow", href: stockRomUrl(rom.id), target: "_blank", rel: "noopener noreferrer" },
          "Open in RomM",
          icon("external", 14),
        ),
      ),
    ),
    buildSavesBlock(saves),
    buildStatesBlock(states),
  );

  const tabButtons = el(
    "div",
    { class: "tab-list", role: "tablist", "aria-label": "Game details" },
    el(
      "button",
      {
        class: "tab-button",
        id: "tab-about-button",
        type: "button",
        role: "tab",
        "aria-selected": "true",
        "aria-controls": "tab-about",
      },
      "About",
    ),
    el(
      "button",
      {
        class: "tab-button",
        id: "tab-personal-button",
        type: "button",
        role: "tab",
        "aria-selected": "false",
        "aria-controls": "tab-personal",
      },
      "Personal",
    ),
  );

  const tabSection = el("section", { class: "detail-tabs" }, tabButtons, aboutPanel, personalPanel);

  const activate = (which) => {
    const about = which === "about";
    aboutPanel.hidden = !about;
    personalPanel.hidden = about;
    tabButtons.children[0].setAttribute("aria-selected", String(about));
    tabButtons.children[1].setAttribute("aria-selected", String(!about));
  };

  tabButtons.children[0].addEventListener("click", () => activate("about"));
  tabButtons.children[1].addEventListener("click", () => activate("personal"));

  return tabSection;
}

function buildScreenshots(rom) {
  const paths = Array.isArray(rom.merged_screenshots) ? rom.merged_screenshots : [];
  const usable = paths
    .map((path, index) => ({ path, index, url: screenshotUrl(path) }))
    .filter((item) => item.url);
  if (!usable.length) return null;

  const rail = el("div", { class: "screenshot-rail", "aria-label": "Screenshots" });
  usable.slice(0, 12).forEach((item, index) => {
    rail.append(
      el(
        "button",
        {
          class: "screenshot",
          type: "button",
          "aria-label": `Open screenshot ${index + 1}`,
          on: { click: () => screenshotModal(item.path, `${rom.name || "Game"} screenshot ${index + 1}`) },
        },
        el("img", {
          src: item.url,
          alt: `${rom.name || "Game"} screenshot ${index + 1}`,
          loading: "lazy",
          decoding: "async",
        }),
      ),
    );
  });

  return el(
    "section",
    { class: "section" },
    el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, "Screenshots")),
    rail,
  );
}

function buildSavesBlock(saves) {
  if (!saves.length) return null;
  return el(
    "section",
    { class: "section" },
    el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, "Saves")),
    buildSaveList(saves, "save"),
  );
}

function buildStatesBlock(states) {
  if (!states.length) return null;
  return el(
    "section",
    { class: "section" },
    el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, "Save states")),
    buildSaveList(states, "state"),
  );
}

function buildSaveList(rows, kind) {
  const list = el("div", { class: "save-list" });
  rows.slice(0, 12).forEach((row) => {
    list.append(
      el(
        "div",
        { class: "save-row" },
        el("span", { class: "save-row-icon" }, icon(kind === "save" ? "save" : "camera", 20)),
        el(
          "div",
          { class: "save-row-copy" },
          el("strong", {}, row.file_name || `${kind} ${row.id}`),
          el(
            "span",
            {},
            `${row.emulator || "emulator"} · ${formatBytes(row.file_size_bytes)} · ${formatDate(row.updated_at || row.created_at, { withTime: true })}`,
          ),
        ),
        el(
          "button",
          {
            class: "btn btn-keycap-sm btn-ghost",
            type: "button",
            on: {
              click: async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                try {
                  const blob = kind === "save" ? await api.downloadSave(row.id) : await api.downloadState(row.id);
                  const href = URL.createObjectURL(blob);
                  const link = el("a", { href, download: row.file_name || `${kind}.bin` });
                  document.body.append(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(href), 30_000);
                  toast(`${kind === "save" ? "Save" : "State"} downloaded.`, { tone: "success" });
                } catch (error) {
                  toast(error.message || "Download failed.", { tone: "error" });
                } finally {
                  button.disabled = false;
                }
              },
            },
          },
          icon("download", 16),
          "Download",
        ),
      ),
    );
  });
  return list;
}

function buildFootlinks(rom) {
  return el(
    "div",
    { class: "game-footlinks" },
    el(
      "a",
      { href: stockRomUrl(rom.id), target: "_blank", rel: "noopener noreferrer" },
      "Open in stock RomM",
      icon("external", 14),
    ),
    el(
      "a",
      { href: stockAdminUrl(), target: "_blank", rel: "noopener noreferrer" },
      "Admin",
      icon("external", 14),
    ),
    el(
      "a",
      { href: `#/platform/${encodeURIComponent(rom.platform_slug || platformSlugOf(rom))}` },
      "More on this system",
      icon("arrow-right", 14),
    ),
  );
}

function showError(root, error) {
  clear(root);
  root.append(
    el("a", { class: "back-link", href: "#/" }, icon("arrow-left", 17), "Hall"),
    errorState(error, () => ctxRetry()),
  );
}

function ctxRetry() {
  window.location.reload();
}
