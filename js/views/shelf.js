import { api, isAbortError } from "../api.js";
import {
  clear,
  el,
  emptyState,
  errorState,
  gameCard,
  icon,
  loadingLine,
  siteFooter,
} from "../components.js";
import { PAGE_SIZE } from "../config.js";
import { t } from "../i18n.js";

const SEGMENTS = [
  { key: "all", label: "All games", icon: "grid", params: () => ({}) },
  { key: "incomplete", label: "In progress", icon: "play", params: () => ({ statuses: ["incomplete"] }) },
  { key: "finished", label: "Finished", icon: "trophy", params: () => ({ statuses: ["finished"] }) },
  { key: "completed_100", label: "100%", icon: "trophy", params: () => ({ statuses: ["completed_100"] }) },
  { key: "retired", label: "Retired", icon: "pause", params: () => ({ statuses: ["retired"] }) },
  { key: "never_playing", label: "Never playing", icon: "close", params: () => ({ statuses: ["never_playing"] }) },
  { key: "last_played", label: "Last played", icon: "refresh", params: () => ({ last_played: true, order_by: "last_played", order_dir: "desc" }) },
  { key: "favorite", label: "Favorites", icon: "save", params: () => ({ favorite: true }) },
];

function stateFromQuery(query) {
  return { segment: query.get("segment") || "all" };
}

function queryFromState(state) {
  const params = new URLSearchParams();
  if (state.segment && state.segment !== "all") params.set("segment", state.segment);
  return params;
}

function segmentByKey(key) {
  return SEGMENTS.find((seg) => seg.key === key) || SEGMENTS[0];
}

function statusLabel(status) {
  const map = {
    INCOMPLETE: t("In progress"),
    FINISHED: t("Finished"),
    COMPLETED_100: t("100%"),
    RETIRED: t("Retired"),
    NEVER_PLAYING: t("Never playing"),
  };
  return map[status] || "";
}

function romUserBadge(rom) {
  const ru = rom?.rom_user;
  if (!ru || typeof ru !== "object") return null;

  const parts = [];
  const status = statusLabel(ru.status);
  if (status) parts.push(el("span", { class: "chip" }, status));

  const rating = Number(ru.rating) || 0;
  if (rating > 0) parts.push(el("span", { class: "chip" }, `★ ${rating}/5`));

  const completion = Number(ru.completion) || 0;
  if (completion > 0) parts.push(el("span", { class: "chip" }, `${completion}%`));

  const lastPlayed = ru.last_played;
  if (lastPlayed) {
    try {
      const d = new Date(lastPlayed);
      if (!Number.isNaN(d.getTime())) {
        parts.push(
          el(
            "span",
            { class: "chip" },
            t("Last played {date}", {
              date: d.toLocaleDateString(document.documentElement.lang || "id", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            }),
          ),
        );
      }
    } catch {
      /* ignore */
    }
  }

  if (!parts.length) return null;
  return el("div", { class: "shelf-badges" }, ...parts);
}

function shelfCard(rom, index) {
  const card = gameCard(rom, index);
  const badge = romUserBadge(rom);
  if (badge) card.append(badge);
  return card;
}

export function shelfView(ctx) {
  const state = stateFromQuery(ctx.query);
  const root = el("div", { class: "view wrap shelf-view" });

  let counts = {};
  let items = [];
  let total = 0;
  let offset = 0;
  let loading = false;
  let queryToken = 0;
  let controller = null;
  let availableSegments = [];

  const title = el("h1", { class: "marker" }, t("My shelf"));
  const subtitle = el("p", { class: "note" }, t("Your progress across the library."));
  const head = el(
    "header",
    { class: "library-head shelf-head" },
    el("div", { class: "eyebrow" }, t("Personal")),
    title,
    subtitle,
  );

  const countsRow = el("div", { class: "shelf-counts stats-grid" });
  const chipsRow = el("div", { class: "filter-row shelf-chips", role: "tablist", "aria-label": t("Shelf") });
  const grid = el("div", { class: "showcase-grid" });
  const moreWrap = el("div", { class: "load-more" });

  root.append(head, countsRow, chipsRow, grid, moreWrap, siteFooter());

  function updateUrl() {
    const next = queryFromState(state);
    const hash = next.toString() ? `#/shelf?${next.toString()}` : "#/shelf";
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  function renderChips() {
    clear(chipsRow);
    for (const seg of availableSegments) {
      const active = state.segment === seg.key;
      const count = counts[seg.key];
      const label = count != null ? `${t(seg.label)} (${count})` : t(seg.label);
      chipsRow.append(
        el(
          "button",
          {
            class: `chip chip-filter${active ? " is-active" : ""}`,
            type: "button",
            role: "tab",
            "aria-selected": String(active),
            on: {
              click: () => {
                if (state.segment === seg.key) return;
                state.segment = seg.key;
                updateUrl();
                renderChips();
                load(true);
              },
            },
          },
          label,
        ),
      );
    }
  }

  function renderCounts() {
    clear(countsRow);
    for (const seg of availableSegments) {
      const count = counts[seg.key];
      if (!(count > 0)) continue;
      countsRow.append(
        el(
          "div",
          { class: "stat-card shelf-stat" },
          el("span", { class: "stat-icon", "aria-hidden": "true" }, icon(seg.icon || "grid", 18)),
          el("span", { class: "stat-value" }, String(count)),
          el("span", { class: "stat-label" }, t(seg.label)),
        ),
      );
    }
  }

  async function loadCounts() {
    const results = await Promise.allSettled(
      SEGMENTS.map((seg) =>
        api.roms({ limit: 1, with_total: true, ...seg.params() }, { signal: controller?.signal }),
      ),
    );
    counts = {};
    availableSegments = [];
    SEGMENTS.forEach((seg, i) => {
      const r = results[i];
      if (r.status === "fulfilled") {
        const c = Number(r.value?.total);
        if (Number.isFinite(c)) counts[seg.key] = c;
      }
    });
    // Keep "all" if present; keep others only if > 0. "Remove if no data".
    for (const seg of SEGMENTS) {
      const c = counts[seg.key];
      if (seg.key === "all") {
        if (c > 0) availableSegments.push(seg);
      } else if (c > 0) {
        availableSegments.push(seg);
      }
    }
    // Ensure selected segment is available
    if (!availableSegments.some((s) => s.key === state.segment)) {
      state.segment = availableSegments[0]?.key || "all";
      updateUrl();
    }
  }

  async function load(reset = false) {
    if (loading) return;
    const token = ++queryToken;
    controller?.abort();
    controller = new AbortController();
    loading = true;

    if (reset) {
      offset = 0;
      items = [];
      clear(grid);
      grid.append(loadingLine(t("Loading your shelf…")));
      clear(moreWrap);
    }

    const seg = segmentByKey(state.segment);
    const params = {
      limit: PAGE_SIZE,
      offset,
      with_total: true,
      order_by: "name",
      order_dir: "asc",
      ...seg.params(),
    };
    // segment params may override order
    if (seg.params().order_by) {
      params.order_by = seg.params().order_by;
      params.order_dir = seg.params().order_dir || "desc";
    }

    try {
      const data = await api.roms(params, { signal: controller.signal });
      if (token !== queryToken) return;
      const pageItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      total = Number.isFinite(Number(data?.total)) ? Number(data.total) : pageItems.length;
      items = reset ? pageItems : items.concat(pageItems);
      offset = items.length;

      clear(grid);
      if (!items.length) {
        grid.append(
          emptyState(
            t("Nothing here yet"),
            seg.key === "all"
              ? t("Your shelf will fill up as you play and track games in RomM.")
              : t("No games in this section yet."),
            el("a", { class: "btn btn-keycap-sm btn-yellow", href: "#/library" }, icon("grid", 18), t("Browse the library")),
          ),
        );
      } else {
        items.forEach((rom, i) => grid.append(shelfCard(rom, i)));
      }

      clear(moreWrap);
      if (items.length < total) {
        moreWrap.append(
          el(
            "button",
            {
              class: "btn btn-keycap-sm btn-yellow",
              type: "button",
              on: { click: () => load(false) },
            },
            t("Load more"),
          ),
        );
      }
    } catch (error) {
      if (token !== queryToken || isAbortError(error)) return;
      clear(grid);
      grid.append(errorState(error, { onRetry: () => load(true) }));
    } finally {
      if (token === queryToken) loading = false;
    }
  }

  async function init() {
    controller = new AbortController();
    clear(grid);
    grid.append(loadingLine(t("Loading your shelf…")));
    try {
      await loadCounts();
      if (!availableSegments.length) {
        clear(countsRow);
        clear(chipsRow);
        clear(grid);
        grid.append(
          emptyState(
            t("Your shelf is empty"),
            t("Play or track games in RomM and they’ll show up here."),
            el("a", { class: "btn btn-keycap-sm btn-yellow", href: "#/library" }, icon("grid", 18), t("Browse the library")),
          ),
        );
        return;
      }
      renderCounts();
      renderChips();
      await load(true);
    } catch (error) {
      if (isAbortError(error)) return;
      clear(grid);
      grid.append(errorState(error, { onRetry: init }));
    }
  }

  init();

  return {
    el: root,
    cleanup() {
      queryToken += 1;
      controller?.abort();
    },
  };
}
