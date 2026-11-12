import {
  api,
  downloadBlob,
  firmwareUrl,
  isAbortError,
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
  formatDate,
  formatPlaytime,
  icon,
  loadingLine,
  openModal,
  siteFooter,
  sumSessionMs,
  toast,
} from "../components.js";
import {
  coresForPlatform,
  EJS_CDN,
  EJS_LOADER,
  colorForPlatform,
  isRufflePlatform,
  isSupportedPlatform,
  platformLabelOf,
  platformSlugOf,
  RUFFLE_CDN,
  shortPlatformLabel,
  stockAdminUrl,
  stockRomUrl,
  deviceId,
} from "../config.js";

const PLAY_MESSAGE = "binusarcade-play";
const HOST_MESSAGE = "binusarcade-host";

function playSessionEntry(romId, start, end) {
  return {
    rom_id: romId,
    save_slot: null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    duration_ms: Math.max(0, end.getTime() - start.getTime()),
  };
}

export function playView(ctx) {
  const root = el("div", { class: "view wrap play-view" });
  const id = Number(ctx.params.id);
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
  let sessionStart = null;
  let sessionSent = false;
  let saves = [];
  let states = [];
  let gameStarted = false;
  let downloadActive = false;

  const back = el(
    "a",
    { class: "back-link", href: `#/game/${encodeURIComponent(id)}` },
    icon("arrow-left", 17),
    "Game sleeve",
  );
  root.append(back, el("div", { class: "play-loading" }, loadingLine("Warming up the CRT…")));

  function flushSession() {
    if (!sessionStart || !rom) return;
    const start = sessionStart;
    sessionStart = null;
    if (sessionSent) return;
    sessionSent = true;
    const end = new Date();
    if (end.getTime() - start.getTime() < 1000) return;
    api.recordPlaySession([playSessionEntry(rom.id, start, end)]);
    api.updateRomUser(rom.id, {}, { updateLastPlayed: true }).catch(() => null);
  }

  function sendToFrame(type, payload = {}) {
    iframeWindow?.postMessage(
      { source: HOST_MESSAGE, type, ...payload },
      window.location.origin,
    );
  }

  function attachFrame(container, config) {
    iframe = el("iframe", {
      src: "./play-frame.html",
      title: `${rom.name || "Game"} emulator`,
      allow: "fullscreen; autoplay; gamepad; clipboard-write",
      allowfullscreen: "",
    });
    container.replaceChildren(iframe);

    const onMessage = (event) => {
      if (event.source !== iframeWindow) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== PLAY_MESSAGE) return;
      handleFrameMessage(data);
    };
    window.addEventListener("message", onMessage);

    iframe.addEventListener(
      "load",
      () => {
        iframeWindow = iframe.contentWindow;
        sendToFrame("boot", { config });
      },
      { once: true },
    );

    const oldCleanup = cleanup;
    cleanup = () => {
      oldCleanup?.();
      window.removeEventListener("message", onMessage);
      if (iframe) {
        try {
          sendToFrame("pause");
        } catch {
          /* ignore */
        }
        iframe.remove();
        iframe = null;
        iframeWindow = null;
      }
      if (romBlobUrl) {
        URL.revokeObjectURL(romBlobUrl);
        romBlobUrl = null;
      }
      if (biosBlobUrl) {
        URL.revokeObjectURL(biosBlobUrl);
        biosBlobUrl = null;
      }
      downloadController?.abort();
      flushSession();
    };
  }

  function handleFrameMessage(data) {
    switch (data.type) {
      case "ready":
        toast("Emulator engine ready.", { tone: "success" });
        updateStatus("Engine ready. Start the game to sync saves.");
        break;
      case "started":
        if (!sessionStart) sessionStart = new Date();
        gameStarted = true;
        updateStatus("Playing. Save and save-state sync are on.");
        break;
      case "save":
        uploadSave(data.bytes);
        break;
      case "state":
        uploadState(data.bytes);
        break;
      case "state-request":
        openStatePicker();
        break;
      case "notice":
        toast(data.message || "Emulator update.", { tone: data.tone || "info" });
        break;
      case "error":
        showPlayError(data.message || "The emulator hit a snag.");
        toast(data.message || "The emulator hit a snag.", { tone: "error", duration: 6000 });
        break;
      default:
        break;
    }
  }

  async function uploadSave(bytes) {
    if (!bytes?.byteLength) return;
    try {
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      await api.uploadSave({
        romId: rom.id,
        blob,
        fileName: `${rom.fs_name_no_ext || rom.slug || rom.id}.sav`,
        emulator: core || "emulator",
      });
      toast("Save synced to RomM.", { tone: "success" });
      refreshSaves();
    } catch (error) {
      toast(error.message || "Save sync failed. The local emulator copy is still there.", {
        tone: "error",
        duration: 6000,
      });
    }
  }

  async function uploadState(bytes) {
    if (!bytes?.byteLength) return;
    try {
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      await api.uploadState({
        romId: rom.id,
        blob,
        fileName: `${rom.fs_name_no_ext || rom.slug || rom.id}.state`,
        emulator: core || "emulator",
      });
      toast("Save state synced to RomM.", { tone: "success" });
      refreshStates();
    } catch (error) {
      toast(error.message || "Save-state sync failed.", { tone: "error", duration: 6000 });
    }
  }

  async function refreshSaves() {
    try {
      saves = await api.saves(rom.id);
    } catch {
      saves = [];
    }
    renderSaves();
  }

  async function refreshStates() {
    try {
      states = await api.states(rom.id);
    } catch {
      states = [];
    }
    renderStates();
  }

  async function loadSave(row) {
    if (!gameStarted) {
      toast("Start the game first, then load a save.", { tone: "warn" });
      return;
    }
    try {
      toast("Fetching save…");
      const blob = await api.downloadSave(row.id);
      const bytes = await blob.arrayBuffer();
      sendToFrame("load-save", { bytes });
      api.confirmSaveDownloaded(row.id).catch(() => null);
    } catch (error) {
      toast(error.message || "Couldn't fetch that save.", { tone: "error" });
    }
  }

  async function loadState(row) {
    if (!gameStarted) {
      toast("Start the game first, then load a state.", { tone: "warn" });
      return;
    }
    try {
      toast("Fetching save state…");
      const blob = await api.downloadState(row.id);
      const bytes = await blob.arrayBuffer();
      sendToFrame("load-state", { bytes });
    } catch (error) {
      toast(error.message || "Couldn't fetch that save state.", { tone: "error" });
    }
  }

  function openStatePicker() {
    if (!states.length) {
      toast("No save states on the server yet. Save one from the emulator menu.", { tone: "warn" });
      sendToFrame("resume");
      return;
    }
    const list = el("div", { class: "save-list" });
    states.forEach((row) => {
      list.append(
        el(
          "div",
          { class: "save-row" },
          el("span", { class: "save-row-icon" }, icon("camera", 20)),
          el(
            "div",
            { class: "save-row-copy" },
            el("strong", {}, row.file_name || `State ${row.id}`),
            el("span", {}, `${row.emulator || "emulator"} · ${formatDate(row.updated_at || row.created_at, { withTime: true })}`),
          ),
          el(
            "button",
            {
              class: "btn btn-keycap-sm btn-mint",
              type: "button",
              on: {
                click: () => {
                  loadState(row);
                  document.querySelector(".modal-scrim")?.remove();
                },
              },
            },
            "Load",
          ),
        ),
      );
    });
    openModal({ title: "Load save state", content: list, label: "Load save state" });
  }

  function updateStatus(text) {
    const status = root.querySelector("[data-play-status]");
    if (status) status.textContent = text;
  }

  function showPlayError(message) {
    updateStatus("The emulator couldn't start.");
    const slot = root.querySelector("[data-play-error]");
    if (!slot) return;
    clear(slot);
    slot.append(
      el(
        "div",
        { class: "play-warning", role: "alert" },
        icon("alert", 18),
        el(
          "span",
          {},
          message,
          " ",
          el(
            "a",
            { href: stockRomUrl(rom.id), target: "_blank", rel: "noopener noreferrer" },
            "Open it in stock RomM",
          ),
          ".",
        ),
      ),
    );
  }

  function renderSaves() {
    const slot = root.querySelector("[data-saves-slot]");
    if (!slot) return;
    clear(slot);
    if (!saves.length) {
      slot.append(el("p", { class: "note" }, "No saves on the RomM shelf yet. Use the emulator menu to sync one."));
      return;
    }
    const list = el("div", { class: "save-list" });
    saves.slice(0, 8).forEach((row) => list.append(saveRow(row, "save", () => loadSave(row))));
    slot.append(list);
  }

  function renderStates() {
    const slot = root.querySelector("[data-states-slot]");
    if (!slot) return;
    clear(slot);
    if (!states.length) {
      slot.append(el("p", { class: "note" }, "No save states yet. Save one from the emulator menu."));
      return;
    }
    const list = el("div", { class: "save-list" });
    states.slice(0, 8).forEach((row) => list.append(saveRow(row, "state", () => loadState(row))));
    slot.append(list);
  }

  function saveRow(row, kind, onLoad) {
    return el(
      "div",
      { class: "save-row" },
      el("span", { class: "save-row-icon" }, icon(kind === "save" ? "save" : "camera", 20)),
      el(
        "div",
        { class: "save-row-copy" },
        el("strong", {}, row.file_name || `${kind} ${row.id}`),
        el(
          "span",
          {},
          `${row.emulator || "emulator"} · ${formatBytes(row.file_size_bytes)} · ${formatDate(row.updated_at || row.created_at, { withTime: true })}`,
        ),
      ),
      el(
        "button",
        { class: "btn btn-keycap-sm btn-mint", type: "button", on: { click: onLoad } },
        "Load",
      ),
    );
  }

  async function startGame() {
    if (downloadActive || gameStarted) return;
    if (!rom) return;

    downloadController?.abort();
    downloadController = new AbortController();
    downloadActive = true;

    const startButton = root.querySelector("[data-start]");
    const progressBox = root.querySelector("[data-progress]");
    const progressFill = root.querySelector("[data-progress-fill]");
    const progressText = root.querySelector("[data-progress-text]");
    const cancelButton = root.querySelector("[data-cancel]");

    startButton.disabled = true;
    progressBox.hidden = false;
    if (cancelButton) cancelButton.hidden = false;
    progressFill.style.width = "2%";
    progressText.textContent = "Fetching the cartridge…";

    try {
      const contentUrl = romContentUrl(rom, selectedFile);
      const blob = await downloadBlob(contentUrl, {
        signal: downloadController.signal,
        onProgress: ({ received, total }) => {
          const ratio = total ? Math.min(1, received / total) : 0;
          progressFill.style.width = `${total ? Math.max(2, ratio * 100) : 30}%`;
          progressText.textContent = total
            ? `${formatBytes(received)} of ${formatBytes(total)} (${Math.round(ratio * 100)}%)`
            : `${formatBytes(received)} downloaded`;
        },
      });

      romBlobUrl = URL.createObjectURL(blob);
      progressText.textContent = "Preparing the emulator…";

      let biosUrl;
      if (core === "pcsx_rearmed" || core === "mednafen_psx_hw") {
        biosUrl = await loadBios().catch(() => null);
      }

      const stage = el("div", { class: "play-stage" });
      const stageCard = root.querySelector("[data-stage-card]");
      stageCard.replaceChildren(stage);

      attachFrame(stage, {
        mode,
        core,
        gameUrl: romBlobUrl,
        gameName: rom.fs_name_no_tags || rom.name || "Binus Arcade game",
        gameID: rom.id,
        biosUrl,
        loader: EJS_LOADER,
        ejsData: EJS_CDN,
        ruffle: RUFFLE_CDN,
      });

      startButton.disabled = true;
      startButton.hidden = true;
      if (cancelButton) cancelButton.hidden = true;
      progressBox.hidden = true;
      updateStatus("Downloaded. Tap start inside the player if it asks.");
      toast("Cartridge downloaded. Booting the core…", { tone: "success" });
    } catch (error) {
      if (isAbortError(error)) {
        progressText.textContent = "Download cancelled.";
      } else {
        progressText.textContent = error.message || "Couldn't download that cartridge.";
        toast(error.message || "Couldn't download that cartridge.", { tone: "error", duration: 6000 });
      }
      startButton.disabled = false;
      if (cancelButton) cancelButton.hidden = true;
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
    const progressText = root.querySelector("[data-progress-text]");
    if (progressText) progressText.textContent = "Fetching platform BIOS…";
    try {
      const blob = await downloadBlob(url, { signal: downloadController.signal });
      biosBlobUrl = URL.createObjectURL(blob);
      return biosBlobUrl;
    } catch {
      toast("BIOS wasn't available. Some PS1 games may not boot without one.", {
        tone: "warn",
        duration: 5200,
      });
      return null;
    }
  }

  function renderReady() {
    clear(root);
    const accent = colorForPlatform(platformSlugOf(rom), platformLabelOf(rom));
    const title = el("h1", { class: "play-bar-title" }, rom.name || rom.fs_name_no_ext || "Game");
    const stageCard = el("div", { class: "play-stage-card", dataset: { "stage-card": "" } });
    stageCard.append(buildStagePlaceholder());

    const setup = buildSetup({ accent });

    const below = el(
      "div",
      { class: "play-below" },
      el(
        "section",
        { class: "block" },
        el("h2", { class: "marker marker-sm" }, "Saves on RomM"),
        el("p", { class: "note" }, "The emulator menu uploads saves here. You can load any of them without leaving the arcade."),
        el("div", { dataset: { "saves-slot": "" } }, el("p", { class: "note" }, "Loading saves…")),
      ),
      el(
        "section",
        { class: "block" },
        el("h2", { class: "marker marker-sm" }, "Save states"),
        el("p", { class: "note" }, "Quick snapshots of the emulator, synced separately from battery saves."),
        el("div", { dataset: { "states-slot": "" } }, el("p", { class: "note" }, "Loading states…")),
      ),
    );

    root.append(
      el(
        "div",
        { class: "play-bar" },
        el(
          "a",
          { class: "back-link", href: `#/game/${encodeURIComponent(rom.id)}` },
          icon("arrow-left", 17),
          "Game sleeve",
        ),
        el(
          "div",
          { class: "play-bar-copy" },
          el("div", { class: "eyebrow" }, `${platformLabelOf(rom)} · ${mode === "ruffle" ? "Ruffle" : core || "Emulator"}`),
          title,
        ),
        el("span", { class: "chip-cat", style: { "--cart": accent } }, shortPlatformLabel(rom)),
      ),
      el("div", { class: "play-stage-card", dataset: { "stage-card": "" } }, stageCard.firstChild || buildStagePlaceholder()),
      setup,
      below,
      el("p", { class: "note", style: { "margin-top": "18px" } }, "Runs in your browser. Nothing is installed on your phone."),
      siteFooter(),
    );

    const startButton = root.querySelector("[data-start]");
    startButton?.addEventListener("click", startGame);
    root.querySelector("[data-cancel]")?.addEventListener("click", () => {
      downloadController?.abort();
    });
    root.querySelector("[data-save-now]")?.addEventListener("click", () => {
      if (!gameStarted) {
        toast("Start the game first.", { tone: "warn" });
        return;
      }
      sendToFrame("save-state-now");
    });
    root.querySelector("[data-open-states]")?.addEventListener("click", openStatePicker);
    root.querySelector("[data-pause]")?.addEventListener("click", () => {
      if (!gameStarted) return;
      sendToFrame("pause");
      toast("Game paused.");
    });

    refreshSaves();
    refreshStates();
    void stageCard;
  }

  function buildStagePlaceholder() {
    return el(
      "div",
      { class: "play-stage" },
      el(
        "div",
        { class: "play-setup", style: { "grid-template-columns": "1fr", "place-items": "center", "text-align": "center", "min-height": "300px" } },
        el("span", { class: "cartridge-mini", "aria-hidden": "true" }),
        el(
          "p",
          { class: "note", style: { "max-width": "34ch" } },
          "Press START. The cartridge downloads once, then the emulator boots in place.",
        ),
      ),
    );
  }

  function buildSetup({ accent }) {
    const fileChoices = files.length;
    const filePicker = el("div", { class: "file-picker" });
    if (fileChoices > 1) {
      filePicker.append(el("div", { class: "field-label" }, "Choose a disc / file"));
      files.forEach((file, index) => {
        const input = el("input", {
          type: "radio",
          name: "rom-file",
          value: String(index),
          checked: index === 0,
          on: {
            change: () => {
              selectedFile = files[index];
            },
          },
        });
        filePicker.append(
          el("label", {}, input, file.file_name || `File ${index + 1}`),
        );
      });
      selectedFile = files[0];
    }

    const facts = el("div", { class: "play-facts" });
    facts.append(
      ...[
        el("span", { class: "chip-topic" }, mode === "ruffle" ? "Flash / Ruffle" : core || "No core"),
        el("span", { class: "chip-topic" }, selectedFile ? formatBytes(selectedFile.file_size_bytes) : formatBytes(rom.fs_size_bytes)),
        rom.has_multiple_files ? el("span", { class: "chip-topic" }, `${files.length} files`) : null,
      ].filter(Boolean),
    );

    const progressBox = el(
      "div",
      { class: "play-progress", dataset: { progress: "" }, hidden: true },
      el(
        "div",
        { class: "progress-track", role: "progressbar", "aria-label": "Cartridge download" },
        el("div", { class: "progress-fill", dataset: { "progress-fill": "" } }),
      ),
      el("div", { class: "ledger-note", dataset: { "progress-text": "" } }, "Fetching…"),
    );

    const warnings = [];
    if (platformSlugOf(rom) === "nds") {
      warnings.push(
        el(
          "div",
          { class: "play-warning" },
          icon("alert", 18),
          el(
            "span",
            {},
            "Nintendo DS touch screen does not receive phone touch. Games that need the stylus are best played with a mouse or stylus on a computer.",
          ),
        ),
      );
    }
    if (mode === "ruffle") {
      warnings.push(
        el(
          "div",
          { class: "play-warning" },
          icon("alert", 18),
          el("span", {}, "Flash support depends on the file. If Ruffle can't load it, open the game in stock RomM."),
        ),
      );
    }
    if (fileChoices > 1) {
      warnings.push(
        el(
          "div",
          { class: "play-warning" },
          icon("alert", 18),
          el("span", {}, "This is a multi-file game. Pick the disc or file you want to boot."),
        ),
      );
    }

    return el(
      "div",
      { class: "play-setup", dataset: { "setup-card": "" } },
      el("div", { class: "play-setup-cover" }, cover(rom, { size: "large", eager: true })),
      el(
        "div",
        { class: "play-setup-copy" },
        el("div", { class: "eyebrow" }, "Ready to insert"),
        el("h2", {}, rom.name || rom.fs_name_no_ext || "Game"),
        facts,
        filePicker,
        el(
          "div",
          { class: "play-start-row" },
          el(
            "button",
            { class: "btn btn-keycap btn-mint", type: "button", dataset: { start: "" } },
            icon("play", 21),
            "START GAME",
          ),
          el(
            "button",
            { class: "btn btn-keycap-sm btn-ghost", type: "button", dataset: { cancel: "" }, hidden: true },
            "Cancel download",
          ),
          el(
            "button",
            { class: "btn btn-keycap-sm btn-ghost", type: "button", dataset: { pause: "" } },
            icon("pause", 15),
            "Pause",
          ),
          el(
            "button",
            { class: "btn btn-keycap-sm btn-ghost", type: "button", dataset: { "save-now": "" } },
            icon("save", 15),
            "Save state",
          ),
          el(
            "button",
            { class: "btn btn-keycap-sm btn-ghost", type: "button", dataset: { "open-states": "" } },
            icon("camera", 15),
            "Load state",
          ),
        ),
        el("p", { class: "ledger-note", dataset: { "play-status": "" } }, "Waiting for the cartridge…"),
        el("div", { dataset: { "play-error": "" } }),
        progressBox,
        ...warnings,
      ),
    );
  }

  (async () => {
    try {
      if (!Number.isFinite(id) || id <= 0) throw new Error("That game id doesn't look right.");
      rom = await api.rom(id);
      document.title = `${rom.name || rom.fs_name_no_ext || "Play"} · Binus Arcade`;
      files = romFileChoices(rom);
      if (!files.length) {
        try {
          files = romFileChoices({ ...rom, files: await api.romFiles(rom.id) });
        } catch {
          files = [];
        }
      }
      selectedFile = files[0] || null;

      const slug = platformSlugOf(rom);
      const candidates = coresForPlatform(slug, rom.platform_slug, rom.platform_fs_slug);
      core = candidates[0] || null;
      mode = isRufflePlatform(slug, rom.platform_slug, rom.platform_fs_slug) ? "ruffle" : "ejs";

      try {
        const platforms = await api.platforms();
        platform =
          platforms.find(
            (item) =>
              item.id === rom.platform_id ||
              item.slug === rom.platform_slug ||
              item.fs_slug === rom.platform_fs_slug,
          ) || null;
      } catch {
        platform = null;
      }

      if (!isSupportedPlatform(slug, rom.platform_slug, rom.platform_fs_slug)) {
        clear(root);
        root.append(
          el(
            "a",
            { class: "back-link", href: `#/game/${encodeURIComponent(rom.id)}` },
            icon("arrow-left", 17),
            "Game sleeve",
          ),
          emptyState({
            title: "No core in the arcade",
            note: `${platformLabelOf(rom)} isn't mapped to a browser emulator here. Open it in stock RomM on a device with an emulator that supports it, or try another system.`,
            action: el(
              "a",
              { class: "btn btn-keycap btn-yellow", href: stockRomUrl(rom.id), target: "_blank", rel: "noopener noreferrer" },
              "Open in stock RomM",
              icon("external", 16),
            ),
          }),
          siteFooter(),
        );
        return;
      }

      renderReady();
    } catch (error) {
      clear(root);
      root.append(
        el("a", { class: "back-link", href: "#/" }, icon("arrow-left", 17), "Hall"),
        errorState(error, () => location.reload()),
      );
    }
  })();

  root.append(el("div", { class: "play-footnote" }));
  void formatPlaytime;
  void sumSessionMs;
  void deviceId;

  const onPageHide = () => flushSession();
  window.addEventListener("pagehide", onPageHide);
  const baseCleanup = () => {
    window.removeEventListener("pagehide", onPageHide);
    flushSession();
  };

  return {
    el: root,
    cleanup: () => {
      baseCleanup();
      cleanup();
    },
  };
}
