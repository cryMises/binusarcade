import {
  api,
  coverUrl,
  firmwareUrl,
  isAbortError,
  publicDownloadBlob,
  publicRequest,
  romContentUrl,
  romFileChoices,
} from "../api.js";
import {
  clear,
  cover,
  el,
  emptyState,
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

export async function resolveTrial(settings, { signal } = {}) {
  const s = normalizeSettings(settings);
  if (!s.trialEnabled || !s.trialGameId) return null;
  try {
    const rom = await api.romPublic(s.trialGameId, { signal });
    if (!rom?.id) return null;
    if (!isSupportedPlatform(platformSlugOf(rom), rom.platform_slug, rom.platform_fs_slug)) return null;
    return { settings: s, rom };
  } catch {
    return null;
  }
}

export function trialView(ctx) {
  const root = el("div", { class: "view wrap trial-view" });
  let cleanup = () => {};
  let rom = null;
  let platform = null;
  let files = [];
  let selectedFile = null;
  let core = null;
  let mode = "ejs";
  let iframe = null;
  let iframeWindow = null;
  let romBlobUrl = null;
  let biosBlobUrl = null;
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
      if (biosBlobUrl) URL.revokeObjectURL(biosBlobUrl);
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
      const contentUrl = romContentUrl(rom, selectedFile);
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

      let biosUrl;
      if (core === "pcsx_rearmed" || core === "mednafen_psx_hw") {
        biosUrl = await loadBios().catch(() => null);
      }

      const stageCard = root.querySelector("[data-stage-card]");
      const stage = el("div", { class: "play-stage" });
      stageCard?.replaceChildren(stage);

      attachFrame(stage, {
        mode,
        core,
        gameUrl: romBlobUrl,
        gameName: rom.fs_name_no_tags || rom.name || "Trial game",
        gameID: rom.id,
        biosUrl,
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
    }
  }

  async function loadBios() {
    if (!platform?.firmware?.length) return null;
    const firmware = platform.firmware.find((item) => !item.missing_from_fs);
    if (!firmware) return null;
    const url = firmwareUrl(firmware);
    if (!url) return null;
    try {
      const blob = await publicDownloadBlob(url, { signal: downloadController.signal });
      biosBlobUrl = URL.createObjectURL(blob);
      return biosBlobUrl;
    } catch {
      toast(t("BIOS wasn't available. Some games may not boot without one."), { tone: "warn", duration: 5200 });
      return null;
    }
  }

  function renderDetailLite() {
    clear(root);
    const accent = colorForPlatform(platformSlugOf(rom), platformLabelOf(rom));
    const coverEl = cover(rom, { size: "large", eager: true });
    const stageCard = el("div", { class: "play-stage-card", dataset: { "stage-card": "" } },
      el("div", { class: "play-stage" },
        el("div", { class: "play-setup", style: { "grid-template-columns": "1fr", "place-items": "center", "text-align": "center", "min-height": "260px" } },
          el("p", { class: "note", style: { "max-width": "34ch" } }, t("Press START to load the trial game in your browser.")),
        ),
      ),
    );

    const facts = el("div", { class: "play-facts" },
      el("span", { class: "chip-topic" }, platformLabelOf(rom)),
      el("span", { class: "chip-topic" }, mode === "ruffle" ? "Ruffle" : core || "Emulator"),
      selectedFile ? el("span", { class: "chip-topic" }, formatBytes(selectedFile.file_size_bytes)) : null,
    );

    const progressBox = el("div", { class: "play-progress", dataset: { progress: "" }, hidden: true },
      el("div", { class: "progress-track", role: "progressbar", "aria-label": t("Game download") },
        el("div", { class: "progress-fill", dataset: { "progress-fill": "" } }),
      ),
      el("div", { class: "ledger-note", dataset: { "progress-text": "" } }, t("Fetching…")),
    );

    const warnings = [
      el("div", { class: "play-warning" }, icon("alert", 18),
        el("span", {}, t("Trial mode — progress won't be saved."))),
    ];
    if (platformSlugOf(rom) === "nds") {
      warnings.push(el("div", { class: "play-warning" }, icon("alert", 18),
        el("span", {}, t("Nintendo DS touch screen works best with a mouse or stylus."))));
    }

    root.append(
      buildTopBar(),
      el("div", { class: "play-bar" },
        el("div", { class: "play-bar-copy" },
          el("div", { class: "eyebrow" }, t("Try one game")),
          el("h1", { class: "play-bar-title" }, rom.name || rom.fs_name_no_ext || t("Trial game")),
        ),
        el("span", { class: "chip-cat", style: { "--cart": accent } }, shortPlatformLabel(rom)),
      ),
      stageCard,
      el("div", { class: "play-setup", dataset: { "setup-card": "" } },
        el("div", { class: "play-setup-cover" }, coverEl),
        el("div", { class: "play-setup-copy" },
          el("div", { class: "eyebrow" }, t("No login needed")),
          el("h2", {}, rom.name || rom.fs_name_no_ext || t("Trial game")),
          facts,
          el("div", { class: "play-start-row" },
            el("button", { class: "btn btn-keycap btn-mint", type: "button", dataset: { start: "" }, on: { click: startGame } },
              icon("play", 21), t("START GAME")),
          ),
          el("p", { class: "ledger-note", dataset: { "trial-status": "" } }, t("Waiting to start…")),
          el("div", { dataset: { "trial-error": "" } }),
          progressBox,
          ...warnings,
        ),
      ),
      el("p", { class: "note", style: { "margin-top": "18px" } }, t("Runs in your browser. Nothing is installed on your phone.")),
      siteFooter(),
    );
  }

  (async () => {
    try {
      const settings = await fetchTrialSettings({ signal: ctx.signal });
      const trial = await resolveTrial(settings, { signal: ctx.signal });
      if (!trial) {
        ctx.navigate("/", { replace: true });
        return;
      }
      rom = trial.rom;
      document.title = `${rom.name || t("Trial game")} · Binus Arcade`;
      files = romFileChoices(rom);
      if (!files.length) {
        try { files = romFileChoices({ ...rom, files: await api.romFilesPublic(rom.id) }); } catch { files = []; }
      }
      selectedFile = files[0] || null;

      const slug = platformSlugOf(rom);
      core = coresForPlatform(slug, rom.platform_slug, rom.platform_fs_slug)[0] || null;
      mode = isRufflePlatform(slug, rom.platform_slug, rom.platform_fs_slug) ? "ruffle" : "ejs";
      try {
        const platforms = await publicRequest("/platforms", { timeout: 10_000 });
        platform = (platforms || []).find((item) => item.id === rom.platform_id || item.slug === rom.platform_slug || item.fs_slug === rom.platform_fs_slug) || null;
      } catch { platform = null; }

      renderDetailLite();
    } catch (error) {
      if (isAbortError(error)) return;
      clear(root);
      root.append(buildTopBar(), errorState(error, () => location.reload()));
    }
  })();

  const onPageHide = () => cleanup();
  window.addEventListener("pagehide", onPageHide);
  return {
    el: root,
    cleanup: () => {
      window.removeEventListener("pagehide", onPageHide);
      cleanup();
    },
  };
}
