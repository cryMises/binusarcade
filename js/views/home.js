import { api } from "../api.js";
import {
  clear,
  continueTicket,
  el,
  emptyContinue,
  errorState,
  gameCard,
  loadingLine,
  moreLink,
  openModal,
  platformCart,
  sectionHead,
  skeletonGrid,
  skeletonTicket,
  sumSessionMs,
  toast,
} from "../components.js";
import { platformLabelOf, RAIL_SIZE } from "../config.js";

function recentParams() {
  return {
    limit: RAIL_SIZE,
    order_by: "created_at",
    order_dir: "desc",
    with_total: false,
  };
}

async function loadContinue() {
  let result;
  try {
    result = await api.roms(
      { limit: 1, last_played: true, order_by: "last_played", order_dir: "desc" },
      { cacheKey: "home:continue" },
    );
  } catch {
    try {
      result = await api.roms({ limit: 1, last_played: true }, { cacheKey: "home:continue:plain" });
    } catch {
      return null;
    }
  }

  const rom = result?.items?.[0];
  if (!rom) return null;

  let sessions = [];
  try {
    sessions = await api.playSessions({ rom_id: rom.id, limit: 50 });
  } catch {
    /* playtime is a nicety; the ticket still works without it */
  }

  return {
    rom,
    playtime: sumSessionMs(sessions),
    sessions: Array.isArray(sessions) ? sessions.length : 0,
  };
}

async function loadRecent() {
  try {
    return await api.roms(recentParams(), { cacheKey: "home:recent" });
  } catch {
    try {
      return await api.roms({ limit: RAIL_SIZE }, { cacheKey: "home:recent:plain" });
    } catch {
      return null;
    }
  }
}

export function homeView(ctx) {
  const root = el("div", { class: "view wrap home-view" });

  const eyebrow = el("div", { class: "eyebrow" }, "Your library · warming up the tubes");
  const searchInput = el("input", {
    type: "search",
    name: "q",
    placeholder: "Search the arcade…",
    autocomplete: "off",
    "aria-label": "Search games",
    enterkeyhint: "search",
  });

  const search = el(
    "form",
    {
      class: "search-groove deck-groove",
      role: "search",
      on: {
        submit: (event) => {
          event.preventDefault();
          const q = searchInput.value.trim();
          ctx.navigate(`/library${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        },
      },
    },
    el("span", { class: "search-icon", "aria-hidden": "true" }, "⌕"),
    searchInput,
    el("button", { class: "btn btn-keycap btn-mint", type: "submit" }, "Search"),
  );

  const tapes = el("div", { class: "hero-tapes" });
  tapes.append(el("span", { class: "washi-tape yellow" }, "WASHi tape inside"));

  const hero = el(
    "header",
    { class: "hero" },
    eyebrow,
    el(
      "h1",
      { class: "hero-title" },
      el("span", { class: "marker-line" }, "Binus Arcade"),
    ),
    tapes,
    search,
    el("div", { class: "hero-doodle", "aria-hidden": "true" }),
  );

  const continueSection = el("section", { class: "section", "aria-labelledby": "continue-title" });
  const continueHead = el(
    "div",
    { class: "section-head" },
    el("h2", { id: "continue-title", class: "marker marker-sm" }, "Continue playing"),
  );
  continueSection.append(continueHead, skeletonTicket());

  const systemsSection = el("section", { class: "section", "aria-labelledby": "systems-title" });
  systemsSection.append(
    el(
      "div",
      { class: "section-head" },
      el("h2", { id: "systems-title", class: "marker marker-sm" }, "Systems shelf"),
    ),
    el("div", { class: "shelf", "aria-label": "Systems" }, skeletonGrid(3)),
  );

  const recentSection = el("section", { class: "section", "aria-labelledby": "recent-title" });
  recentSection.append(
    el(
      "div",
      { class: "section-head" },
      el("h2", { id: "recent-title", class: "marker marker-sm" }, "Recently added"),
      moreLink("#/library", "All games"),
    ),
    skeletonGrid(12),
  );

  root.append(hero, continueSection, systemsSection, recentSection);

  (async () => {
    const [platformsResult, recentResult, continueResult] = await Promise.allSettled([
      api.platforms(),
      loadRecent(),
      loadContinue(),
    ]);

    const platforms =
      platformsResult.status === "fulfilled" && Array.isArray(platformsResult.value)
        ? platformsResult.value.filter((platform) => Number(platform.rom_count) > 0)
        : [];

    const total = platforms.reduce((sum, platform) => sum + (Number(platform.rom_count) || 0), 0);
    eyebrow.textContent = total
      ? `Your library · ${total} games`
      : "Your library · find your next tape";

    clear(tapes);
    if (platforms.length) {
      tapes.append(
        el("span", { class: "washi-tape" }, `${platforms.length} systems`),
        el("span", { class: "washi-tape mint" }, `${total} games`),
        el("span", { class: "washi-tape blue" }, "Browser + phone"),
      );
    } else {
      tapes.append(el("span", { class: "washi-tape" }, "Browser + phone"));
    }

    if (continueResult.status === "fulfilled" && continueResult.value) {
      const { rom, playtime, sessions } = continueResult.value;
      clear(continueSection);
      continueSection.append(continueHead, continueTicket(rom, { playtime, sessions }));
    } else {
      clear(continueSection);
      continueSection.append(continueHead, emptyContinue());
    }

    clear(systemsSection);
    systemsSection.append(
      el(
        "div",
        { class: "section-head" },
        el("h2", { class: "marker marker-sm" }, "Systems shelf"),
        moreLink("#/library", "Browse"),
      ),
    );

    if (platforms.length) {
      const shelf = el("div", { class: "shelf", "aria-label": "Systems" });
      platforms
        .slice()
        .sort((a, b) => (b.rom_count || 0) - (a.rom_count || 0) || String(a.name).localeCompare(String(b.name)))
        .forEach((platform) => shelf.append(platformCart(platform)));
      systemsSection.append(shelf);
    } else if (platformsResult.status === "rejected") {
      systemsSection.append(
        errorState(platformsResult.reason, () => {
          toast("Refreshing the shelf…");
          location.reload();
        }),
      );
    } else {
      systemsSection.append(
        emptyStateFor("No systems on the shelf", "RomM returned no platforms with games yet."),
      );
    }

    clear(recentSection);
    recentSection.append(
      el(
        "div",
        { class: "section-head" },
        el("h2", { class: "marker marker-sm" }, "Recently added"),
        moreLink("#/library", "All games"),
      ),
    );

    if (recentResult.status === "fulfilled" && recentResult.value?.items?.length) {
      const grid = el("div", { class: "game-grid" });
      recentResult.value.items.forEach((rom, index) => grid.append(gameCard(rom, index)));
      recentSection.append(grid);
    } else if (recentResult.status === "rejected") {
      recentSection.append(
        errorState(recentResult.reason, () => location.reload()),
      );
    } else {
      recentSection.append(
        emptyStateFor(
          "No new tapes yet",
          "When RomM scans a game, it will show up here.",
          el("a", { class: "btn btn-keycap btn-yellow", href: "#/library" }, "Open library"),
        ),
      );
    }
  })();

  return root;
}

function emptyStateFor(title, note, action) {
  return el(
    "div",
    { class: "empty-state" },
    el("div", { class: "empty-tape", "aria-hidden": "true" }, el("span", { class: "reel-line" })),
    el("h2", {}, title),
    el("p", { class: "note" }, note),
    action || null,
  );
}

/* Keep platformLabelOf imported for future rails without another import. */
void platformLabelOf;
void loadingLine;
void openModal;
void skeletonTicket;
