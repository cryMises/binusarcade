import {
  api,
  isAbortError,
  publicDownloadBlob,
  relayUrl,
} from "../api.js";
import {
  clear,
  cover,
  el,
  errorState,
  formatBytes,
  icon,
  langSwitch,
  loadingLine,
  siteFooter,
  toast,
} from "../components.js";
import {
  EJS_CDN,
  EJS_LOADER,
  RUFFLE_CDN,
  colorForPlatform,
  coresForPlatform,
  isRufflePlatform,
  isSupportedPlatform,
  platformLabelOf,
  platformSlugOf,
  shortPlatformLabel,
} from "../config.js";
import { t } from "../i18n.js";

const PLAY_MESSAGE = "binusarcade-play";
const HOST_MESSAGE = "binusarcade-host";

export async function fetchTrialSettings({ signal } = {}) {
  try {
    return await api.settings({ signal });
  } catch {
    return { trialGameId: null, trialEnabled: false, registrationEnabled: true };
  }
}

function normalizeSettings(settings) {
  const id = settings?.trialGameId;
  const n = Number(id);
  return {
    trialGameId: Number.isFinite(n) && n > 0 ? Math.trunc(n) : null,
    trialEnabled: Boolean(settings?.trialEnabled),
    registrationEnabled: settings?.registrationEnabled !== false,
  };
}

/* Resolves the trial only when settings allow it AND /trial/meta succeeds
 * (Worker enforces enabled, game id, and secret; 503/403 -> hidden). */
export async function resolveTrial(settings, { signal } = {}) {
  const s = normalizeSettings(settings);
  if (!s.trialEnabled || !s.trialGameId) return null;
  try {
    const rom = await api.trialMeta({ signal });
    if (!rom?.id) return null;
    if (normalizeSettings({ trialGameId: rom.id }).trialGameId !== s.trialGameId) return null;
    if (!isSupportedPlatform(platformSlugOf(rom), rom.platform_slug, rom.platform_fs_slug)) return null;
    return { settings: s, rom };
  } catch {
    return null;
  }
}

function trialContentUrl(rom, file) {
  const base = relayUrl("/trial/content");
  if (!base) return null;
  const fileName =
    file?.file_name ||
    (rom?.has_nested_single_file && rom?.files?.length === 1
      ? rom.files[0].file_name
      : rom?.fs_name);
  if (!fileName) return null;
  const params = new URLSearchParams({ file_name: fileName });
  if (file?.id) params.set("file_ids", String(file.id));
  return `${base}?${params.toString()}`;
}

function romFileChoices(rom) {
  const files = Array.isArray(rom?.files) ? [...rom.files] : [];
  if (!files.length) return [];
  files.sort((a, b) => String(a.file_name || "").localeCompare(String(b.file_name || "")));
  return files;
}

export function trialView(ctx, initial = null) {
  const root = el("div", { class: "view wrap trial-view", "data-trial-view": "" });
  let cleanup = () => {};
  let rom = null;
  let files = [];
  let selectedFile = null;
  let core = null;
  let mode = "ejs";
  let iframe = null;
  let iframeWindow = null;
  let romBlobUrl = null;
  let downloadController = null;
  let downloadActive = false;

  root.append(buildTopBar(), el("div", { class: "play-loading" }, loadingLine(t("Loading the trial game…"))));

  function buildTopBar() {
    return el(
      "div",
      { class: "trial-topbar", style: { display: "flex", "align-items": "center", "justify-content": "space-between", gap: "12px", margin: "8px 0 16px" } },
      el("a", { class: "back-link", href: "#/" }, icon("arrow-left", 17), t("Sign in for the full library")),
      langSwitch(),
    );
  }

  function sendToFrame(type, payload = {}) {
    iframeWindow?.postMessage({ source: HOST_MESSAGE, type, ...payload }, window.location.origin);
  }

  function updateStatus(text) {
    const status = root.querySelector("[data-trial-status]");
    if (status) status.textContent = text;
  }

  function showPlayError(message) {
    const slot = root.querySelector("[data-trial-error]");
    if (!slot) return;
    clear(slot);
    slot.append(el("div", { class: "play-warning", role: "alert" }, icon("alert", 18), el("span", {}, message)));
  }

  function attachFrame(container, config) {
    iframe = el("iframe", {
      src: "./play-frame.html",
      title: t("{name} emulator", { name: rom?.name || t("Trial game") }),
      allow: "fullscreen; autoplay; gamepad; clipboard-write",
      allowfullscreen: "",
    });
    container.replaceChildren(iframe);

    const onMessage = (event) => {
      if (event.source !== iframeWindow) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== PLAY_MESSAGE) return;
      if (data.type === "ready") updateStatus(t("Engine ready. Start the game."));
      if (data.type === "started") updateStatus(t("Playing. Trial mode — progress won't be saved."));
      if (data.type === "state-request") {
        toast(t("Trial mode — progress won't be saved."), { tone: "warn" });
        sendToFrame("resume");
      }
      if (data.type === "notice") toast(data.message || t("Emulator update."), { tone: data.tone || "info" });
      if (data.type === "error") {
        showPlayError(data.message || t("The emulator hit a snag."));
        toast(data.message || t("The emulator hit a snag."), { tone: "error", duration: 6000 });
      }
    };
    window.addEventListener("message", onMessage);

    iframe.addEventListener("load", () => {
      iframeWindow = iframe.contentWindow;
      sendToFrame("boot", { config });
    }, { once: true });

    const oldCleanup = cleanup;
    cleanup = () => {
      oldCleanup?.();
      window.removeEventListener("message", onMessage);
      try { sendToFrame("pause"); } catch {}
      iframe?.remove();
      iframe = null;
      iframeWindow = null;
      if (romBlobUrl) URL.revokeObjectURL(romBlobUrl);
      downloadController?.abort();
    };
  }

  async function startGame() {
    if (downloadActive) return;
    downloadActive = true;
    downloadController = new AbortController();
    const startButton = root.querySelector("[data-start]");
    const progressBox = root.querySelector("[data-progress]");
    const progressFill = root.querySelector("[data-progress-fill]");
    const progressText = root.querySelector("[data-progress-text]");
    if (startButton) startButton.disabled = true;
    if (progressBox) progressBox.hidden = false;
    if (progressFill) progressFill.style.width = "2%";
    if (progressText) progressText.textContent = t("Fetching the game…");

    try {
      const contentUrl = trialContentUrl(rom, selectedFile);
      if (!contentUrl) throw new Error(t("Trial game file is unavailable."));
      const blob = await publicDownloadBlob(contentUrl, {
        signal: downloadController.signal,
        onProgress: ({ received, total }) => {
          const ratio = total ? Math.min(1, received / total) : 0;
          if (progressFill) progressFill.style.width = `${total ? Math.max(2, ratio * 100) : 30}%`;
          if (progressText) {
            progressText.textContent = total
              ? t("{received} of {total} ({pct}%)", {
                  received: formatBytes(received),
                  total: formatBytes(total),
                  pct: Math.round(ratio * 100),
                })
              : t("{received} downloaded", { received: formatBytes(received) });
          }
        },
      });

      romBlobUrl = URL.createObjectURL(blob);
      if (progressText) progressText.textContent = t("Preparing the emulator…");

      const stageCard = root.querySelector("[data-stage-card]");
      const stage = el("div", { class: "play-stage" });
      stageCard?.replaceChildren(stage);

      attachFrame(stage, {
        mode,
        core,
        gameUrl: romBlobUrl,
        gameName: rom.fs_name_no_tags || rom.name || "Trial game",
        gameID: rom.id,
        loader: EJS_LOADER,
        ejsData: EJS_CDN,
        ruffle: RUFFLE_CDN,
      });

      if (startButton) startButton.hidden = true;
      if (progressBox) progressBox.hidden = true;
      updateStatus(t("Downloaded. Tap start inside the player if it asks."));
    } catch (error) {
      if (isAbortError(error)) {
        if (progressText) progressText.textContent = t("Download cancelled.");
      } else {
        const message = error?.message || t("Couldn't download that game.");
        if (progressText) progressText.textContent = message;
        showPlayError(message);
        toast(message, { tone: "error", duration: 6000 });
      }
      if (startButton) startButton.disabled = false;
    } finally {
      downloadActive = false;
      downloadController = null;
    }
  }

  function renderDetail() {
    clear(root);
    files = romFileChoices(rom);
    selectedFile = files.length === 1 ? files[0] : files[0] || null;
    const cores = coresForPlatform(rom);
    core = cores[0] || null;
    mode = isRufflePlatform(rom) ? "ruffle" : "ejs";
    const platformName = platformLabelOf(rom);
    const file = selectedFile;
    const size = file?.file_size_bytes ? formatBytes(file.file_size_bytes) : "";

    const startButton = el(
      "button",
      { class: "btn btn-primary", type: "button", "data-start": "", on: { click: startGame } },
      icon("play", 18),
      t("START GAME"),
    );
    const progressBox = el(
      "div",
      { class: "trial-progress", "data-progress": "", hidden: "" },
      el("div", { class: "progress-track" }, el("div", { class: "progress-fill", "data-progress-fill": "" })),
      el("p", { class: "muted", "data-progress-text": "" }, ""),
    );

    const hero = el(
      "section",
      { class: "trial-hero card" },
      el(
        "div",
        { class: "trial-hero-media" },
        cover(rom, { size: "large", alt: rom.name || t("Trial game"), class: "trial-cover" }),
      ),
      el(
        "div",
        { class: "trial-hero-body" },
        el("p", { class: "eyebrow" }, shortPlatformLabel(rom)),
        el("h1", {}, rom.name || t("Trial game")),
        el("p", { class: "muted" }, platformName),
        core ? el("p", { class: "muted" }, t("{name} emulator", { name: core })) : null,
        size ? el("p", { class: "muted" }, size) : null,
        el("p", { class: "trial-note" }, t("No login needed. Progress won't be saved.")),
        startButton,
        progressBox,
        el("div", { "data-trial-error": "" }),
      ),
    );

    root.append(
      buildTopBar(),
      hero,
      el(
        "section",
        { class: "card trial-stage-card", "data-stage-card": "" },
        el("p", { class: "muted", "data-trial-status": "" }, t("Trial mode — progress won't be saved.")),
      ),
      siteFooter(),
    );
  }

  async function init() {
    try {
      if (initial?.rom?.id) {
        rom = initial.rom;
      } else {
        const settings = await fetchTrialSettings({ signal: ctx?.signal });
        const resolved = await resolveTrial(settings, { signal: ctx?.signal });
        if (!resolved?.rom) {
          if (!rom) window.location.hash = "#/";
          return;
        }
        rom = resolved.rom;
      }
      if (!isSupportedPlatform(platformSlugOf(rom), rom.platform_slug, rom.platform_fs_slug)) {
        if (!initial?.rom) window.location.hash = "#/";
        return;
      }
      renderDetail();
    } catch (error) {
      if (isAbortError(error)) return;
      if (rom) {
        renderDetail();
        return;
      }
      clear(root);
      root.append(buildTopBar(), errorState(error, init));
    }
  }

  init();

  return {
    el: root,
    cleanup() {
      cleanup();
    },
  };
}