# Binus Arcade

A phone-first, static front end for a self-hosted [RomM](https://romm.app/) library.
Paper, washi tape, cartridge cards, and actual playable games — no framework, no build
step, no bundler.

The v1 target is M0–M4 of `binusarcade-build-plan.md`; the parity phases that
follow are tracked in `binusarcade-continuation-plan.md`.

- sign in with the same RomM account;
- Home: Continue Playing, Systems Shelf, Recently Added;
- Library: full grids, debounced search, platform/genre/players/status filters, sorting,
  hash-persisted filter state;
- Game detail: metadata, screenshots, saves, save states, stock-RomM links;
- Play: EmulatorJS for the mapped systems, Ruffle for Flash/browser files;
- PWA: installable manifest, offline app shell, graceful API failures;
- light and dark paper themes.

## Current deployment state (2026-11-13)

- **Production URL:** <https://binusarcade.pages.dev/> is currently a temporary
  `302` redirect to stock RomM. The repo's `_redirects` file holds that redirect
  while frontend parity work continues.
- **Preview:** <https://crymises.github.io/binusarcade/> runs the frontend from
  `main` and is the live test surface. It is a preview, not the production front
  door.
- **Source of truth:** this repo. The Cloudflare build command is flipped back to
  the full static deploy when the frontend is ready to go live again
  (`binusarcade-continuation-plan.md` §8).

## Run locally

Any static file server works. From this directory:

```sh
python -m http.server 8080
# or
npx serve -l 8080
```

Open <http://localhost:8080/>. The app talks to the RomM origin in
`js/config.js`; the browser enforces CORS even on localhost.

## RomM server requirements

### 1. Allow these origins (required)

RomM's API is cross-origin from every static host. On the RomM server, set:

```env
ROMM_CORS_ALLOWED_ORIGINS=https://binusarcade.pages.dev,https://crymises.github.io
```

`https://binusarcade.pages.dev` is the production origin once the frontend is live;
`https://crymises.github.io` is the current preview origin. For local development,
add the local origin too (comma-separated), e.g.:

```env
ROMM_CORS_ALLOWED_ORIGINS=https://binusarcade.pages.dev,https://crymises.github.io,http://localhost:8080
```

Recreate the RomM container after changing the environment. Without this, the browser
preflight fails and the login screen reports that it cannot reach the server.

### 2. Auth note: OAuth2 token instead of the session cookie

The short version: **the stock RomM browser session cookie cannot be used from a
static frontend on another origin**. RomM sets its session cookie with `SameSite=Lax`,
so a cross-site request from `crymises.github.io` or `binusarcade.pages.dev` to the RomM
origin neither sends nor stores it. This is a browser rule, not a bug in the app.

Binus Arcade therefore uses RomM's documented OAuth2 password/refresh grant:

- `POST /api/token` with `grant_type=password`, username and password;
- `Authorization: Bearer <access_token>` on API requests;
- refresh-token rotation before expiry;
- tokens live in **sessionStorage only** (cleared when the tab closes);
- the password is sent once to RomM and is never stored or logged.

Same RomM account. No new accounts, no server changes beyond CORS. The server must be
reachable over HTTPS; the configured origin is already HTTPS.

### 3. Images and content

Covers, screenshots and manuals are read from RomM's own metadata paths. External art
URLs are not hot-linked. Game content is fetched with the bearer token into a blob URL
for the emulator, so no token ever appears in a URL.

## Deploy

### GitHub Pages (preview)

Push to `main`. `.github/workflows/pages.yml` copies the static site into `_site` and
deploys it to GitHub Pages:

<https://crymises.github.io/binusarcade/>

This copy is the preview environment while Cloudflare production stays a redirect. Its
origin must be present in `ROMM_CORS_ALLOWED_ORIGINS` (above).

### Cloudflare Pages (production)

The Cloudflare project builds from this repo on `main`. Its current build command is
redirect-only:

```
mkdir -p _site && cp _redirects _site/
```

`_redirects` sends every request to stock RomM with a `302`. To restore the full
frontend, change the build command in Cloudflare → binusarcade → Settings → Build
configuration to:

```
mkdir -p _site && cp -R index.html play-frame.html manifest.json sw.js css js icons _site/
```

then retry the deployment. The redirect is temporary on purpose, so flipping back and
forth is safe. The frontend does not need its own origin configured; only RomM's CORS
value depends on the deployed origin.

## Emulator notes

- Core map mirrors stock RomM 5.4.1 (`js/config.js`): NES `fceumm`, SNES `snes9x`,
  Genesis `genesis_plus_gx`, GB/GBC `gambatte`, GBA `mgba`, NDS `melonds`, PS1
  `pcsx_rearmed`, PSP `ppsspp`, Atari 2600 `stella2014`.
- EmulatorJS 4.2.3 is loaded from its CDN inside `play-frame.html`. The iframe isolates
  the emulator so leaving Play really stops it.
- Flash/browser files use Ruffle from the CDN. Ruffle support depends on the file.
- **Nintendo DS touch screen:** phone touch does not reach the emulated DS touch screen.
  Touch-heavy DS games need a mouse or stylus on a computer. The play view says this.
- PS1 BIOS is best-effort: if RomM has a firmware file for the platform, it is downloaded
  with auth and passed to the core; if not, the game still attempts to boot and reports
  the failure.
- Multi-file games show a file/disc picker. Saves and save states upload and download
  through RomM's `/api/saves` and `/api/states` endpoints.

## What is intentionally not in v1

- Phase 1: personal shelves, collections, profile editing, client tokens,
  notifications, saves/states management, js-dos/PICO-8/EasyRPG players.
- Phase 2: leaderboards, stats, recommendations, library editing, manuals,
  walkthroughs, jukebox, feeds.
- Phase 3: the admin console.
- Phase 4: server-gated features (netplay, streaming, RetroAchievements, OIDC,
  device pairing) until each backend gate is verified live.

Those slots are kept behind the API layer and the "soon" views. Nothing from the stock
feature inventory is silently removed; v1 simply doesn't build their UI yet. The phase
checklist is in `binusarcade-continuation-plan.md`.

## Verify

- Static syntax: `npm test` (runs `node --check` on the app modules).
- Browser smoke: `npm run test:browser` (Playwright, if installed) checks the login
  gate, a mocked signed-in Home, library filters, play surfaces, 360/1280 overflow,
  token scopes, and that the password is never stored.
- Manual: on the preview URL, sign in on a phone, browse, search, play one GBA and one
  NDS game, save, reopen the save in stock RomM.

## Files

```
index.html            shell + icon sprite + theme bootstrap
play-frame.html       emulator sandbox document
manifest.json         PWA manifest
sw.js                 app-shell cache only
_redirects            Cloudflare production redirect to stock RomM
css/tokens.css        katchup design tokens, light + night-paper dark
css/components.css    marker, tape, ticket, cart, ledger, keycap, chips
css/views.css         layout, home, library, detail, play, login, states
js/config.js          RomM origin, API base, core map, storage keys
js/api.js             bearer session, refresh, fetch wrapper, endpoints
js/auth.js            login / restore / logout
js/theme.js           theme persistence + prefers-color-scheme
js/router.js          small hash router
js/components.js      DOM helpers, cards, tickets, toasts, modal, formats
js/views/*.js         Home, Library, Detail, Play, Me/Scores/Admin
icons/                SVG + PNG + maskable app icons
binusarcade-continuation-plan.md  parity phases, decisions, deployment state
```
