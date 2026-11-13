# binusarcade — Continuation Plan: remaking the whole of RomM

**From the current frontend, not from scratch.** Audited 2026-11-13 from repo
`cryMises/binusarcade` (`main`) — every file read, every API path in
`js/api.js` extracted, server gates re-checked live via `/api/heartbeat`.
This plan continues the v1 the laptop agent built; it does not restart it.

**Relationship to the original plan:** `binusarcade-build-plan.md` (§1–§9)
remains the parity map — its §9 inventory (every RomM 5.4.1 feature, 226
endpoints) is still the checklist. But three of its premises are now stale:
it says no code exists (code exists), it says GitHub Pages (production is
Cloudflare Pages), and it says session-cookie auth (the app uses OAuth2
tokens). This document records what actually happened and plans the rest.
Do not edit the original plan's history; build from this one.

**Current deployment state (2026-11-13):** `binusarcade.pages.dev` is being
turned into a redirect to stock RomM (`_redirects`, 302) — the frontend
code stays in the repo, undeployed, until it is ready to go live again.
See §3 for the preview strategy and §8 for the one-edit flip-back.

---

## 0. HANDOFF BRIEF (paste-ready — hand this to the next building agent)

> Continue **binusarcade**, the phone-first PWA frontend for a self-hosted
> RomM 5.4.1 library, in repo `cryMises/binusarcade` (`main`). v1 already
> exists and is audited in §1 below — read the code before writing any.
> Stack: static site, vanilla JS modules, hand-written CSS, no framework,
> no bundler, no build step. Design: the katchup system (cream dot paper,
> cocoa ink, six flat colors, Baloo 2 / Nunito / Permanent Marker, hard
> offset shadows, washi tape, tickets, keycap buttons; bright fills NEVER
> carry white text). Light + dark from day one; dark is night-paper, not
> a dimmed inversion.
>
> Backend (running, do not touch its data): RomM 5.4.1 + MariaDB at
> `https://crymises-music.centralindia.cloudapp.azure.com:8449`, 185 games
> across 11 platforms. API: the server's own `/openapi.json` (226
> endpoints, authoritative — never invent an API shape). Auth: OAuth2
> password grant `POST /api/token` → Bearer JWT + refresh token, tokens in
> sessionStorage only. The session-cookie route is DEAD (SameSite=Lax
> blocks it cross-origin) — do not revisit it. CORS allows the production
> origin; see §3 for preview origins.
>
> Work in the phase order of this plan (§3 → §6). Each phase ends with
> live verification on a real phone against the real server; a phase is
> done only when every acceptance box is checked live. Never store or log
> credentials, tokens, or passwords. Never modify the RomM server, its
> database, or the game files. Saves and states stay server-side in RomM
> exactly as stock RomM handles them — nothing forks.

---

## 1. AUDITED CURRENT STATE (repo read 2026-11-13)

### 1.1 What exists

| File | Size | What it is |
|---|---|---|
| `index.html` | 6.1 KB | Shell: icon sprite, theme bootstrap, boot splash, loads `js/app.js` |
| `play-frame.html` + `js/play-frame.js` | 1.1 + 7.3 KB | Emulator sandbox document (iframe isolates the emulator) |
| `js/config.js` | 5.1 KB | RomM origin, core map, platform accents/aliases, feature flags, stock-RomM URL helpers |
| `js/api.js` | 19.4 KB, 702 lines | Session + bearer + refresh, fetch wrapper, 60s cache, asset/content/firmware URL builders |
| `js/auth.js` | 2.0 KB | Login / restore / logout |
| `js/app.js` | 12.6 KB, 425 lines | Boot, nav (Hall / Library / Scores / Me), login gate |
| `js/router.js` | 3.9 KB | Hash router |
| `js/components.js` | 18.9 KB | DOM helpers, cards, tickets, toasts, modal, formats |
| `js/theme.js` | 2.0 KB | Theme persistence + `prefers-color-scheme` |
| `js/views/home.js` | 7.6 KB | Continue Playing, Systems Shelf, Recently Added |
| `js/views/library.js` | 14.4 KB | Grids, debounced search, filters, sorting, hash-persisted state |
| `js/views/detail.js` | 14.6 KB | Metadata, screenshots, saves, save states, stock-RomM links |
| `js/views/play.js` | 24.6 KB | EmulatorJS + Ruffle launch, file/disc picker, BIOS best-effort, save wiring |
| `js/views/profile.js` | 7.0 KB, 241 lines | Me / Scores / Admin stubs — player card, settings, sign-out, PWA install, links out to stock RomM |
| `css/tokens.css` + `components.css` + `views.css` | 1.8 + 15.4 + 34.7 KB | Katchup tokens (light + night-paper dark), component kit, view layouts |
| `manifest.json` + `sw.js` | 0.8 + 2.3 KB | PWA manifest + app-shell-only service worker |
| `icons/` | 4 files | SVG + 192/512 + maskable PNG icons |
| `tests/` | 4 files | `check.mjs` (node --check), `browser.mjs` (Playwright smoke: login gate, mocked Home, filters, 360px overflow), debug scripts, fixtures |
| `.github/workflows/pages.yml` | 852 B | Deploys the static file list to GitHub Pages on every push to `main` |
| `README.md` | 5.7 KB | Accurate about the code; STALE about hosting (says GitHub Pages / `crymises.github.io` — see §1.4) |
| `binusarcade-build-plan.md` | 39.6 KB | Copy of the original plan (same staleness as the local copy) |

### 1.2 Auth: the hard problem is already solved

`js/api.js` implements the prescribed OAuth2 flow: `grant_type=password` on
`POST /api/token`, `grant_type=refresh_token` rotation before expiry,
`Authorization: Bearer` on calls, tokens in sessionStorage only, password
sent once and never stored. The §5.1 auth spike from the original plan is
DONE and the session-cookie route is correctly abandoned. Do not re-open.

### 1.3 API coverage today (extracted from `js/api.js`)

Covered — 14 path roots: `/token`, `/logout`, `/users/me`,
`/permissions/me`, `/platforms`, `/roms`, `/roms/filters`, `/roms/random`,
`/play-sessions`, `/saves`, `/saves/summary`, `/states`, `/activity`,
`/stats`, `/heartbeat`. Notable: `/roms/random`, `/activity`, and `/stats`
are already wired, so "Surprise me", the activity feed, and the leaderboard
are UI-only work in their phases — no new API layer needed.

Not covered yet (each phase below adds its own): `/collections*`,
`/music*`, `/notifications*`, `/notification-channels*`, `/tasks*`,
`/search/*`, `/feeds/*`, `/export/*`, `/firmware*` (a URL helper exists;
no management calls), `/devices*`, `/sync*`, `/client-tokens*`,
`/audit-events`, `/logs`, `/config`, `/setup`, `/netplay`, `/streaming*`,
`/memory-cards*`, ROM sub-resources (`/props`, `/notes`, `/manuals`,
`/walkthroughs`, `/soundtracks`, `/patch`, `/physical`,
`/convert-to-folder`, `/delete`, `/upload`, `/easyrpg`, `/by-hash`,
`/by-metadata-provider`, `/identifiers`, `/screenshots`),
admin user/permission endpoints (`/users`, `/permissions/groups`,
`/permissions/catalog`, `/permissions/hidden`, `/permissions/users/*`),
`/auth/device/*`, `/roms/{id}/files`, `/roms/download`.

Feature flags in `js/config.js` (all `false` today): `scores`,
`personalShelf`, `adminConsole`. Flip each flag only when its phase's UI
is real — never ship a dead button.

### 1.4 Gaps and stale spots found in the audit

1. **Player-surface gap:** `config.js` marks `pico` and `rpg-maker`
   UNSUPPORTED and js-dos is not wired — but the server enables PICO-8,
   EasyRPG, and js-dos (heartbeat, §7). The frontend plays less than
   stock RomM can. Close this in Phase 1/2 as play-surface completion.
2. **Stale docs:** README + build plan say GitHub Pages and
   `crymises.github.io` for CORS. Production is Cloudflare Pages and the
   server's CORS origin is `https://binusarcade.pages.dev`. Fix in Phase 0.
3. **Two live copies:** the `pages.yml` workflow deploys the same file
   list to `crymises.github.io/binusarcade/` on every push — verified live
   2026-11-13. Its API calls are CORS-blocked today (server allows only
   the pages.dev origin). Decide its fate in Phase 0: preview environment
   or disabled workflow. Do not leave it as a silent broken copy.
4. **Live verification never happened:** the M4 phone walkthrough (login →
   browse → play GBA + NDS → save → reopen the save in stock RomM) was
   never run against the live server on a real phone. The laptop agent
   verified with mocks + Playwright. No confirmed live login through the
   frontend exists after the CORS fix. Phase 0 runs this before any new
   feature work.
5. **N64 core present, library absent:** the core map already covers N64
   (`mupen64plus_next`, `parallel_n64`) and platforms render from
   `/api/platforms`, so N64 appears the day the folder is scanned. Nothing
   to do — just don't hardcode platform lists anywhere.

---

## 2. DECISIONS LOCKED (carried forward, do not re-open)

| Decision | Choice |
|---|---|
| Plan | Full web app, phone-first PWA, one codebase — now extended to full RomM parity (this plan) |
| Hosting (production) | Cloudflare Pages, `binusarcade.pages.dev`, repo `cryMises/binusarcade`, `main` branch, auto-deploy on |
| Redirect | Temporary (302). The redirect is a deployment state, not the end of the frontend. Flip-back is one build-command edit (§8) |
| Auth | OAuth2 password/refresh grants, Bearer tokens, sessionStorage only |
| Design | Katchup design system, both modes, contrast rule (cocoa ink on bright fills) |
| Stack | Vanilla JS, no framework/bundler/build step |
| Saves/states | Server-side in RomM, shared with stock RomM and other clients |
| Big Picture shell / TV mode | Deferred; may return as a view after parity |
| Mascot "Carty" | UNDECIDED — still awaiting the user's yes/no (§7) |

---

## 3. PHASE 0 — STABILIZE + VERIFY v1 (before any new feature)

**Goal:** the existing code proven working live, docs true, and a preview
workflow in place so continued work can be tested while production stays
a redirect.

- [ ] **Docs fix (repo):** README CORS origin → `https://binusarcade.pages.dev`;
      deploy section → Cloudflare Pages (build command + output `_site`,
      production branch `main`); local-dev section notes the localhost
      CORS addition. One commit, no behavior change.
- [ ] **Decide the GitHub Pages copy** (user decision, §7): keep as the
      preview environment OR disable `pages.yml`. If kept: add its origin
      to the server CORS var (below) and label it "preview" in the README.
      If killed: disable the workflow and unpublish the Pages site so no
      broken copy lingers.
- [ ] **Preview CORS (server-side, the user runs it):** to preview from
      GitHub Pages and/or localhost, the romm container's
      `ROMM_CORS_ALLOWED_ORIGINS` becomes comma-separated. Preview option:
      `https://binusarcade.pages.dev,https://crymises.github.io` — add
      `,http://localhost:8080` while developing locally. Same proven
      pattern as the original fix: override environment block, recreate
      the container, verify in-container + preflight. Cloudflare branch
      preview deployments (`<branch>.binusarcade.pages.dev`) are NOT
      recommended as the preview route — each branch URL would need its
      own CORS entry.
- [ ] **Live verification walkthrough (real Android phone, live server):**
      login → Home rails render real data → search + filters → game
      detail → play one GBA game → play one NDS game → save in-game →
      reopen the save in stock RomM (save present) → save state round-trip
      → theme toggle + persistence → PWA install → offline shell shows the
      friendly note. Screenshot each step into the milestone note. Fix
      whatever fails before Phase 1; do not build on an unverified base.
- [ ] **Regression suite green:** `npm test` + `node tests/browser.mjs`
      pass on the audited code before changes begin (baseline).

**Exit criteria:** docs true, preview route decided and working, live
walkthrough passed and screenshotted, tests green.

---

## 4. PHASE 1 — PERSONAL + COLLECTIONS (v2)

**Goal:** everything that is "mine" — profile, personal data, collections,
saves management, activity. Flip `personalShelf` on when done.

### 4.1 Profile completion (§9A/§9H)
- Player card: username, avatar (`GET /api/users/{id}/avatar`), role,
  own playtime (`/play-sessions`, `/saves/summary` — already wired).
- Account: username/email/password change (`GET/PUT /api/users/{id}`).
- Own Client API Tokens: list/create/regenerate/delete
  (`/api/client-tokens*`) — show a new token ONCE, never again, never log.
- Notifications inbox (`/api/notifications*`, mark-read, dismiss-all) +
  own notification channels (`/api/notification-channels*`, email
  confirm-code flow).
- Password reset request UI (`POST /api/forgot-password`,
  `POST /api/reset-password`) — email delivery is server-side; UI only.

### 4.2 Personal data on games (§9C)
- Rating / status / props (`PUT /api/roms/{id}/props`) on the detail page.
- Notes CRUD (`/api/roms/{id}/notes*`) with the spec's visibility rules.
- Who's playing on the game page (`GET /api/activity/rom/{rom_id}`).

### 4.3 Collections (§9F)
- Manual collections CRUD + add-ROMs (atomic add) + share/unshare
  (`PUT /{id}/visibility`).
- Smart collections + a rule editor UI (rule-based, auto-updating).
- Virtual collections (read-only groupings — confirm what generates them
  in the spec at build time).
- Favorites (collection-adjacent; confirm the API shape in the spec —
  favorites exist for music; game favorites ride collections/props).

### 4.4 Saves, states & gallery (§9E)
- Saves/states management: visibility, favorite, labels, rename
  (`PUT /api/saves/{id}/*`, same under `/api/states/*`) — owner-only.
- User gallery screenshots (`POST /api/screenshots`, visibility) —
  distinct from ROM-folder screenshots; keep the two stores separate in
  the UI, as stock RomM does.

### 4.5 Play-surface completion + discovery
- "Surprise me" random game (`/roms/random` — already wired; UI only).
  Mystery-cabinet treatment if the whimsy fits.
- Activity feed (`/api/activity` — already wired; UI only).
- Close the §1.4 player gap: wire js-dos, PICO-8, and EasyRPG players
  (server enables all three; EasyRPG via
  `GET /api/roms/{id}/easyrpg/{path}`). Inherit stock RomM's per-platform
  behavior; never a Play button for a platform stock RomM can't play.
- DS touch honesty carried forward: touch-heavy DS titles keep the
  "needs mouse/stylus" note. Do not re-litigate; do surface it.

**Exit criteria:** every item above verified live on the phone against
the real server; `personalShelf` flag on; no dead buttons.

---

## 5. PHASE 2 — LEADERBOARD / STATS / RECOMMENDATIONS + LIBRARY DEPTH (v3)

**Goal:** the social/competitive layer and the library-management depth
that editors use. Flip `scores` on when done.

### 5.1 Leaderboard, stats, recommendations (§9B/§9C/§9H)
- Playtime leaderboard across accounts (`/api/stats`,
  `/api/play-sessions`) — arcade high-score table styling was proposed;
  ask the user (§7) before building it that way. Shared logins (one
  combined clock) must be explained in the UI, not hidden.
- Similar games (`GET /api/roms/{id}/similar`) on detail pages.
- Recommendations (`GET /api/recommendations`) as a Home rail.
- Profile stats views.

### 5.2 Library depth (§9B)
- Bulk download as zip (`GET /api/roms/download`) for selected ROMs.
- Chunked ROM upload (`POST /api/roms/upload/start`, chunk PUT,
  complete/cancel) with progress UI; a scan picks the file up after.
- Physical games (`POST /api/roms/physical`) — manual entry, auto-linked
  metadata, single quick scan.
- Edit ROM metadata (`PUT /api/roms/{id}`, incl. `raw_manual_metadata` +
  `alternative_names` — hand-set alt titles REPLACE provider titles).
- Fix match (`GET /api/search/roms`) + cover search
  (`GET /api/search/cover`) — the editor flows for metadata misses.
- Convert single-file ROM to folder (`POST /api/roms/{id}/convert-to-folder`).
- Delete ROMs (`POST /api/roms/delete`) — library-only vs filesystem
  toggle; filesystem delete gets a TYPED confirmation. ROM file listing
  + per-file delete (`/api/roms/{id}/files*`) for multi-file ROMs.

### 5.3 Detail depth (§9C/§9G)
- Manuals viewer + management (`/api/roms/{id}/manuals*`, redownload,
  upload is editor+). Document viewer; redownload re-fetches server-side.
- Walkthroughs viewer + GameFAQs fetch
  (`/api/roms/{id}/walkthroughs/*`) — server reduces the page to text.
- Soundtracks metadata per ROM + the Jukebox (§9G): track browser,
  facets (artists/albums/genres/years/game-genres/platforms/games),
  stats, favorites, playlists with reorder. NOTE: no soundtrack files
  exist in the library today — the jukebox ships empty until soundtracks
  are added. Build the UI, never fake tracks.
- Exports + feeds surfaced (§9B): gamelist-xml / Pegasus export triggers
  (admin) and the feed URL list (webrcade/tinfoil/pkgi/fpkgi/kekatsu/
  pkgj) with copy buttons. Do not reimplement the feeds.

### 5.4 Register view (decision §7, risk 10 from the original plan)
- Invite links point at stock RomM's `/register`. Decide: binusarcade
  hosts its own register view (`POST /api/users/register`, link built as
  `/register?token=<jwt>` — the API's `url` is null without
  ROMM_BASE_URL) or deep-links to stock. Either way the invite flow must
  land in the branded app. Build the chosen option in this phase.

**Exit criteria:** leaderboard/stats/recommendations live; editor flows
verified with an editor account AND verified blocked for a plain user;
jukebox UI present and honestly empty; register decision implemented.

---

## 6. PHASE 3 — ADMIN CONSOLE (M5)

**Goal:** the full back-office in the katchup design language. Flip
`adminConsole` on when done. Role-gating uses `GET /api/permissions/me`
(UX only — the server enforces). Design treatment: back-office
scrapbook — ledger tables, rubber stamps, keycap actions, a red-taped
danger zone, jewel-LED scan status, sticky-note toasts. Destructive
actions get a confirm dialog; filesystem deletes get a typed
confirmation. NEVER display a secret: provider keys are env-only — show
status, never values. Full endpoint map: §9J of the original plan.

Build in nav order:

1. **Overview** — `GET /api/stats`, `GET /api/tasks/status`,
   `GET /api/heartbeat`, recent `GET /api/audit-events`. Quick actions:
   scan, invite, upload.
2. **Users & access** — users CRUD + roles; invite links
   (`POST /api/users/invite-link`, role + expiration, QR + copy — reuse
   the proven invite flow); permission groups
   (`/api/permissions/groups*`) + matrix vocabulary
   (`GET /api/permissions/catalog`); per-user overrides
   (`/api/permissions/users/{user_id}`); hidden entities
   (`POST /api/permissions/hidden`, exactly one of user/group). The
   deny-by-default group for new users + promotion flow is the
   approval-queue substitute — the UI must make it obvious.
3. **Scans & tasks** — `GET /api/tasks`, `POST /api/tasks/run/{task_name}`,
   `POST /api/tasks/scan`, `GET /api/tasks/status`,
   `GET /api/tasks/{task_id}`. Scan modes Quick/Complete/Unidentified per
   platform. GUARD (non-negotiable): never queue multiple Complete scans
   — Hasheous rate-limits with 429. The UI enforces one at a time with a
   cooldown note.
4. **Metadata** — provider status (`GET /api/heartbeat/metadata/{source}`,
   10+ providers, server-configured); fix match; cover search; manual
   metadata edit; metadata update + artwork tasks.
5. **Platforms** — CRUD + bindings (`/api/config/system/platforms*`),
   versions, exclusions (`/api/config/exclude*`), scan settings
   (`PUT /api/config/scan`), converto settings
   (`PUT /api/config/converto_settings`), unimported folders
   (`GET /api/platforms/filesystem`), supported list
   (`GET /api/platforms/supported`).
6. **Firmware** — upload/list/status (`/api/firmware*`). BIOS presence
   gates PS1 play — surface status per platform (scph1001.bin placement
   on the server is still unconfirmed; the UI shows what the API says).
7. **Settings (runtime-editable only)** — `GET /api/config` (read); the
   scan + converto PUTs. Everything else is env vars / `config.yml` =
   server-only: display read-only where the API returns it, never
   pretend to edit server files.
8. **Observability** — `GET /api/logs` (admin-only backfill),
   `GET /api/stats`, `GET /api/audit-events`, `GET /api/heartbeat`.
9. **Exports & feeds** — export triggers + feed URL list (from §5.3,
   admin surface).
10. **Streaming admin** — ONLY if streaming is enabled on the server
    (verify `GET /api/streaming/config` with auth first; see §7).
11. **Devices admin** — `GET /api/client-tokens/all`, admin token delete,
    pairing approvals (§9I).
12. **Setup wizard** — NOT APPLICABLE. The server is already set up.
    Noted only so nobody builds it by mistake.

**Exit criteria:** every view verified with the admin account; verified
with a NON-admin account that the admin UI is unreachable; invite →
register round-trip verified end to end; the Complete-scan guard
demonstrated.

---

## 7. PHASE 4 — PARITY BACKLOG (gated — verify before building)

Each item ships only when its server-side gate is verified live with an
authenticated check. No UI for a disabled backend. Gates re-checked via
`/api/heartbeat` 2026-11-13 (unauthenticated) — re-verify at build time.

| Feature | Server gate | Status 2026-11-13 | Notes |
|---|---|---|---|
| OIDC login button | `OIDC.ENABLED` in heartbeat | OFF | Render only if enabled; no IdP configured |
| Converto (ROM conversion) | `CONVERTO.ENABLED` | OFF | Settings UI exists in §6.5; conversion UI gated |
| Scheduled tasks UI | `TASKS.ENABLE_*` | All OFF | Show status; enabling is a server config choice |
| Emulator streaming + memory cards | `GET /api/streaming/config` (authed) | UNVERIFIED | 16 `/api/streaming/*` + `/api/memory-cards/*` paths exist in the spec; the 1 GB VM likely runs no broker — verify before ANY UI work |
| Netplay rooms | `/api/netplay/list` + socket.io | Endpoint exists | Join flow via EJS netplay — confirm against docs/WebSockets page |
| WebSocket live updates | socket.io docs page | Unverified | Scan progress, activity updates; REST is the fallback — no polling loops |
| RetroAchievements UI | `RA_API_ENABLED` | OFF | Link + refresh endpoints exist; UI only if RA is ever enabled |
| Device pairing + sync UI | `/api/auth/device/*`, `/api/sync/*`, `/api/devices*` | Endpoints exist | Pairing approval is the user-facing half; init/polling are device-side |
| Reading progress (documents) | `/api/roms/{id}/files/{file_id}/progress` | Unverified | Confirm semantics in the spec |
| ROM binary identity | `PUT /api/roms/{id}/identity` | Unverified | Client-extracted identity for unidentifiable ROMs |
| ROM patcher | `POST /api/roms/{id}/patch` | Endpoint exists | Apply hacks/translations from the game page — verify behavior in the spec (on-the-fly vs stored) |
| ROM by metadata provider / by hash | `/api/roms/by-metadata-provider`, `/by-hash` | Endpoints exist | Deep links + scanner tooling |

**Open decisions for the user (ask, don't assume):**

1. GitHub Pages copy: preview environment or disabled? (§3)
2. Register view in-app or deep-link to stock RomM? (§5.4)
3. Carty the cartridge mascot: yes or no? (empty states + cover-fallback tiles)
4. Leaderboard styling: arcade high-score table, or ledger rows?
5. Big Picture / TV mode: still deferred, or part of Phase 2?
6. Jukebox: build the UI now (ships empty) or wait for soundtrack files?
7. Streaming: check `/api/streaming/config` — worth even probing on this VM?

---

## 8. DEPLOYMENT: PREVIEW NOW, FLIP BACK LATER

**While production stays a redirect:** the Cloudflare Pages build command
is the redirect-only one. Continued frontend work is previewed via the
Phase 0 route (GitHub Pages copy and/or localhost) — never by flipping
production mid-build.

**Flip-back (when the frontend is ready to go live again):** in the
Cloudflare dashboard → binusarcade → Settings → Build configuration,
replace the build command with the original full-copy command, save, then
Retry deployment. The `_redirects` file stays in the repo — harmless once
the build command no longer copies it (or delete it in the same push;
either works since the cp list is explicit).

Restore-full-deploy build command:

```
mkdir -p _site && cp -R index.html play-frame.html manifest.json sw.js css js icons _site/
```

Redirect-only build command (current):

```
mkdir -p _site && cp _redirects _site/
```

**Never lose the redirect:** the 302 is deliberate (temporary, not
browser-cached), so flipping back and forth during development is safe.
If the frontend ever regresses live, the redirect is one build-command
edit away.

---

## 9. WORKING RULES (unchanged from the original plan)

1. Never invent API shapes — verify each endpoint against the live
   `/openapi.json` before coding it. The spec is authoritative; §9 of the
   original plan is the map.
2. Never store or log credentials, tokens, or passwords. Never display a
   secret anywhere in the UI (provider keys: status only, never values).
3. Never modify the RomM server, its database, or the game files.
4. Never claim a feature works without running it against the live server
   in a real phone-sized browser. Mock/Playwright passes are not live
   verification.
5. Never hardcode platform lists — render from `GET /api/platforms`.
6. 1 GB server discipline: paginate, cache briefly, no polling, no
   parallel fan-outs, sequential where the server is happier.
7. One Complete scan at a time, with a cooldown note (Hasheous 429).
8. DS touch honesty: surface the limitation, never pretend it works.
9. Milestones are the fence: a phase ships only when every acceptance box
   is checked live. Do not let later-phase work leak into earlier ones.
10. Nothing in §9 of the original plan may be silently dropped — if a
    feature can't be built, record why in the milestone note.

---

## 10. WHAT "DONE" LOOKS LIKE

When Phases 0–3 are complete and Phase 4's gates are all resolved one way
or the other, binusarcade is a complete replacement for the RomM web UI:
every stock feature reachable in the katchup design language, on a phone,
with the same accounts, saves, and library — and stock RomM still
running underneath as the server that enforces everything. The redirect
can then be retired permanently, and `binusarcade.pages.dev` becomes the
front door for good.
