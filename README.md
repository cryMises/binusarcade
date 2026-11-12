# Binus Arcade

A phone-first, static front end for a self-hosted [RomM](https://romm.app/) library.
Paper, washi tape, cartridge cards, and actual playable games — no framework, no build
step, no bundler.

The v1 target is M0–M4 of `binusarcade-build-plan.md`:

- sign in with the same RomM account;
- Home: Continue Playing, Systems Shelf, Recently Added;
- Library: full grids, debounced search, platform/genre/players/status filters, sorting,
  hash-persisted filter state;
- Game detail: metadata, screenshots, saves, save states, stock-RomM links;
- Play: EmulatorJS for the mapped systems, Ruffle for Flash/browser files;
- PWA: installable manifest, offline app shell, graceful API failures;
- light and dark paper themes.

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

### 1. Allow this origin (required)

RomM's API is cross-origin from GitHub Pages. On the RomM server, set:

```env
ROMM_CORS_ALLOWED_ORIGINS=https://crymises.github.io
```

For local development, add the local origin too (comma-separated), e.g.:

```env
ROMM_CORS_ALLOWED_ORIGINS=https://crymises.github.io,http://localhost:8080
```

Recreate the RomM container after changing the environment. Without this, the browser
preflight fails and the login screen reports that it cannot reach the server.

### 2. Auth note: OAuth2 token instead of the session cookie

The short version: **the stock RomM browser session cookie cannot be used from GitHub
Pages**. RomM sets its session cookie with `SameSite=Lax`, so a cross-site request from
`crymises.github.io` to the RomM origin neither sends nor stores it. This is a browser
rule, not a bug in the app.

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

Push to `main`. `.github/workflows/pages.yml` copies the static site into `_site` and
deploys it to GitHub Pages. The expected URL is:

<https://crymises.github.io/binusarcade/>

If the repository or Pages URL differs, update `js/config.js`? No — the app does not
need its own origin configured. Only the RomM CORS value depends on the deployed Pages
origin.

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

- M5 admin console (server-enforced in stock RomM; the app links out).
- v2 personal shelves, favorites, collections, random pick.
- v3 leaderboards, stats, recommendations, jukebox.
- Netplay, cheats UI, RetroAchievements UI, client API tokens.

Those slots are kept behind the API layer and the "soon" views. Nothing from the stock
feature inventory is silently removed; v1 simply doesn't build their UI yet.

## Verify

- Static syntax: `npm test` (runs `node --check` on the app modules).
- Browser smoke: `node tests/browser.mjs` (Playwright, if installed) checks the login
  gate, a mocked signed-in Home, library filters, and a 360px overflow check.
- Manual: sign in on a phone, browse, search, play one GBA and one NDS game, save, reopen
  the save in stock RomM.

## Files

```
index.html            shell + icon sprite + theme bootstrap
play-frame.html       emulator sandbox document
manifest.json         PWA manifest
sw.js                 app-shell cache only
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
```
