import { api } from "../api.js";
import {
  clear,
  el,
  emptyState,
  errorState,
  formatBytes,
  gameCard,
  icon,
  platformDeviceImage,
  sectionHead,
  skeletonGrid,
  timeAgo,
} from "../components.js";
import { RAIL_SIZE, normalizePlatform } from "../config.js";
import { t } from "../i18n.js";

function labelize(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statCard(label, value, note, { href, iconName } = {}) {
  const body = [
    iconName ? el("span", { class: "stat-icon", "aria-hidden": "true" }, icon(iconName, 20)) : null,
    el("span", { class: "stat-value" }, value),
    el("span", { class: "stat-label" }, label),
    note ? el("span", { class: "stat-note" }, note) : null,
  ];
  return href
    ? el("a", { class: "stat-card", href }, ...body)
    : el("div", { class: "stat-card" }, ...body);
}

function barRow(label, count, total) {
  const safeTotal = Math.max(Number(total) || 0, Number(count) || 0, 1);
  const percent = Math.max(0, Math.min(100, (Number(count) / safeTotal) * 100));
  return el(
    "div",
    { class: "bar-row" },
    el("span", { class: "bar-label" }, label || t("Unknown")),
    el("span", { class: "bar-count" }, String(count ?? 0)),
    el(
      "span",
      { class: "bar-track", "aria-hidden": "true" },
      el("span", { class: "bar-fill", style: { width: `${percent}%` } }),
    ),
  );
}

function statsPanel(stats) {
  if (!stats) {
    return emptyState({
      title: t("No library stats yet"),
      note: t("RomM returned an empty stats response."),
    });
  }
  const cards = el(
    "div",
    { class: "stat-grid" },
    statCard(t("Games"), Number(stats.ROMS) || 0, t("in the library"), { href: "#/library", iconName: "grid" }),
    statCard(t("Platforms"), Number(stats.PLATFORMS) || 0, t("systems"), { href: "#/library", iconName: "book" }),
    statCard(t("Saves"), Number(stats.SAVES) || 0, t("save files"), { iconName: "save" }),
    statCard(t("Save states"), Number(stats.STATES) || 0, t("state files"), { iconName: "refresh" }),
    statCard(t("Screenshots"), Number(stats.SCREENSHOTS) || 0, t("captures"), { iconName: "camera" }),
    statCard(t("Library size"), formatBytes(stats.TOTAL_FILESIZE_BYTES), t("on disk"), { iconName: "download" }),
  );

  const coverageEntries = Object.entries(stats.METADATA_COVERAGE || {}).filter(
    ([, items]) => Array.isArray(items) && items.length,
  );
  const regionEntries = Object.entries(stats.REGION_BREAKDOWN || {}).filter(
    ([, items]) => Array.isArray(items) && items.length,
  );
  if (!coverageEntries.length && !regionEntries.length) return cards;

  const extras = el("div", { class: "stats-extras" });
  if (coverageEntries.length) {
    const groups = coverageEntries.map(([key, items]) => {
      const max = items.reduce((highest, item) => Math.max(highest, Number(item.matched) || 0), 0);
      return el(
        "div",
        { class: "coverage-group" },
        el("h3", { class: "coverage-title" }, labelize(key)),
        ...items.map((item) => barRow(item.source, item.matched, max)),
      );
    });
    extras.append(el("div", { class: "coverage-card" }, el("h2", {}, t("Metadata coverage")), ...groups));
  }
  if (regionEntries.length) {
    const groups = regionEntries.map(([key, items]) => {
      const max = items.reduce((highest, item) => Math.max(highest, Number(item.count) || 0), 0);
      return el(
        "div",
        { class: "coverage-group" },
        el("h3", { class: "coverage-title" }, labelize(key)),
        ...items.map((item) => barRow(labelize(item.region), item.count, max)),
      );
    });
    extras.append(el("div", { class: "coverage-card" }, el("h2", {}, t("Regions")), ...groups));
  }
  return el("div", {}, cards, extras);
}

function systemsPanel(platforms) {
  const withGames = (platforms || [])
    .filter((platform) => Number(platform.rom_count) > 0)
    .sort(
      (a, b) =>
        (Number(b.rom_count) || 0) - (Number(a.rom_count) || 0) ||
        String(a.name).localeCompare(String(b.name)),
    );
  if (!withGames.length) {
    return emptyState({ title: t("No systems yet"), note: t("RomM returned no platforms with games.") });
  }

  const max = withGames.reduce((highest, platform) => Math.max(highest, Number(platform.rom_count) || 0), 0);
  const list = el("div", { class: "system-list" });
  withGames.forEach((platform) => {
    const slug = platform.slug || platform.fs_slug || platform.id;
    const normalized = normalizePlatform(slug);
    const count = Number(platform.rom_count) || 0;
    const percent = Math.max(0, Math.min(100, (count / Math.max(max, 1)) * 100));
    const device = platformDeviceImage(normalized, { size: 22 });
    list.append(
      el(
        "a",
        {
          class: "system-row",
          href: `#/platform/${encodeURIComponent(slug)}`,
          "aria-label": t("{name}: {n} games", { name: platform.display_name || platform.name, n: count }),
        },
        el(
          "span",
          { class: `system-abbr${device ? " has-device" : ""}`, "aria-hidden": "true" },
          device || platform.abbreviation || "?",
        ),
        el(
          "span",
          { class: "system-body" },
          el("span", { class: "system-name" }, platform.display_name || platform.name),
          el(
            "span",
            { class: "system-track", "aria-hidden": "true" },
            el("span", { class: "system-fill", style: { width: `${percent}%` } }),
          ),
        ),
        el("span", { class: "system-count" }, String(count)),
      ),
    );
  });
  return list;
}

function activityPanel(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return emptyState({
      title: t("No activity yet"),
      note: t("When someone starts a game, it shows up here."),
    });
  }
  const list = el("ul", { class: "activity-list" });
  entries.slice(0, 8).forEach((entry) => {
    const who = entry.username || t("Someone");
    const game = entry.rom_name || t("a game");
    const line = entry.platform_name
      ? t("{who} started {game} on {platform}", { who, game, platform: entry.platform_name })
      : t("{who} started {game}", { who, game });
    list.append(
      el(
        "li",
        { class: "activity-row" },
        el("span", { class: "activity-dot", "aria-hidden": "true" }),
        el("span", { class: "activity-text" }, line),
        el("span", { class: "activity-time" }, timeAgo(entry.started_at)),
      ),
    );
  });
  return list;
}

function savesPanel(saves) {
  const items = Array.isArray(saves) ? saves : [];
  if (!items.length) {
    return emptyState({
      title: t("No saves yet"),
      note: t("Saves synced from the emulator will appear here."),
    });
  }
  const slots = new Map();
  items.forEach((save) => {
    const key = save.slot || "Default";
    slots.set(key, (slots.get(key) || 0) + 1);
  });
  const rows = [...slots.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([slot, count]) => barRow(t(slot), count, items.length));
  return el(
    "div",
    { class: "save-summary" },
    el(
      "div",
      { class: "save-total" },
      el("span", { class: "save-total-value" }, String(items.length)),
      el("span", { class: "save-total-label" }, t(items.length === 1 ? " save across " : " saves across ")),
      el("span", { class: "save-total-value" }, String(slots.size)),
      el("span", { class: "save-total-label" }, t(slots.size === 1 ? " slot" : " slots")),
    ),
    ...rows,
  );
}

function recentPanel(result) {
  const items = result?.items || [];
  if (!items.length) {
    return emptyState({
      title: t("No games yet"),
      note: t("When RomM scans a game, it will show up here."),
      action: el("a", { class: "btn", href: "#/library" }, t("Open library")),
    });
  }
  const grid = el("div", { class: "game-grid" });
  items.forEach((rom, index) => grid.append(gameCard(rom, index)));
  return grid;
}

export function homeView(ctx) {
  const root = el("div", { class: "view wrap home-view" });
  const searchInput = el("input", {
    class: "input",
    type: "search",
    name: "q",
    placeholder: t("Search the library…"),
    autocomplete: "off",
    "aria-label": t("Search games"),
    enterkeyhint: "search",
  });
  const search = el(
    "form",
    {
      class: "home-search",
      role: "search",
      on: {
        submit: (event) => {
          event.preventDefault();
          const q = searchInput.value.trim();
          ctx.navigate(`/library${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        },
      },
    },
    el("span", { class: "search-icon", "aria-hidden": "true" }, icon("search", 20)),
    searchInput,
    el("button", { class: "btn btn-primary", type: "submit" }, t("Search")),
  );

  const hero = el(
    "header",
    { class: "home-hero" },
    el("p", { class: "eyebrow" }, t("Library overview")),
    el("h1", { class: "home-title" }, "Binus Arcade"),
    el("p", { class: "note" }, t("A stats-only look at the collection. Pick a game from the Library.")),
    search,
  );

  const statsSection = el("section", { class: "section", "aria-labelledby": "home-stats-title" });
  const systemsSection = el("section", { class: "section", "aria-labelledby": "home-systems-title" });
  const savesSection = el("section", { class: "section", "aria-labelledby": "home-saves-title" });
  const activitySection = el("section", { class: "section", "aria-labelledby": "home-activity-title" });
  const recentSection = el("section", { class: "section", "aria-labelledby": "home-recent-title" });

  function fillLoading() {
    clear(statsSection);
    statsSection.append(
      el("h2", { class: "section-title", id: "home-stats-title" }, t("Library stats")),
      el("div", { class: "stat-grid" }, ...Array.from({ length: 6 }, () => el("div", { class: "skeleton skeleton-stat" }))),
    );
    clear(systemsSection);
    systemsSection.append(
      sectionHead(t("Systems"), el("a", { class: "section-link", href: "#/library" }, t("Browse"))),
      el("div", { class: "system-list" }, ...Array.from({ length: 4 }, () => el("div", { class: "skeleton skeleton-row" }))),
    );
    clear(savesSection);
    savesSection.append(sectionHead(t("Your saves")), el("div", { class: "skeleton skeleton-block" }));
    clear(activitySection);
    activitySection.append(sectionHead(t("Recent activity")), el("div", { class: "skeleton skeleton-block" }));
    clear(recentSection);
    recentSection.append(
      sectionHead(t("Recently added"), el("a", { class: "section-link", href: "#/library" }, t("All games"))),
      skeletonGrid(6),
    );
  }

  function fillResults(results) {
    const [statsResult, platformsResult, savesResult, activityResult, recentResult] = results;

    clear(statsSection);
    statsSection.append(el("h2", { class: "section-title", id: "home-stats-title" }, t("Library stats")));
    if (statsResult.status === "fulfilled") statsSection.append(statsPanel(statsResult.value));
    else statsSection.append(errorState(statsResult.reason, load));

    clear(systemsSection);
    systemsSection.append(
      sectionHead(t("Systems"), el("a", { class: "section-link", href: "#/library" }, t("Browse"))),
    );
    if (platformsResult.status === "fulfilled") systemsSection.append(systemsPanel(platformsResult.value));
    else systemsSection.append(errorState(platformsResult.reason, load));

    clear(savesSection);
    savesSection.append(sectionHead(t("Your saves")));
    if (savesResult.status === "fulfilled") savesSection.append(savesPanel(savesResult.value));
    else savesSection.append(errorState(savesResult.reason, load));

    clear(activitySection);
    activitySection.append(sectionHead(t("Recent activity")));
    if (activityResult.status === "fulfilled") activitySection.append(activityPanel(activityResult.value));
    else activitySection.append(errorState(activityResult.reason, load));

    clear(recentSection);
    recentSection.append(
      sectionHead(t("Recently added"), el("a", { class: "section-link", href: "#/library" }, t("All games"))),
    );
    if (recentResult.status === "fulfilled") recentSection.append(recentPanel(recentResult.value));
    else recentSection.append(errorState(recentResult.reason, load));
  }

  async function load() {
    fillLoading();
    const results = await Promise.allSettled([
      api.stats(),
      api.platforms(),
      /* GET /api/saves/summary requires rom_id in RomM 5.4.1, so Home summarizes GET /api/saves. */
      api.saves(),
      api.activity(),
      api.roms(
        { limit: RAIL_SIZE, order_by: "created_at", order_dir: "desc", with_total: false },
        { cacheKey: "home:recent" },
      ),
    ]);
    fillResults(results);
  }

  root.append(hero, statsSection, systemsSection, savesSection, activitySection, recentSection);
  void load();
  return root;
}
