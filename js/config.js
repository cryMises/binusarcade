/* Binus Arcade configuration.
 * Everything the app needs to talk to the self-hosted RomM instance.
 * No secrets here: the user signs in and the token lives in sessionStorage.
 */

export const ROMM_ORIGIN = "https://crymises-music.centralindia.cloudapp.azure.com:8449";
export const API_BASE = `${ROMM_ORIGIN}/api`;
export const APP_PUBLIC_URL = "https://crymises.github.io/binusarcade";
/* Set to your deployed Cloudflare Worker URL (e.g. "https://binusarcade-signup-relay.<user>.workers.dev")
 * to share the Signup QR toggle across devices and auto-rotate scanned QRs on Create account. */
export const SIGNUP_RELAY_URL = "https://binusarcade-signup-relay.samuel314285.workers.dev";

export function signupInviteUrl(token, baseUrl = APP_PUBLIC_URL) {
  const cleanBase = String(baseUrl || APP_PUBLIC_URL).replace(/\/+$/, "");
  return `${cleanBase}/?token=${encodeURIComponent(token)}#/register`;
}

export function signupClaimUrl(claimId, baseUrl = APP_PUBLIC_URL) {
  const cleanBase = String(baseUrl || APP_PUBLIC_URL).replace(/\/+$/, "");
  return `${cleanBase}/?claim=${encodeURIComponent(claimId)}#/register`;
}

export const APP_NAME = "Binus Arcade";
export const APP_VERSION = "1.0.0";

export const EJS_VERSION = "4.2.3";
export const EJS_CDN = `https://cdn.emulatorjs.org/${EJS_VERSION}/data`;
export const EJS_LOADER = `${EJS_CDN}/loader.js`;
export const RUFFLE_CDN = "https://unpkg.com/@ruffle-rs/ruffle";

export const PAGE_SIZE = 48;
export const RAIL_SIZE = 12;
export const CACHE_TTL = 60_000;
export const REQUEST_TIMEOUT = 30_000;

export const STORAGE = {
  session: "binusarcade.session",
  sessionPersist: "binusarcade.remember",
  theme: "binusarcade.theme",
  device: "binusarcade.device",
  lang: "binusarcade.lang",
};

export const FEATURES = {
  scores: false,
  personalShelf: false,
  adminConsole: false,
};

/* Core list mirrors the stock RomM 5.4.1 mapping. First core is the default. */
export const PLATFORM_CORES = {
  atari2600: ["stella2014"],
  atari5200: ["a5200"],
  atari7800: ["prosystem"],
  nes: ["fceumm", "nestopia"],
  famicom: ["fceumm", "nestopia"],
  fds: ["fceumm", "nestopia"],
  n64: ["mupen64plus_next", "parallel_n64"],
  nds: ["melonds", "desmume", "desmume2015"],
  gb: ["gambatte", "mgba"],
  gbc: ["gambatte", "mgba"],
  gba: ["mgba"],
  psx: ["pcsx_rearmed", "mednafen_psx_hw"],
  psp: ["ppsspp"],
  genesis: ["genesis_plus_gx"],
  megadrive: ["genesis_plus_gx"],
  segaMD: ["genesis_plus_gx"],
  snes: ["snes9x"],
  sfam: ["snes9x"],
  "super-famicom": ["snes9x"],
  "3ds": ["azahar"],
};

export const RUFFLE_PLATFORMS = new Set(["browser", "flash"]);
export const UNSUPPORTED_PLATFORMS = new Set(["win3x", "win9x", "pico", "rpg-maker"]);

const ALIASES = {
  ps: "psx",
  playstation: "psx",
  "playstation-1": "psx",
  "sony-playstation": "psx",
  "sony-playstation-ps1": "psx",
  megadrive: "genesis",
  "sega-genesis": "genesis",
  "sega-mega-drive": "genesis",
  famicom: "nes",
  "nintendo-entertainment-system": "nes",
  "nintendo-ds": "nds",
  "game-boy": "gb",
  "game-boy-color": "gbc",
  "game-boy-advance": "gba",
  "super-nintendo": "snes",
  "super-nintendo-entertainment-system": "snes",
  "super-famicom": "snes",
};

export const PLATFORM_ACCENTS = {
  atari2600: "#FF8A3D",
  browser: "#FF7BB8",
  flash: "#FF7BB8",
  gb: "#FFCE00",
  gba: "#5B8CFF",
  gbc: "#2FE0A8",
  genesis: "#FF4949",
  megadrive: "#FF4949",
  nds: "#FF7BB8",
  nes: "#FF8A3D",
  ps: "#5B8CFF",
  psx: "#5B8CFF",
  psp: "#2FE0A8",
  snes: "#FFCE00",
};

const ACCENT_FALLBACK = ["#FF8A3D", "#5B8CFF", "#2FE0A8", "#FF7BB8", "#FFCE00", "#FF4949"];

export function normalizePlatform(value) {
  const raw = String(value || "").toLowerCase();
  return ALIASES[raw] || raw;
}

export function colorForPlatform(...values) {
  for (const value of values) {
    const slug = normalizePlatform(value);
    if (PLATFORM_ACCENTS[slug]) return PLATFORM_ACCENTS[slug];
  }
  const key = String(values.find(Boolean) || "x");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENT_FALLBACK[hash % ACCENT_FALLBACK.length];
}

export function coresForPlatform(...values) {
  for (const value of values) {
    const slug = normalizePlatform(value);
    if (PLATFORM_CORES[slug]) return PLATFORM_CORES[slug];
  }
  return [];
}

/* Touch-first phones get desmume for NDS; melonds stays the desktop default. */
export function isPhoneDevice() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

export function defaultCoreFor(...values) {
  const cores = coresForPlatform(...values);
  if (cores === PLATFORM_CORES.nds && isPhoneDevice()) return "desmume";
  return cores[0] || null;
}

export function isRufflePlatform(...values) {
  return values.some((value) => RUFFLE_PLATFORMS.has(normalizePlatform(value)));
}

export function isSupportedPlatform(...values) {
  return coresForPlatform(...values).length > 0 || isRufflePlatform(...values);
}

export function platformSlugOf(rom) {
  return normalizePlatform(
    rom?.platform_fs_slug || rom?.platform_slug || rom?.platform_display_name || "",
  );
}

export function platformLabelOf(rom) {
  return (
    rom?.platform_display_name ||
    rom?.platform_custom_name ||
    rom?.platform_slug ||
    rom?.platform_fs_slug ||
    "Unknown system"
  );
}

export function shortPlatformLabel(rom) {
  const slug = platformSlugOf(rom);
  const labels = {
    atari2600: "Atari 2600",
    browser: "Browser",
    flash: "Flash",
    gb: "GB",
    gba: "GBA",
    gbc: "GBC",
    genesis: "Genesis",
    nds: "NDS",
    nes: "NES",
    ps: "PS1",
    psx: "PS1",
    psp: "PSP",
    snes: "SNES",
  };
  return labels[slug] || platformLabelOf(rom);
}

export function deviceId() {
  try {
    let id = localStorage.getItem(STORAGE.device);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `binus-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(STORAGE.device, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function stockRomUrl(id) {
  return `${ROMM_ORIGIN}/rom/${encodeURIComponent(id)}`;
}

export function stockAdminUrl() {
  return `${ROMM_ORIGIN}/administration`;
}

export function stockAccountUrl() {
  return `${ROMM_ORIGIN}/account`;
}
