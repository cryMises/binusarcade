# binusarcade — Build Prompt & Plan

App: **binusarcade**. A replacement web frontend for the user's self-hosted
RomM game library. Phone-first PWA, full functionality++. Hosted on GitHub
Pages. Design language lifted from the user's own katchup.pages.dev.

Status: plan only. No code exists yet. Build order: M0 → M1 → M2 → M3 → M4
(v1), then v2, then v3.

---

## 1. THE PROMPT (paste-ready — hand this to the building agent)

> Build **binusarcade**, a phone-first PWA web frontend for a self-hosted RomM
> 5.4.1 game library, deployed as a static site on GitHub Pages at
> `https://crymises.github.io/binusarcade/` from repo `cryMises/binusarcade`.
>
> **Backend (already running, do not touch its data):** RomM 5.4.1 + MariaDB
> at `https://crymises-music.centralindia.cloudapp.azure.com:8449`, 185 games
> across 11 platforms (atari2600, browser, gb, gba, gbc, genesis, nds, nes,
> ps, psp, snes). Its full API is documented at the server's own
> `/openapi.json` (226 endpoints, verified). Auth is the SAME username/password
> login as stock RomM, via session cookie — no new accounts, no tokens to
> manage. Every API call uses `credentials: "include"`. Never hardcode a
> platform list: render platforms from `GET /api/platforms` (N64 is coming).
>
> **Stack:** static site, no framework, no build step — the same approach as
> the sibling site katchup.pages.dev (repo `cryMises/katchup`). Vanilla JS
> modules, hand-written CSS. GitHub Actions deploys `main` to Pages. PWA:
> `manifest.json` + service worker caching the app shell only (never game
> files). Do not introduce a framework, bundler, or Tailwind without asking.
>
> **Design (non-negotiable, tokens below in §4):** the katchup design system —
> cream dot paper, cocoa ink, six flat colors (never gradients), Baloo 2 /
> Nunito / Permanent Marker, 18px radius, 2.5px borders, hard offset shadows,
> washi tape, perforated tickets, keycap buttons, cartridge cards, pop easing.
> Light mode AND dark mode from day one; dark mode is a night-paper
> translation with equal whimsy, not a dimmed inversion. Contrast rule:
> bright fills NEVER carry white text — cocoa ink on every color. Reference
> mocks: `binusarcade-mock-light.png` and `binusarcade-mock-dark.png`
> (phone Home screen, both modes, real covers).
>
> **v1 scope (this build):** login → Home (Continue Playing, Recently Added,
> systems shelf) → platform library grids → search + filters → game detail
> page → in-browser play (EmulatorJS for cartridge/disc systems, Ruffle for
> Flash) with saves and save states staying server-side in RomM exactly as
> stock RomM handles them. Everything managerial (scans, users, settings)
> links back to stock RomM at :8449. v2 (personal + collections) and v3
> (leaderboard/stats/recommendations) are later milestones — build the API
> layer so they slot in, do not build their UI now.
>
> **Full parity goal:** §9 of this plan inventories EVERY feature of
> stock RomM — admin console included — each mapped to a milestone or
> explicitly marked server-only / surface-only. v1 (M0–M4) ships browse +
> play with admin linking back to stock RomM; M5 builds the admin console
> in this design language; v2/v3/parity close the rest. Nothing in §9 may
> be silently dropped — if a feature can't be built, record why in the
> milestone note.
>
> **Server-side prerequisite (the user runs this, not you):**
> `ROMM_CORS_ALLOWED_ORIGINS=https://crymises.github.io` on the romm
> container + recreate. Until then, cross-origin calls fail with
> `400 Disallowed CORS origin` — that is expected, not a bug in your code.
> Develop against the live `/openapi.json` and mock responses locally until
> CORS is open, then verify live.
>
> **Hard rules:** never invent API shapes — verify each endpoint against the
> live `/openapi.json` before coding it. Never store or log credentials,
> tokens, or passwords. Never modify the RomM server, its database, or the
> game files. Never claim a feature works without running it against the
> live server in a real phone-sized browser. Follow the acceptance criteria
> in §6; a milestone is done only when every box is checked live.

---

## 2. DECISIONS LOCKED (do not re-open without the user)

| Decision | Choice | Date / note |
|---|---|---|
| Plan | Mix A + C: full web app, phone-first, one codebase | 2026-11-12, user picked |
| Name | binusarcade | 2026-11-12, user-named |
| Hosting | GitHub repo + Pages + Actions deploy | 2026-11-12 |
| Repo | `cryMises/binusarcade` → `crymises.github.io/binusarcade/` | proposed, unconfirmed |
| Big Picture shell (Plan B) | Deferred; may return as a TV-mode view | 2026-11-12 |
| Design skin | katchup design language (see §4) | 2026-11-12, redirected from arcade-hall skin (dropped) |
| Mascot "Carty" (cartridge) | Undecided — optional v1 stretch | user has not said yes/no |
| Auth | Same RomM login, session cookie | verified approach |
| Saves | Server-side in RomM, nothing forks | must keep working with stock RomM |
| Admin | Links back to stock RomM in v1 | all plans |

## 3. ARCHITECTURE

```
binusarcade/
├── index.html            # shell: header, views container, bottom nav, login gate
├── manifest.json         # PWA: name binusarcade, theme colors per mode
├── sw.js                 # app-shell cache only; network-first for API
├── css/
│   ├── tokens.css        # §4 tokens: light + [data-theme="dark"] overrides
│   ├── components.css    # marker, tape, ticket, cart, keycap, chip, ledger, jewel
│   └── views.css         # home / library / detail / play layouts
├── js/
│   ├── config.js         # API_BASE, ROMM_ORIGIN, feature flags (v2/v3 off)
│   ├── api.js            # fetch wrapper: credentials:include, CSRF, errors
│   ├── auth.js           # login/logout/session check (see §5.1 spike)
│   ├── router.js         # hash router: #/ #/platform/:slug #/game/:id #/play/:id
│   ├── views/
│   │   ├── home.js       # rails: continue playing, recently added, systems
│   │   ├── library.js    # grid + search + filters + sort
│   │   ├── detail.js     # game page: art, meta, personal tab, play button
│   │   ├── play.js       # EmulatorJS / Ruffle embed + save wiring
│   │   ├── jukebox.js    # v3: soundtrack browser + playlists + player
│   │   ├── profile.js    # M4: account, avatar, tokens, notifications
│   │   ├── admin/        # M5: overview, users, scans, metadata, platforms,
│   │   │                 # firmware, settings, logs, exports, devices
│   │   └── devices.js    # parity: pairing approvals, installs, sync sessions
│   ├── components.js     # ticket/card/chip/tape renderers (shared)
│   └── theme.js          # light/dark toggle, prefers-color-scheme default, persisted
├── icons/                # PWA icons (192/512, maskable) — Carty or "B" tile
└── .github/workflows/pages.yml  # deploy main → Pages
```

**Why no framework:** katchup proves the pattern works for this user and this
hosting; zero build tooling means any fix is a file edit + push; the app is
small enough that vanilla modules stay readable. Revisit only if v3 state
management gets painful.

**State:** view modules fetch from the API on navigation; a tiny in-memory
cache (Map, 60s TTL) for platforms + home rails. No global store in v1.

**Performance budget (phone-first):** first paint < 1.5s on 4G; covers
lazy-loaded (`loading="lazy"`); rails render from one list call each; no
request waterfalls (parallel independent calls, sequential only where the
API forces it).

## 4. DESIGN SYSTEM (verbatim from cryMises/katchup)

Source of truth: `cryMises/katchup` repo, `css/tokens.css` +
`css/components.css` (read them before writing a line of CSS). Summary:

### Tokens — light (default)
```css
--cream:#FBF3E4; --panel:#FFFFFF; --cocoa:#2E1E14; --ink-soft:#6A5344;
--red:#FF4949; --mint:#2FE0A8; --blue:#5B8CFF;
--yellow:#FFCE00; --pink:#FF7BB8; --orange:#FF8A3D;
--line:rgba(46,30,20,.18);
--r:18px; --elev:0 5px 0 var(--cocoa); --elev-sm:0 3px 0 var(--cocoa);
--display:'Baloo 2',system-ui,sans-serif;
--body:'Nunito',system-ui,sans-serif;
--marker:'Permanent Marker',cursive;
--pop:cubic-bezier(.34,1.56,.64,1); --settle:cubic-bezier(.22,1,.36,1);
```
Background: scrapbook dot paper — flat SVG dots (cocoa @ 7%, 22px grid),
NOT a gradient. `::selection` yellow. Tabular numerals for figures.

### Tokens — dark (`[data-theme="dark"]`, night paper)
```css
--cream:#1E130C;            /* deep cocoa paper */
--panel:#2E1E14;            /* cocoa cards */
--cocoa:#FBF3E4;            /* cream becomes the ink/border color */
--ink-soft:#C9B8A6;
--line:rgba(251,243,228,.25);
/* six accent colors UNCHANGED, same brightness */
/* hard shadows become solid black: --elev:0 5px 0 #000 */
/* dots: cream @ 8% on the dark paper */
```
Dark-mode rules: same tilts, tape, stamps, squiggles, marker titles, pop
motion. Body ink cream. Bright fills STILL carry cocoa ink (never white
text on a bright fill). Recessed trays go darker (`#120B06`). Borders cream.

### Component kit (port from katchup, restyle for games)
- `.marker` — Permanent Marker titles, `rotate(-1.4deg)`, wobbly squiggle
  underline (SVG mask) in an accent color.
- `.washi-tape` — rotated tape badges (yellow/pink/mint/blue/red variants).
- `.tape-pin` — washi strip pinning a card to the wall.
- `.sticker-holo` — holographic seal, flat foil dots, no gradient.
- `.btn-keycap` — chunky pill buttons, 2.5px border, 4px hard shadow,
  press-down to 1px on `:active`. THE Play button is a big mint keycap.
- `.deck-groove` — recessed tray (search bar, meters).
- `.jewel-led` — candy LED bead (server status, playing indicator).
- `.rubber-stamp` — rotated stamp badge (e.g. SAVE READY, NEW).
- `.ledger` — journal rows, dashed rules, big Baloo values (playtime!).
- `.teletype-ticket` — game ticket: panel + 2.5px border + hard shadow +
  perforation line + colored spine. The Continue Playing card IS a ticket.
- `.cart` — cartridge shelf card: spine, scroll-snap, picked state. System
  cards AND game cards use this skeleton.
- `.chip-topic` / `.chip-cat` — filter chips; selected = cocoa fill (light)
  or yellow fill (dark); status colors always with cocoa ink.
- `.block` — scrapbook photo block (detail page sections).
- Hover (fine pointers only): lift + slight rotate. Touch: no stuck hover.
- Motion: `--pop` for playful entrances, `--settle` for readable ones.
  Respect `prefers-reduced-motion`.

### Layout — Home (per the mocks)
Header: eyebrow (`YOUR LIBRARY · 185 GAMES`) → marker title `Binus Arcade`
+ red squiggle → washi tapes (systems count, news) → groove search bar.
Sections: Continue Playing (ticket w/ cover, playtime ledger, PLAY keycap,
stamp) → Systems Shelf (cart cards with cover thumbs + spines) → Recently
Added (tilted scrapbook grid, alternating ±1.5° rotation) → Filter chips →
bottom nav (Hall / Library / Scores / Me — Scores + Me are v2/v3 stubs
that link to stock RomM or show "soon" until their milestones land; decide
at M1, do not ship dead buttons with no destination).

### Game detail page
Cover (tilted, taped) + marker title + meta chips (platform, players,
genres) + playtime ledger + description + screenshots row (when the API
returns them) + Personal tab (rating, status, notes — v2, stub in v1 with
the API wired if trivial) + big PLAY keycap. Screenshots/art come from
RomM metadata; never hotlink external art in the shipped app.

## 5. API INTEGRATION NOTES

Base: `https://crymises-music.centralindia.cloudapp.azure.com:8449`.
All calls `credentials: "include"`, `Accept: application/json`. No custom
headers (a custom header triggers a preflight — keep it simple).

### 5.1 Auth spike (FIRST task in M1 — blocks everything)
RomM's `/api/login` is CSRF-walled for scripts. The stock web client logs
in from the browser fine. Spike: replicate the exact browser login flow
against the live server (fetch the login page/cookies, observe the CSRF
token exchange in the stock client's requests, reproduce with fetch).
Deliverable: a `login(username, password)` that works in a real browser
against the live server + a `me()` session check. If the session-cookie
route proves unworkable, fall back to RomM's Client API Token flow per the
RomM docs "Build your own" section — and report the change before building
on it. NEVER store the password beyond the login call; NEVER log it.

### 5.2 Endpoints (verify each against live /openapi.json first)
| Need | Endpoint (from the verified 226) |
|---|---|
| Platforms | `GET /api/platforms` |
| ROM list (paged, filtered) | `GET /api/roms` (confirm params: platform, search, ordering) |
| ROM detail | `GET /api/roms/{id}` |
| Cover / screenshots | fields on the ROM object (`url_cover`, screenshots) — confirm names |
| Game file for play | ROM content endpoint — confirm exact path + filename rules |
| Search | ROM list search param, or dedicated search endpoint if present |
| Saves / states | save + save-state endpoints — confirm upload/download flow |
| Continue playing / playtime | play-session / stats endpoints (confirm which feeds "continue") |
| Random game | `GET /api/roms/random` (v1 "Surprise me" if trivial, else v3) |
| Similar games | `GET /api/roms/{id}/similar` (v3) |
| Recommendations | `GET /api/recommendations` (v3) |
| Activity feed | `GET /api/activity` (v3) |
| Stats / leaderboard | `GET /api/stats`, `GET /api/play-sessions` (v3) |
| Collections | collection endpoints (v2) |

### 5.3 Play
- Embed EmulatorJS exactly the way stock RomM's player does (same core
  mapping, same content URL pattern). Ruffle for `browser` (Flash) titles.
- Saves/states: use RomM's own save endpoints so progress syncs with stock
  RomM and other clients. Verify: play 1 minute in the new frontend, check
  the save appears in stock RomM, and vice versa.
- KNOWN LIMITATION (do not re-litigate, do surface it): phone touch does
  NOT reach the DS touch screen in the web player (verified 2026-11-11).
  Tag touch-heavy DS games in the UI ("needs mouse/stylus" note) instead of
  pretending it works. Button-driven games are unaffected.
- Per-platform playability: inherit stock RomM's behavior. If a platform
  doesn't play in stock RomM's web player, it doesn't play here either —
  show a clear "open in stock RomM" path, never a broken Play button.
- PS1 play testing depends on the BIOS file being placed on the server
  (unconfirmed) — note it in the test report, don't block the build on it.

## 6. MILESTONES & ACCEPTANCE CRITERIA

### M0 — Repo + deploy + CORS (foundation)
- [ ] Repo `cryMises/binusarcade` created, `main` branch, Pages + Actions
      workflow deploying on push; placeholder page live at the Pages URL.
- [ ] User runs the CORS fix on the server; verify a cross-origin fetch from
      the Pages origin returns data (not `400 Disallowed CORS origin`).
- [ ] `css/tokens.css` + `css/components.css` ported (light + dark), fonts
      loading (Baloo 2, Nunito, Permanent Marker), theme toggle working.
- [ ] Login spike (§5.1) done: login + session check work live in a browser.

### M1 — Shell + Home
- [ ] Login gate, logout, session persistence across reloads.
- [ ] Home renders live data: Continue Playing rail, Recently Added grid,
      Systems shelf from `/api/platforms`. No hardcoded games/platforms.
- [ ] Light + dark, phone (360px) + desktop (1280px), no horizontal scroll.
- [ ] Theme toggle persisted; respects `prefers-color-scheme` on first run.

### M2 — Library + search
- [ ] Platform pages: full grids, lazy covers, correct counts.
- [ ] Search (debounced) + filters (platform, genre, players, status) +
      sort; empty state with Carty or a tape note (no blank screens).
- [ ] Filter state survives back/forward navigation (hash router).

### M3 — Detail + play
- [ ] Game page: all metadata the API returns, screenshots when present,
      PLAY launches the right emulator, game boots and is controllable.
- [ ] Save round-trip verified both directions (new frontend ↔ stock RomM).
- [ ] Save states list/load work where the API supports them.
- [ ] DS touch limitation surfaced on touch-heavy DS titles.
- [ ] "Open in stock RomM" + "Admin" links present on every relevant view.

### M4 — PWA + polish (v1 done)
- [ ] Installable: manifest + icons + service worker; shell works offline
      with a friendly offline tape note; API calls fail gracefully online.
- [ ] Lighthouse: performance + accessibility pass on a phone profile; all
      interactive elements ≥ 44px targets; visible focus states.
- [ ] Full walkthrough on a real Android phone (the user's POCO): login →
      browse → search → play 2 games (one GBA, one NDS) → save → reopen in
      stock RomM → save present. Screenshots attached to the milestone note.
- [ ] README in the repo: what it is, how to run locally, the CORS step,
      how to deploy, where v2/v3 plug in.

### M5 — Admin console (detailed; full spec in §9J)
- [ ] Admin route group, role-gated (non-admins redirected; nav hidden).
      Gating uses `GET /api/permissions/me`; the server remains the enforcer.
- [ ] Overview: stats, task status, heartbeat config, recent audit events.
- [ ] Users: list/create/edit/delete, roles, invite mint (role + expiry,
      QR + copy), permission groups matrix, per-user overrides, hidden
      entities. Invite → register round-trip verified end to end.
- [ ] Scans & tasks: run + monitor tasks, per-platform scan modes, the
      one-Complete-scan-at-a-time guard with cooldown note.
- [ ] Metadata: provider status, fix match, cover search, manual metadata
      edit, metadata update tasks.
- [ ] Platforms: add/edit/remove, bindings, versions, exclusions, scan +
      converto settings, unimported-folder pickup.
- [ ] Firmware: upload, list, status (PS1 BIOS presence surfaced).
- [ ] Settings: runtime-editable config only; env/config.yml shown
      read-only where the API returns it.
- [ ] Observability: logs, audit events, stats.
- [ ] Exports + feed URLs surfaced; streaming/devices admin only if
      enabled on the server.
- [ ] Danger treatment: confirms on destructive actions, typed confirm
      for filesystem deletes; no secrets displayed anywhere.
- [ ] Verified with a non-admin account that admin UI is unreachable.

### v2 — Personal + collections (after v1 ships)
Profile view (my playtime, my ratings/statuses/notes), collections
(manual + smart: Top Unplayed, Recently Added, Most Played), favorites,
"Surprise me" random game (mystery-cabinet treatment if the whimsy fits).

### v3 — Leaderboard / stats / recommendations
Playtime leaderboard across accounts (arcade high-score table styling was
proposed and may be revived here — ask the user), activity feed, similar
games, recommendations, profile stats. Shared logins (one combined clock)
must be explained in the UI, not hidden.

### Parity backlog (after v3, or as the server allows)
Everything in §9 marked Parity: streaming + memory cards (only if the
server enables them), netplay rooms, WebSocket live updates, OIDC login
button (only if configured), RetroAchievements UI, PICO-8 player, device
pairing/sync UI, reading progress. Each ships only when its server-side
gate is verified live — no UI for disabled backends.

## 7. RISKS & OPEN QUESTIONS

1. **CSRF login flow** — the biggest unknown. Spike first (M0/M1). If the
   session route fails, Client API Tokens are the documented fallback.
2. **CORS** — one env var, but the user must run it on the server. The app
   cannot be tested live until then; mock mode must be good enough to build
   against meanwhile.
3. **EmulatorJS core coverage** — N64/PSP in-browser play is weak or absent
   in EJS. The frontend must degrade honestly per platform (see §5.3).
4. **Cover gaps** — some games have no cover in RomM (metadata misses).
   Design a fallback tile (Carty silhouette + title) so grids never show
   broken images.
5. **1 GB server** — the API host is a 1 GB VM. Keep request counts low:
   paginate, cache platforms/rails briefly, no polling, no parallel
   fan-outs (sequential where the server is happier).
6. **Repo name / Pages URL** — `cryMises/binusarcade` is proposed, not
   confirmed. Confirm before M0, or the CORS origin + links shift.
7. **Carty mascot** — undecided. Build v1 without it unless the user says
   yes; the empty states must work either way.
8. **Streaming is probably not available** — emulator streaming needs
   broker containers the 1 GB VM likely doesn't run. Check
   `/api/streaming/config` first; if disabled, no streaming UI at all.
9. **Jukebox will be empty** — no soundtrack files exist in the library
   yet. Build the UI against the API; never fake tracks.
10. **Register view decision (M1)** — invite links point at stock RomM's
    /register. Decide whether binusarcade hosts its own register view
    (preferred) or deep-links; the invite flow must land in the branded
    app either way.
11. **Scope creep via parity** — §9 is large. Milestones are the fence:
    v1 ships without M5/v2/v3; each later milestone is separately
    accepted. Do not let parity work leak into M1–M4.

## 8. REFERENCES

- Design tokens + components: `cryMises/katchup` repo, `css/tokens.css`,
  `css/components.css` (also `css/motion.css`, `css/pranks*.css` for the
  mascot/cursor whimsy if Carty is approved).
- Live design reference: https://katchup.pages.dev/
- Mocks: `binusarcade-mock-light.png`, `binusarcade-mock-dark.png`
  (same folder as this plan).
- RomM docs: https://docs.romm.app/ — especially "Build your own"
  (Client API Tokens, Device Sync Protocol, API Reference, WebSockets) and
  the ecosystem catalog.
- RomM API: the server's own `/openapi.json` (authoritative, 226 endpoints).
- Earlier planning: `romm-frontend-revamp-plan.md` (plans A/B/C, decision
  log, verified foundation). Board v1 references (Channel 3, Jellyfin,
  ES-DE, Daijishō, Pegasus, Playnite) remain the functional skeleton.
- Known server facts: RomM 5.4.1 + MariaDB, saves in `romm/assets/`,
  secrets in `/opt/navidrome/.env` (never in chat), stock RomM at :8449.

---

## 9. FULL ROMM FEATURE INVENTORY (parity backlog)

Enumerated 2026-11-12 from the live `/openapi.json` (RomM 5.4.1, every
path read) plus docs.romm.app (Using / Administration / Developers). Every
feature of stock RomM is listed once, with its verified API backing, the
milestone that owns it, and the notes that keep it honest. Milestone
labels: M1–M5 = §6, v2/v3 = §6, Parity = gated/conditional (ships only
when its server-side gate is verified live), Surface = show/link it, don't
rebuild it, Server-only = document, don't build. Rule for every row:
re-verify the endpoints against the live spec at build time; the spec is
authoritative, this table is the map.

### 9A. Auth & accounts

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| Session login / logout | POST /api/login, POST /api/logout | M1 | CSRF spike §5.1; /api/heartbeat sets the CSRF token + returns base config |
| Current user / session check | GET /api/users/me | M1 | Drives gating + profile; null when logged out |
| My permissions (UI gating) | GET /api/permissions/me | M1 | UX hint only; the server enforces |
| Register via invite | POST /api/users/register | M1 | Own register view preferred (see risk 10); link = `/register?token=<jwt>` |
| Password reset (request + reset) | POST /api/forgot-password, POST /api/reset-password | M4 | Email delivery is server-side; UI only |
| OIDC login button | GET /api/login/openid, /api/oauth/openid | Parity | Render only if heartbeat config says OIDC is enabled; not currently configured |
| Account & profile | GET/PUT /api/users/{id} (confirm methods) | M4 | Username, email, password change |
| Avatar | GET /api/users/{id}/avatar | M4 | Shown next to community content/activity; upload method — confirm in spec |
| RetroAchievements link + refresh | POST /api/users/{id}/ra/refresh | Parity | RA fields on user/ROM schemas — confirm; achievements UI in parity backlog |
| Own Client API Tokens | GET/POST /api/client-tokens, DELETE /{id}, PUT /{id}/regenerate | M4 | For companion apps/devices; show a new token ONCE, never again, never log it |
| Own notification channels | GET/POST/PATCH /api/notification-channels/*, test, confirm, resend-code | M4 | Email channel + confirm-code flow; Apprise services = admin (see 9J) |

### 9B. Browse, search & library

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| Platforms list + detail | GET /api/platforms, /{id}, /identifiers | M1 | Never hardcode platforms; N64 arrives via this endpoint |
| ROM list (paged) | GET /api/roms | M1 | Confirm pagination + ordering params in spec |
| Lightweight ROM fetch | GET /api/roms/{id}/simple | M1 | No eager user_saves/states/screenshots — use for rails/cards |
| Filter facets | GET /api/roms/filters | M2 | Drives the filter UI; never hardcode facet values |
| Search | GET /api/roms?search_term | M2 | Multi-search with `\|`, hash search (CRC32/MD5/SHA-1/RA hash incl. CHD uncompressed SHA-1), alternative titles, relevance ordering (exact → starts-with → rest); `char_index` empty under relevance order |
| Random game | GET /api/roms/random | v2 (M1 stretch) | Scoped random; confirm scope params |
| Similar games | GET /api/roms/{id}/similar | v3 | Precomputed similarity graph (library-local, not IGDB's) |
| Recommendations | GET /api/recommendations | v3 | Similarity graph + live play history, ranked on demand |
| ROM by metadata provider / by hash | GET /api/roms/by-metadata-provider, /by-hash | Parity | Deep links + scanner tooling |
| Download single ROM | GET /api/roms/{id}/content/{file_name} (+ HEAD) | M1 | Permission-gated; respect the download scope |
| Bulk download (zip) | GET /api/roms/download | v3 | Zip of selected ROMs |
| ROM file listing + per-file delete | GET /api/roms/{id}/files, DELETE /api/roms/{id}/files/{file_id} | M5 | Multi-file ROMs; delete is editor/admin |
| Upload ROM (chunked) | POST /api/roms/upload/start, PUT chunk, POST complete/cancel | v3 | Chunked with progress UI; a scan picks the file up after |
| Physical games (add) | POST /api/roms/physical | v3 | Manual entry, auto-linked metadata, single quick scan |
| Convert single-file ROM to folder | POST /api/roms/{id}/convert-to-folder | M5 | Keeps id + relations, no rescan; clean no-op when already a folder |
| Delete ROMs (bulk) | POST /api/roms/delete | M5 | Library-only vs filesystem toggle; filesystem delete = typed confirm |
| Edit ROM metadata | PUT /api/roms/{id} | M5 | Incl. `raw_manual_metadata` + `alternative_names` — hand-set alt titles REPLACE provider titles |
| Fix match (metadata search) | GET /api/search/roms | M5 | Search providers, pick the match |
| Cover search | GET /api/search/cover | M5 | Cover providers in configured priority order |
| ROM binary identity | PUT /api/roms/{id}/identity | Parity | Client-extracted identity for ROMs the scan can't identify |
| Reading progress (documents) | GET /api/roms/{id}/files/{file_id}/progress | Parity | Confirm semantics in spec (document-type files) |
| Exports | POST /api/export/gamelist-xml, /api/export/pegasus | M5 | Writes into platform folders; admin |
| Feeds (external clients) | GET /api/feeds/webrcade, /tinfoil, /pkgi/ps3\|psvita\|psp, /fpkgi, /kekatsu, /pkgj/* | M5-Surface | List feed URLs + copy buttons; do not reimplement the feeds |

### 9C. Game detail & personal data

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| ROM detail | GET /api/roms/{id} | M1/M3 | Full schema: metadata, files, user data |
| User props (rating/status/…) | PUT /api/roms/{id}/props | M2/v2 | Confirm which fields live here vs the notes endpoint |
| Notes | GET/POST /api/roms/{id}/notes, PUT/DELETE /notes/{note_id}, /identifiers | v2 | Per-user notes; confirm visibility rules in spec |
| Screenshots (ROM folder) | POST /api/roms/{id}/screenshots, DELETE /{file_id} | M3 | ROM-folder store — distinct from the user gallery (9E) |
| Manuals | POST /api/roms/{id}/manuals, /redownload, /manuals/files POST/DELETE | M3 view, M5 manage | Document viewer; redownload re-fetches from the scraped URL; upload is editor+ |
| Walkthroughs | POST /api/roms/{id}/walkthroughs/files, POST /walkthroughs/gamefaqs, DELETE file | M3 view, M5 manage | GameFAQs fetch reduces the remote page to plain text server-side |
| Soundtracks (per-ROM) | GET /api/roms/{id}/soundtracks/metadata, POST upload, DELETE /{file_id} | v3 | Compact audio metadata; feeds the jukebox (9G) |
| Play sessions (playtime) | POST/GET /api/play-sessions, DELETE /{session_id} | M3 | The player ingests sessions; users can delete their own |
| Who's playing (per-ROM) | GET /api/activity/rom/{rom_id} | v2 | Live presence on the game page |

### 9D. Play

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| EmulatorJS | Content endpoint + EJS embed | M3 | Core mapping = stock RomM's; inherit per-platform behavior; never a Play button for a platform stock RomM can't play |
| js-dos (MS-DOS) | EJS DOS core | M3 | MS-DOS titles in the browser platform |
| Ruffle (Flash) | Ruffle embed | M3 | Flash titles in the browser platform |
| EasyRPG | GET /api/roms/{id}/easyrpg/{path} | M3 | Serves generated index.json + game/RTP files to the web player |
| PICO-8 | EJS PICO-8 core | Parity | Only if the library ever holds PICO-8 carts (none today) |
| Netplay | GET /api/netplay/list + socket.io | Parity | Rooms list; join flow via EJS netplay — confirm against docs/WebSockets page |
| Emulator streaming | /api/streaming/* (config, sessions claim/heartbeat/status/join, save-and-exit, volume, mute, save-state, load-state, swap-disc, release, joinable) | Parity-gated | ONLY if GET /api/streaming/config reports enabled; the 1 GB VM likely runs no broker — verify before any UI work (risk 8) |
| Memory cards (streaming) | /api/memory-cards/* (CRUD, shared, versions, visibility, delete) | Parity-gated | Same gate as streaming; versions + one-way sharing semantics |
| Player settings | EJS config | M3 | Controls, save-state slots, and whatever stock RomM's player exposes — mirror it |

### 9E. Saves, states, screenshots & assets

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| Saves CRUD | POST/GET /api/saves, GET/PUT/DELETE /{id}, GET /content, POST /delete, GET /summary, /identifiers | M3 | Upload/download; POST /{id}/downloaded confirms a download |
| Save visibility / favorite / labels / rename | PUT /api/saves/{id}/visibility, /favorite, /labels, /file-name | v2 | Owner-only; a rename carries the save's screenshot along |
| Save sync tracking | POST /api/saves/{id}/track, /untrack | Parity | Device-sync concern; surface only with the sync UI |
| States CRUD | Same shape under /api/states/* | M3 | Same treatment as saves throughout |
| State visibility / favorite / labels / rename | PUT /api/states/{id}/* | v2 | Same as saves |
| User gallery screenshots | POST /api/screenshots, GET /{id}/content, PUT /{id} (visibility) | v2 | Per-user gallery under the user's asset folder — NOT the ROM-folder screenshots (9C) |

### 9F. Collections

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| Manual collections CRUD | POST/GET /api/collections, GET/PUT/DELETE /{id}, /identifiers | v2 | Owner + share/unshare via PUT /{id}/visibility |
| Add ROMs to collection | POST /api/collections/{id}/roms | v2 | Atomic add without replacing the full list |
| Smart collections | POST/GET /api/collections/smart, /{id}, /identifiers, /visibility | v2 | Rule-based; needs a rule editor UI |
| Virtual collections | GET /api/collections/virtual, /{id}, /identifiers | v2 | Read-only groupings — confirm what generates them in spec/docs |

### 9G. Jukebox (music)

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| Track browser | GET /api/music/tracks | v3 | Flat, filterable, paginated soundtrack list |
| Favorites | GET/POST/DELETE /api/music/favorites | v3 | Per-user favorite tracks |
| Facets | GET /api/music/artists, /albums, /genres, /years, /game-genres, /platforms, /games | v3 | Browse lists with counts (`game-genres` = genres of the GAMES, distinct from track tags) |
| Stats | GET /api/music/stats | v3 | Library-wide track count + total duration |
| Playlists | GET/POST /api/music/playlists, GET/PUT/DELETE /{id}, GET/POST/DELETE /{id}/tracks, PUT /{id}/tracks/order | v3 | Own + other users' public playlists; reorder; hidden entries omitted from totals |
| Player UI | Audio element + track metadata | v3 | NOTE: no soundtrack files exist in the library today — the jukebox ships empty until soundtracks are added; build the UI, never fake tracks (risk 9) |

### 9H. Social & live

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| Notifications inbox | GET /api/notifications, POST /read, DELETE /{id}, DELETE dismiss-all | M4 | Newest first; mark-read takes ids or all |
| Notification channels | /api/notification-channels/* + /apprise-services, /parse, /test, /confirm, /resend-code | M4 own / M5 admin | Email confirm-code flow; Apprise service URLs parsed server-side; test sends a sample |
| Activity feed (who's playing) | GET /api/activity | v2 | Every active play session across all users |
| Device heartbeat (activity source) | POST/DELETE /api/activity/heartbeat | Server/device-side | External devices (muOS, Android) report play state; the frontend only reads /api/activity |
| Audit log | GET /api/audit-events | M5 | Admin sees everyone's, users see their own; filters: actor, action, category, target, search, date range, pagination |
| WebSockets (socket.io) | Docs: WebSockets page (live updates + netplay) | Parity | Scan progress, activity updates, netplay rooms; REST is the fallback — no polling loops in v1 |
| Avatars in community UI | GET /api/users/{id}/avatar | M4 | Next to activity + shared content |

### 9I. Devices & sync

| Feature | API (verified) | Milestone | Notes |
|---|---|---|---|
| Devices list / manage | GET/POST /api/devices, GET/DELETE /{device_id}, GET /online | Parity | Companion handhelds (muOS, Android); online = open socket or recent claim |
| Device pairing approval | GET /api/auth/device/pending/{user_code}, POST /approve, POST /deny | Parity | The user-facing half; init + token polling are device-side (open, rate-limited) |
| Install requests | POST/GET /api/devices/{id}/installs, POST /claim, PUT /{request_id}, GET /api/roms/{id}/installs | Parity | Queue ROM installs to devices; claim/update are device-side |
| Client tokens (admin) | GET /api/client-tokens/all, DELETE /{id}/admin, pair/exchange/status | M5 | Admin revoke-all view; pairing flow for companion apps |
| Sync protocol | POST /api/sync/negotiate, GET /api/sync/sessions[/{id}], POST /complete, POST /devices/{id}/push-pull | Parity | Save/state/play-session sync; frontend surfaces sessions + the manual push-pull trigger |

### 9J. Admin console (M5 — detailed)

Views, in nav order. Every view is role-gated on `GET /api/permissions/me`
(UX only — the server enforces). Design treatment: back-office scrapbook —
ledger tables, rubber stamps, keycap actions, a red-taped danger zone,
jewel-LED scan status, sticky-note toasts. Destructive actions get a
confirm dialog; filesystem deletes get a typed confirmation. Never display
a secret: provider keys are env-only — show status, never values.

1. **Overview** — `GET /api/stats` (library stats), `GET /api/tasks/status`
   (active/queued/completed/failed), `GET /api/heartbeat` (config summary),
   recent `GET /api/audit-events`. Quick actions: scan, invite, upload.
2. **Users & access** — `GET/POST /api/users`, `GET/PUT/DELETE
   /api/users/{id}` (confirm methods); roles; invite links
   `POST /api/users/invite-link` (role + expiration; build the link as
   `/register?token=<jwt>` — the API's `url` is null without
   ROMM_BASE_URL; reuse the proven invite flow); permission groups
   `GET/POST /api/permissions/groups`, `PUT/DELETE /{id}`; matrix
   vocabulary `GET /api/permissions/catalog`; per-user overrides
   `GET/PUT /api/permissions/users/{user_id}`; hidden entities
   `POST /api/permissions/hidden` (exactly one of user/group). The
   deny-by-default group for new users + promotion flow is the
   approval-queue substitute — the UI must make it obvious.
3. **Scans & tasks** — `GET /api/tasks` (grouped by type),
   `POST /api/tasks/run/{task_name}`, `POST /api/tasks/scan`,
   `GET /api/tasks/status`, `GET /api/tasks/{task_id}`. Scan modes
   Quick/Complete/Unidentified per platform. GUARD: never queue multiple
   Complete scans (Hasheous 429) — the UI enforces one at a time with a
   cooldown note. Watcher status via config/heartbeat (confirm).
4. **Metadata** — provider status `GET /api/heartbeat/metadata/{source}`
   (10+ providers, server-configured); fix match `GET /api/search/roms`;
   cover search `GET /api/search/cover`; manual metadata edit
   `PUT /api/roms/{id}`; metadata update + artwork tasks via
   `/api/tasks/run/{task_name}`.
5. **Platforms** — `POST /api/platforms`, `GET/PUT/DELETE /{id}`;
   bindings `POST /api/config/system/platforms`,
   `DELETE /api/config/system/platforms/{fs_slug}`; versions
   `POST /api/config/system/versions`,
   `DELETE /api/config/system/versions/{fs_slug}`; exclusions
   `POST /api/config/exclude`,
   `DELETE /api/config/exclude/{type}/{value}`; scan settings
   `PUT /api/config/scan`; converto settings
   `PUT /api/config/converto_settings`; unimported folders
   `GET /api/platforms/filesystem`; supported list
   `GET /api/platforms/supported`.
6. **Firmware** — `POST/GET /api/firmware`, `GET /api/firmware/{id}`,
   HEAD/GET `/api/firmware/{id}/content/{file_name}`,
   `POST /api/firmware/delete`. BIOS presence gates PS1 play — surface
   status per platform (scph1001.bin placement currently unconfirmed).
7. **Settings (runtime-editable only)** — `GET /api/config` (read); the
   scan + converto PUTs above. Everything else is env vars / `config.yml`
   = server-only: display read-only where the API returns it, never
   pretend to edit server files.
8. **Observability** — `GET /api/logs` (admin-only backfill),
   `GET /api/stats`, `GET /api/audit-events`, `GET /api/heartbeat`.
9. **Exports & feeds** — `POST /api/export/gamelist-xml`,
   `POST /api/export/pegasus`; feed URL list + copy (9B).
10. **Streaming admin** — `GET /api/streaming/containers`,
    `POST /api/streaming/desktop`, session release — ONLY if streaming is
    enabled on the server (risk 8).
11. **Devices admin** — `GET /api/client-tokens/all`, admin token delete,
    pairing approvals (9I).
12. **Setup wizard** — `GET /api/setup/library`, `POST /api/setup/platforms`
    — NOT APPLICABLE: the server is already set up (admin users exist).
    Noted only so nobody builds it by mistake.

### 9K. Server-only (document, do not build)

Environment variables, `config.yml` (except the runtime-editable bits in
9J.5/9J.7), OIDC provider setup, Sentry/OpenTelemetry, backup & restore
(ops runbooks), filesystem watcher tuning, the database. The frontend may
READ config via `GET /api/config` + `GET /api/heartbeat` and display it;
it must not claim to edit server files. The setup wizard (9J.12) is
likewise out of scope — the server is already running.
