# Binus Arcade

A phone-first, static, view-only front end for a self-hosted [RomM](https://romm.app/)
library — plain ES modules and hand-written CSS matching stock RomM's Material theme
without a framework or bundler.

- Sign in with your RomM account (OAuth2 bearer token in `sessionStorage`, never cookies)
- Invite-only registration (`#/register`, `?token=...` auto-filled)
- Home: stats-only overview from `/api/stats`, `/api/platforms`, `/api/saves`, `/api/activity`, and recently added detail links (never launches games)
- Library: dynamic game showcase (fits natural cover art aspect, max 3 per row or 2 per row for wide art), debounced search, platform/genre/players/status filters, sort, hash-persisted state
- Detail: metadata, screenshots, saves/save-states lists, and `Open in stock RomM` links
- Account (`#/me`): dark/light theme switcher (follows OS by default), PWA install, RomM account links, and an **admin-only Signup QR switch** (off by default) that mints single-use `role=user` invite links (`?token=...#/register`) and auto-refreshes when a friend signs up or after 60 minutes
- PWA: installable manifest and app-shell-only service worker

## Current deployment state

- **Production URL:** <https://binusarcade.pages.dev/> currently returns a temporary `302`
  redirect to stock RomM via `_redirects`.
- **Preview:** <https://crymises.github.io/binusarcade/> deploys from `main` via
  `.github/workflows/pages.yml` and serves the live frontend.

## Run locally

```sh
python -m http.server 8080
# or
npx serve -l 8080
```

Open <http://localhost:8080/>. The app talks to the RomM origin configured in `js/config.js`.

## RomM server requirements

### 1. Allow these origins (required)

On the RomM server, set:

```env
ROMM_CORS_ALLOWED_ORIGINS=https://binusarcade.pages.dev,https://crymises.github.io
```

Add `http://localhost:8080` (comma-separated) when developing locally, then recreate the
RomM container.

### 2. Auth note: OAuth2 token instead of the session cookie

RomM sets its browser session cookie with `SameSite=Lax`, so a cross-origin static site
cannot send or read it. Binus Arcade uses RomM's OAuth2 password/refresh grant
(`POST /api/token`) with `Authorization: Bearer <access_token>` stored in
`sessionStorage` only.

- Standard login requests `me.read`, `roms.read`, `platforms.read`, `assets.read`,
  `devices.read`, `roms.user.read`, `roms.user.write`, `assets.write`, `devices.write`,
  plus `users.read` and `users.write` (used only by the admin-only Signup QR panel).
- Non-admin accounts automatically fall back to standard user scopes or read-only scopes
  if `users.*` or write scopes are rejected.

### 3. Invite-only signup QR panel (admin-only)

- Visible in Account (`#/me`) and at `#/signup` **only** when `/api/users/me` returns
  `role === "admin"`. Defaults to **OFF**.
- Calls `POST /api/users/invite-link?role=user&expiration=3600` (single-use player invite)
  and polls `GET /api/users` every 10 seconds while open to rotate the QR automatically
  after someone registers or when the 60:00 timer expires.
- Generates QR codes offline using the vendored MIT library in `js/vendor/qrcode.js`.
- Invite URL base comes from `APP_PUBLIC_URL` in `js/config.js`.

## Verify

- Static checks: `npm test` (parses all JS modules + `sw.js` and runs unit checks).
- Browser smoke: `npm run test:browser` (Playwright suite covering Home stats, dynamic showcase aspect/columns, filters, Detail, Login, Register, Admin Signup QR polling/expiry/cleanup, 360px/1280px layouts, and zero console/page errors).

## Files

```
index.html            shell, MDI icon sprite, theme bootstrap
manifest.json         PWA manifest
sw.js                 app-shell-only service worker cache
_redirects            Cloudflare production redirect to stock RomM
css/tokens.css        stock RomM light + dark theme tokens
css/components.css    Material buttons, chips, inputs, cards, modals
css/views.css         topbar, bottom nav, home stats, showcase grid, detail, profile, login/register, signup QR
js/config.js          RomM origin, API base, public invite URL base, platform helpers
js/api.js             bearer session, token scope fallback, refresh, fetch wrapper, endpoints
js/auth.js            login / restore / logout
js/theme.js           theme persistence + prefers-color-scheme
js/router.js          hash router
js/components.js      DOM helpers, dynamic cards, toasts, modal, formats
js/vendor/qrcode.js   vendored MIT QR generator (qrcode-generator)
js/views/*.js         Home, Library, Detail, Register, Signup QR, Me/Scores/Admin
icons/                SVG + PNG + maskable app icons
```
