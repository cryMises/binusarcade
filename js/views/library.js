import { api, isAbortError } from "../api.js";
import {
  clear,
  el,
  emptyState,
  errorState,
  gameCard,
  icon,
  skeletonGrid,
} from "../components.js";
import { PAGE_SIZE } from "../config.js";

const STATUS_OPTIONS = [
  ["incomplete", "In progress"],
  ["finished", "Finished"],
  ["completed_100", "100%"],
  ["retired", "Retired"],
  ["never_playing", "Never playing"],
];

const SORTS = [
  ["created_at", "Recently added", "desc"],
  ["name", "Name A–Z", "asc"],
  ["updated_at", "Recently updated", "desc"],
  ["last_played", "Recently played", "desc"],
  ["fs_size_bytes", "Largest file", "desc"],
];

function stateFromQuery(query) {
  return {
    q: query.get("q") || "",
    platform: query.get("platform") || "",
    genre: query.get("genre") || "",
    players: query.get("players") || "",
    status: query.get("status") || "",
    sort: query.get("sort") || "created_at",
  };
}

function sortOf(key) {
  return SORTS.find(([value]) => value === key) || SORTS[0];
}

function queryFromState(state, platformSlug) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (!platformSlug && state.platform) params.set("platform", state.platform);
  if (state.genre) params.set("genre", state.genre);
  if (state.players) params.set("players", state.players);
  if (state.status) params.set("status", state.status);
  if (state.sort && state.sort !== "created_at") params.set("sort", state.sort);
  return params;
}

function paramsFor(state, platform) {
  const [sort, , dir] = sortOf(state.sort);
  return {
    limit: PAGE_SIZE,
    with_total: true,
    order_by: sort,
    order_dir: dir,
    search_term: state.q || undefined,
    platform_ids: platform?.id ? [platform.id] : undefined,
    genres: state.genre ? [state.genre] : undefined,
    player_counts: state.players ? [state.players] : undefined,
    statuses: state.status ? [state.status] : undefined,
  };
}

function matchPlatform(platforms, value) {
  if (!value) return null;
  const wanted = String(value).toLowerCase();
  return (
    platforms.find(
      (platform) =>
        String(platform.slug).toLowerCase() === wanted ||
        String(platform.fs_slug).toLowerCase() === wanted ||
        String(platform.id) === wanted,
    ) || null
  );
}

export function libraryView(ctx) {
  const platformSlug = ctx.params.slug || "";
  const state = stateFromQuery(ctx.query);
  const root = el("div", { class: "view wrap library-view" });

  let platforms = [];
  let filters = null;
  let currentPlatform = null;
  let items = [];
  let total = 0;
  let offset = 0;
  let loading = false;
  let queryToken = 0;
  let controller = null;

  const title = el("h1", { class: "marker" }, platformSlug ? "Loading shelf…" : "Library");
  const subtitle = el("p", { class: "note" }, "Every cartridge in the cupboard.");
  const headNotes = el("div", { class: "library-head-notes" });

  const head = el(
    "header",
    { class: "library-head" },
    el("div", { class: "eyebrow" }, platformSlug ? "System shelf" : "All systems"),
    title,
    subtitle,
    headNotes,
  );

  const searchInput = el("input", {
    class: "input",
    type: "search",
    name: "q",
    value: state.q,
    placeholder: platformSlug ? "Search this shelf…" : "Search the library…",
    autocomplete: "off",
    "aria-label": "Search games",
    enterkeyhint: "search",
    id: "library-search",
  });

  const sortSelect = el(
    "select",
    { class: "input", "aria-label": "Sort games" },
    ...SORTS.map(([value, label]) =>
      el("option", { value, selected: state.sort === value }, label),
    ),
  );

  const filterBody = el("div", { class: "filter-body" });
  const filterPanel = el(
    "details",
    { class: "filter-panel" },
    el(
      "summary",
      {},
      icon("filter", 18),
      "Filters",
      el("span", { class: "summary-caret", "aria-hidden": "true" }, "⌄"),
    ),
    filterBody,
  );

  const countLine = el("div", { class: "library-count" });
  const gridSlot = el("div", { class: "library-grid-slot" });
  const loadMoreWrap = el("div", { class: "load-more-wrap" });

  const tools = el(
    "div",
    { class: "library-tools" },
    el(
      "div",
      { class: "field" },
      el("label", { class: "sr-only", for: "library-search" }, "Search"),
      searchInput,
    ),
    el(
      "div",
      { class: "sort-field" },
      el("span", { class: "field-label" }, "Sort"),
      sortSelect,
    ),
  );

  root.append(head, tools, filterPanel, countLine, gridSlot, loadMoreWrap);

  function persistQuery() {
    const params = queryFromState(state, platformSlug);
    const base = platformSlug ? `/platform/${encodeURIComponent(platformSlug)}` : "/library";
    ctx.replaceQuery(base, params);
  }

  function activeFilterCount() {
    return [
      platformSlug ? "" : state.platform,
      state.genre,
      state.players,
      state.status,
    ].filter(Boolean).length;
  }

  function chip(label, active, onPick, tone = "") {
    return el(
      "button",
      {
        class: `chip-topic ${tone} ${active ? "on" : ""}`,
        type: "button",
        "aria-pressed": String(active),
        on: { click: onPick },
      },
      label,
    );
  }

  function setCount(text) {
    clear(countLine);
    countLine.append(el("span", { class: "ledger-note", role: "status" }, text));
  }

  function updateForFilter(key, value) {
    state[key] = state[key] === value ? "" : value;
    renderFilters();
    persistQuery();
    load({ reset: true });
  }

  function renderFilters() {
    clear(filterBody);

    if (!platformSlug) {
      const group = el("div", { class: "facet-group" }, el("h3", {}, "Platform"));
      const row = el("div", { class: "facet-row facet-scroll" });
      row.append(chip("All systems", !state.platform, () => updateForFilter("platform", "")));
      platforms.forEach((platform) => {
        const slug = platform.slug || platform.fs_slug;
        const name = platform.display_name || platform.name || slug;
        row.append(
          chip(name, state.platform === slug, () => updateForFilter("platform", slug), "tone-blue"),
        );
      });
      group.append(row);
      filterBody.append(group);
    }

    if (filters?.genres?.length) {
      const group = el("div", { class: "facet-group" }, el("h3", {}, "Genre"));
      const row = el("div", { class: "facet-row facet-scroll" });
      row.append(chip("Any genre", !state.genre, () => updateForFilter("genre", "")));
      filters.genres.forEach((genre) => {
        row.append(
          chip(genre, state.genre === genre, () => updateForFilter("genre", genre), "tone-yellow"),
        );
      });
      group.append(row);
      filterBody.append(group);
    }

    const players = filters?.player_counts?.length ? filters.player_counts : ["1", "2", "3", "4"];
    const playersGroup = el("div", { class: "facet-group" }, el("h3", {}, "Players"));
    const playersRow = el("div", { class: "facet-row" });
    playersRow.append(chip("Any", !state.players, () => updateForFilter("players", "")));
    players.forEach((count) => {
      playersRow.append(
        chip(
          `${count} player${String(count) === "1" ? "" : "s"}`,
          state.players === String(count),
          () => updateForFilter("players", String(count)),
          "tone-mint",
        ),
      );
    });
    playersGroup.append(playersRow);
    filterBody.append(playersGroup);

    const statusGroup = el("div", { class: "facet-group" }, el("h3", {}, "Play status"));
    const statusRow = el("div", { class: "facet-row" });
    statusRow.append(chip("Any status", !state.status, () => updateForFilter("status", "")));
    STATUS_OPTIONS.forEach(([value, label]) => {
      statusRow.append(
        chip(label, state.status === value, () => updateForFilter("status", value), "tone-pink"),
      );
    });
    statusGroup.append(statusRow);
    filterBody.append(statusGroup);

    filterBody.append(
      el(
        "div",
        { class: "filter-footer" },
        el(
          "span",
          { class: "note" },
          activeFilterCount()
            ? `${activeFilterCount()} filter${activeFilterCount() === 1 ? "" : "s"} on`
            : "No filters on",
        ),
        activeFilterCount()
          ? el(
              "button",
              {
                class: "btn btn-keycap-sm btn-ghost",
                type: "button",
                on: {
                  click: () => {
                    state.genre = "";
                    state.players = "";
                    state.status = "";
                    if (!platformSlug) state.platform = "";
                    renderFilters();
                    persistQuery();
                    load({ reset: true });
                  },
                },
              },
              "Clear filters",
            )
          : null,
      ),
    );
  }

  function selectedPlatform() {
    if (platformSlug) return currentPlatform;
    return matchPlatform(platforms, state.platform);
  }

  async function load({ reset = false } = {}) {
    if (loading && !reset) return;
    const token = ++queryToken;
    controller?.abort();
    controller = new AbortController();

    if (reset) {
      items = [];
      offset = 0;
      setCount("Loading the shelf…");
      gridSlot.replaceChildren(skeletonGrid(12));
      clear(loadMoreWrap);
    }
    loading = true;

    try {
      const result = await api.roms(
        { ...paramsFor(state, selectedPlatform()), offset },
        { signal: controller.signal },
      );
      if (token !== queryToken) return;
      const next = Array.isArray(result?.items) ? result.items : [];
      total = Number(result?.total ?? next.length);
      offset += next.length;
      items = reset ? next : items.concat(next);
      renderGrid();
    } catch (error) {
      if (isAbortError(error) || token !== queryToken) return;
      if (reset) {
        items = [];
        gridSlot.replaceChildren(errorState(error, () => load({ reset: true })));
        setCount("The shelf didn't load.");
        clear(loadMoreWrap);
      }
    } finally {
      if (token === queryToken) loading = false;
    }
  }

  function renderGrid() {
    if (!items.length) {
      gridSlot.replaceChildren(
        emptyState({
          title: state.q ? "No games matched" : "No games here yet",
          note: state.q
            ? `Nothing matched “${state.q}”. Try a shorter search or clear the filters.`
            : "Try a different filter. If RomM has games here, they will show up after the next scan.",
          action: el(
            "a",
            { class: "btn btn-keycap btn-yellow", href: platformSlug ? `#/platform/${platformSlug}` : "#/library" },
            "Reset filters",
          ),
        }),
      );
      setCount("0 games");
      clear(loadMoreWrap);
      return;
    }

    const grid = el("div", { class: "game-grid" });
    items.forEach((rom, index) => grid.append(gameCard(rom, index)));
    gridSlot.replaceChildren(grid);

    setCount(
      total > items.length ? `Showing ${items.length} of ${total} games` : `${total} game${total === 1 ? "" : "s"}`,
    );

    clear(loadMoreWrap);
    if (items.length < total) {
      loadMoreWrap.append(
        el(
          "button",
          {
            class: "btn btn-keycap btn-yellow",
            type: "button",
            on: { click: () => load() },
          },
          "Load more",
        ),
      );
    }
  }

  searchInput.addEventListener("input", () => {
    state.q = searchInput.value.trim();
    persistQuery();
    window.clearTimeout(searchInput._timer);
    searchInput._timer = window.setTimeout(() => load({ reset: true }), 320);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    window.clearTimeout(searchInput._timer);
    load({ reset: true });
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    persistQuery();
    load({ reset: true });
  });

  if (state.q || state.genre || state.players || state.status || state.platform) {
    filterPanel.open = true;
  }

  (async () => {
    const [platformsResult, filtersResult] = await Promise.allSettled([
      api.platforms(),
      api.filters(),
    ]);

    platforms =
      platformsResult.status === "fulfilled" && Array.isArray(platformsResult.value)
        ? platformsResult.value
        : [];
    filters = filtersResult.status === "fulfilled" ? filtersResult.value : null;

    if (platformSlug) {
      currentPlatform = matchPlatform(platforms, platformSlug);
      if (!currentPlatform) {
        title.textContent = "Shelf not found";
        subtitle.textContent = "That system isn't in this RomM library.";
        gridSlot.replaceChildren(
          emptyState({
            title: "No such system",
            note: "The platform slug doesn't match anything RomM returned. Head back and pick a system from the shelf.",
            action: el("a", { class: "btn btn-keycap btn-yellow", href: "#/library" }, "All systems"),
          }),
        );
        setCount("0 games");
        return;
      }

      title.textContent = currentPlatform.display_name || currentPlatform.name;
      document.title = `${title.textContent} · Binus Arcade`;
      subtitle.textContent =
        currentPlatform.description ||
        `${currentPlatform.rom_count || 0} games on this shelf.`;
      clear(headNotes);
      headNotes.append(
        el("span", { class: "washi-tape" }, `${currentPlatform.rom_count || 0} games`),
        el("span", { class: "washi-tape mint" }, "Save synced"),
      );
    } else {
      const total = platforms.reduce((sum, platform) => sum + (Number(platform.rom_count) || 0), 0);
      clear(headNotes);
      if (platforms.length) {
        headNotes.append(
          el("span", { class: "washi-tape" }, `${platforms.length} systems`),
          el("span", { class: "washi-tape mint" }, `${total} games`),
        );
      }
    }

    if (!platforms.length && platformsResult.status === "rejected") {
      gridSlot.replaceChildren(errorState(platformsResult.reason, () => location.reload()));
      setCount("The shelf didn't load.");
      return;
    }

    renderFilters();
    await load({ reset: true });
  })();

  return root;
}
