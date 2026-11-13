import { coverUrl, isAbortError, screenshotUrl } from "./api.js";
import {
  colorForPlatform,
  platformLabelOf,
  platformSlugOf,
  shortPlatformLabel,
  stockAdminUrl,
  ROMM_ORIGIN,
} from "./config.js";

const DEVICE_IMAGES = {
  atari2600: "./icons/devices/atari2600.svg",
  browser: "./icons/devices/browser.svg",
  flash: "./icons/devices/flash.svg",
  gb: "./icons/devices/gb.svg",
  gba: "./icons/devices/gba.svg",
  gbc: "./icons/devices/gbc.svg",
  genesis: "./icons/devices/genesis.svg",
  megadrive: "./icons/devices/genesis.svg",
  nds: "./icons/devices/nds.svg",
  nes: "./icons/devices/nes.svg",
  ps: "./icons/devices/psx.svg",
  psx: "./icons/devices/psx.svg",
  psp: "./icons/devices/psp.svg",
  snes: "./icons/devices/snes.svg",
};
import { isAdmin } from "./api.js";
import { LOCALES, formatNumber, intlLocale, locale, t } from "./i18n.js";

/* ------------------------------------------------------------------ */
/* Tiny DOM toolkit                                                    */
/* ------------------------------------------------------------------ */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset" && value && typeof value === "object") {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        if (dataKey.includes("-")) node.setAttribute(`data-${dataKey}`, String(dataValue));
        else node.dataset[dataKey] = String(dataValue);
      }
    }
    else if (key === "style" && typeof value === "object") {
      for (const [prop, val] of Object.entries(value)) node.style.setProperty(prop, val);
    } else if (key === "on" && typeof value === "object") {
      for (const [event, handler] of Object.entries(value)) {
        node.addEventListener(event, handler);
      }
    } else if (key === "props" && typeof value === "object") {
      Object.assign(node, value);
    } else if (key === "html") {
      node.innerHTML = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }

  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function maybe(value, render) {
  return value ? render(value) : null;
}

export function icon(name, size = 22, label) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

export function link(href, attrs = {}, ...children) {
  const isExternal = /^https?:/i.test(href);
  return el(
    "a",
    {
      href,
      ...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {}),
      ...attrs,
    },
    ...children,
  );
}

const ICONS = [];

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatPlaytime(ms) {
  const value = Number(ms) || 0;
  if (value <= 0) return t("0 min");
  const minutes = Math.round(value / 60_000);
  if (minutes < 1) return t("< 1 min");
  if (minutes < 60) return t("{n} min", { n: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t("{n}h {m}m", { n: hours, m: rest }) : t("{n}h", { n: hours });
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / 1024 ** index;
  const digits = amount >= 10 || index === 0 ? 0 : 1;
  return `${formatNumber(amount, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${units[index]}`;
}

export function formatDate(value, { withTime = false } = {}) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatReleaseYear(value) {
  if (!value) return null;
  let date;
  if (typeof value === "number") {
    date = new Date(value > 10_000_000_000 ? value : value * 1000);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? null : String(date.getFullYear());
}

export function timeAgo(value) {
  if (!value) return t("never");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("never");
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{n} min ago", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("{n}h ago", { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t("{n}d ago", { n: days });
  return formatDate(date);
}

export function sumSessionMs(sessions) {
  return (sessions || []).reduce((sum, session) => {
    if (session?.duration_ms) return sum + Number(session.duration_ms);
    const start = new Date(session?.start_time).getTime();
    const end = new Date(session?.end_time).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start
      ? sum + (end - start)
      : sum;
  }, 0);
}

export function errorText(error) {
  if (!error) return t("Something went sideways.");
  if (isAbortError(error)) return "";
  if (error.status === 0 && error.retryable) {
    return t("Can't reach the RomM server. Check your connection and the CORS setting.");
  }
  return error.message || t("Something went sideways.");
}

/* ------------------------------------------------------------------ */
/* Visual bits                                                         */
/* ------------------------------------------------------------------ */

export function fallbackCover(rom) {
  const label = shortName(rom);
  const accent = colorForPlatform(platformSlugOf(rom), platformLabelOf(rom));
  const div = el(
    "div",
    {
      class: "fallback-cover",
      style: { "--cart": accent },
      role: "img",
      "aria-label": t("No cover for {name}", { name: rom?.name || t("this game") }),
    },
    el("span", { class: "fallback-platform" }, platformLabelOf(rom)),
    el("span", { class: "fallback-label" }, label),
  );
  return div;
}

export function cover(rom, { size = "small", eager = false, className = "" } = {}) {
  const url = coverUrl(rom, size);
  if (!url) return fallbackCover(rom);

  const img = el("img", {
    src: url,
    alt: t("Cover art for {name}", { name: rom.name || rom.fs_name_no_ext || t("game") }),
    loading: eager ? "eager" : "lazy",
    decoding: "async",
  });
  img.addEventListener("error", () => {
    img.replaceWith(fallbackCover(rom));
  });
  return img;
}

export function shortName(rom) {
  return (
    rom?.name ||
    rom?.fs_name_no_ext ||
    rom?.fs_name_no_tags ||
    rom?.fs_name ||
    t("Untitled cartridge")
  );
}

export function platformDeviceImage(romOrSlug, { size = 20 } = {}) {
  const slug = typeof romOrSlug === "string" ? romOrSlug : platformSlugOf(romOrSlug);
  const src = DEVICE_IMAGES[slug];
  if (!src) return null;
  return el("img", {
    class: "platform-device-icon",
    src,
    alt: shortPlatformLabel(typeof romOrSlug === "string" ? { platform_slug: romOrSlug } : romOrSlug),
    width: Math.round(size * 1.7),
    height: size,
    loading: "lazy",
    decoding: "async",
  });
}

export function platformWashi(rom, variant = "") {
  const slug = platformSlugOf(rom);
  const device = platformDeviceImage(slug, { size: 18 });
  return el(
    "span",
    { class: `washi-tape ${variant}${device ? " has-device" : ""}` },
    device || shortPlatformLabel(rom),
  );
}

export function gameCard(rom, index = 0) {
  void index;
  const accent = colorForPlatform(platformSlugOf(rom), platformLabelOf(rom));
  const year = formatReleaseYear(rom.metadatum?.first_release_date);
  const rating = rom.metadatum?.average_rating;
  const device = platformDeviceImage(rom, { size: 16 });
  const platformLabel = shortPlatformLabel(rom);
  const coverNode = cover(rom, { size: "small" });

  const card = el(
    "a",
    {
      class: "game-card",
      href: `#/game/${encodeURIComponent(rom.id)}`,
      style: { "--cart": accent },
      "aria-label": `${shortName(rom)} · ${platformLabelOf(rom)}`,
    },
    el("div", { class: "game-cover" }, coverNode),
    el("span", { class: "game-title" }, shortName(rom)),
    el(
      "span",
      { class: "game-meta" },
      el("span", { class: "dot", style: { "--cart": accent } }),
      device ? el("span", { class: "meta-platform has-device" }, device) : (platformLabel || t("Game")),
      year ? (device ? ` ${year}` : ` · ${year}`) : "",
      rating ? ` · ${Math.round(rating)}%` : "",
    ),
  );

  const img = coverNode.tagName === "IMG" ? coverNode : coverNode.querySelector?.("img");
  const markWide = () => {
    if (img?.naturalWidth && img?.naturalHeight && img.naturalWidth > img.naturalHeight * 1.15) {
      card.classList.add("is-wide");
    }
  };
  if (img) {
    if (img.complete) markWide();
    else img.addEventListener("load", markWide, { once: true });
  }

  return card;
}

export function platformCart(platform) {
  const accent = colorForPlatform(platform.fs_slug, platform.slug, platform.name);
  const abbreviation =
    platform.abbreviation ||
    (platform.short_name || platform.name || "?")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase();
  const device = platformDeviceImage(platform.fs_slug || platform.slug || "", { size: 22 });

  return el(
    "a",
    {
      class: "cart",
      href: `#/platform/${encodeURIComponent(platform.slug)}`,
      style: { "--cart": accent },
      "aria-label": `${platform.display_name || platform.name}: ${platform.rom_count} ${t("games")}`,
    },
    el(
      "div",
      { class: "cart-system" },
      el("span", { class: `cart-abbr${device ? " has-device" : ""}` }, device || abbreviation),
      el("span", { class: "chip-cat" }, `${platform.rom_count || 0}`),
    ),
    el("div", { class: "cart-name" }, platform.display_name || platform.name),
    el(
      "div",
      { class: "cart-delta" },
      el("span", {}, t("Open")),
      el("span", {}, `${platform.rom_count || 0} ${t("games")}`),
    ),
  );
}

export function miniLedger(label, value, note) {
  return el(
    "div",
    { class: "ledger" },
    el("div", { class: "ledger-label" }, label),
    el("div", { class: "ledger-value" }, value),
    note ? el("div", { class: "ledger-note" }, note) : null,
  );
}

export function sectionHead(title, action) {
  return el(
    "div",
    { class: "section-head" },
    el("h2", { class: "marker marker-sm" }, title),
    action || null,
  );
}

export function moreLink(href, text = t("See all")) {
  return el(
    "a",
    { class: "section-link", href },
    text,
    icon("arrow-right", 16),
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function emptyState({ title, note, action, tone = "" }) {
  return el(
    "div",
    { class: `empty-state ${tone}` },
    el("h2", {}, title || t("Nothing here yet")),
    el("p", { class: "note" }, note || t("No matching items were found.")),
    action || null,
  );
}

export function errorState(error, retry) {
  const message = errorText(error) || t("That request was cancelled.");
  const action = retry
    ? el(
        "button",
        { class: "btn btn-keycap btn-yellow", type: "button", on: { click: retry } },
        icon("refresh", 18),
        t("Try again"),
      )
    : el(
        "a",
        { class: "btn btn-keycap btn-yellow", href: "#/" },
        t("Back to Home"),
      );

  return emptyState({
    title: t("Couldn't load this section"),
    note: message,
    action,
    tone: "error-card",
  });
}

export function loadingLine(text = t("Loading…")) {
  return el(
    "div",
    { class: "loading-line", role: "status" },
    el("span", { class: "spinner", "aria-hidden": "true" }),
    text,
  );
}

export function skeletonGrid(count = 10) {
  const grid = el("div", { class: "game-grid", "aria-hidden": "true" });
  for (let i = 0; i < count; i += 1) {
    grid.append(el("div", { class: "skeleton skeleton-card" }));
  }
  return grid;
}

export function skeletonTicket() {
  return el("div", { class: "skeleton skeleton-ticket", "aria-hidden": "true" });
}

/* ------------------------------------------------------------------ */
/* Toasts and modal                                                    */
/* ------------------------------------------------------------------ */

function toastRegion() {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = el("div", {
      id: "toast-region",
      class: "toast-region",
      role: "status",
      "aria-live": "polite",
    });
    document.body.append(region);
  }
  return region;
}

export function toast(message, { tone = "info", duration = 3600 } = {}) {
  const region = toastRegion();
  const node = el("div", { class: "toast", dataset: { tone }, role: "status" }, message);
  region.append(node);
  const hide = () => {
    node.remove();
  };
  setTimeout(hide, duration);
  return hide;
}

let activeModal = null;

export function closeModal() {
  if (!activeModal) return;
  const { scrim, previousFocus } = activeModal;
  scrim.remove();
  activeModal = null;
  previousFocus?.focus?.();
}

export function openModal({ title, content, actions = [], label = t("Dialog") }) {
  closeModal();

  const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;
  const previousFocus = document.activeElement;
  const body = el("div", { class: "modal-body" });
  body.append(content instanceof Node ? content : document.createTextNode(String(content || "")));

  const scrim = el(
    "div",
    {
      class: "modal-scrim",
      on: {
        click: (event) => {
          if (event.target === scrim) closeModal();
        },
      },
    },
    el(
      "section",
      {
        class: "modal",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": label,
        "aria-labelledby": titleId,
        tabindex: "-1",
      },
      el(
        "div",
        { class: "modal-header" },
        el("h2", { id: titleId }, title || label),
        el(
          "button",
          {
            class: "icon-btn",
            type: "button",
            "aria-label": t("Close dialog"),
            on: { click: closeModal },
          },
          icon("close", 20),
        ),
      ),
      body,
      actions.length
        ? el("div", { class: "modal-actions" }, ...actions)
        : null,
    ),
  );

  document.body.append(scrim);
  activeModal = { scrim, previousFocus };

  const focusables = () =>
    [...scrim.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(
      (node) => node.offsetParent !== null,
    );

  scrim.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const focusTarget = scrim.querySelector(".modal") || scrim;
  focusTarget.focus();
  return scrim;
}

export function screenshotModal(path, alt) {
  const url = screenshotUrl(path);
  if (!url) return;
  openModal({
    title: alt || t("Screenshot"),
    content: el("img", { src: url, alt: alt || t("Game screenshot") }),
  });
}

/* Language switch pill. Global clicks are handled once in js/app.js. */
export function langSwitch({ label } = {}) {
  const group = el("div", {
    class: "lang-switch",
    role: "group",
    "aria-label": label || t("Language"),
  });

  for (const code of LOCALES) {
    group.append(
      el(
        "button",
        {
          class: "lang-option",
          type: "button",
          "data-lang": code,
          lang: code,
          "aria-pressed": String(locale() === code),
          title: code === "id" ? "Bahasa Indonesia" : "English",
        },
        code === "id" ? "ID" : "EN",
      ),
    );
  }

  return group;
}

/* ------------------------------------------------------------------ */
/* Shared blocks                                                       */
/* ------------------------------------------------------------------ */

export function siteFooter() {
  const admin = isAdmin();
  return el(
    "footer",
    { class: "site-footer" },
    el("span", { class: "note" }, t("Self-hosted RomM underneath. Binus Arcade on top.")),
    link(
      `${ROMM_ORIGIN}`,
      { class: "footer-link" },
      t("Open stock RomM"),
      icon("external", 14),
    ),
    admin ? link(stockAdminUrl(), {}, t("Admin"), icon("external", 14)) : null,
  );
}

export function externalLink(href, text, iconName = "external") {
  return link(href, { class: "inline-link" }, text, icon(iconName, 14));
}

export function cartridgeMini() {
  return el("span", { class: "cartridge-mini", "aria-hidden": "true" });
}

export { ICONS, screenshotUrl };
