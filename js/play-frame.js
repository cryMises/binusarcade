/* Emulator sandbox. Runs EmulatorJS or Ruffle inside an iframe so leaving
 * the play view can destroy every global/listener cleanly. The parent owns
 * the auth token and the server sync.
 */

const game = document.getElementById("game");
let booted = false;
let mode = null;
let bootStage = "engine";
let assetFailureNotified = false;

function post(type, payload = {}) {
  window.parent.postMessage({ source: "binusarcade-play", type, ...payload }, window.location.origin);
}

function hostOf(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.host || "the asset server";
  } catch {
    return "the asset server";
  }
}

function showMessage(text) {
  game.replaceChildren();
  const message = document.createElement("div");
  message.className = "frame-message";
  message.textContent = text;
  game.append(message);
}

function loadScript(src, label = "the emulator engine") {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(script);
    script.onerror = () =>
      reject(new Error(`Could not load ${label} from ${hostOf(src)}.`));
    document.head.append(script);
  });
}

/* EJS fetches its core and data files itself. Wrap fetch so a CDN failure
 * says which host failed instead of only "Failed to fetch". */
function watchAssetFetches() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    try {
      return await nativeFetch(input, init);
    } catch (error) {
      if (!assetFailureNotified && error?.name !== "AbortError" && /^https?:/i.test(url)) {
        assetFailureNotified = true;
        post("notice", {
          tone: "error",
          message: `Emulator asset failed to load from ${hostOf(url)}. Check that the CDN is reachable.`,
        });
      }
      throw error;
    }
  };
}

watchAssetFetches();

function toArrayBuffer(value) {
  if (!value) return null;
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (typeof value.byteLength === "number") {
    try {
      return new Uint8Array(value).buffer;
    } catch {
      return null;
    }
  }
  return null;
}

function sendBytes(kind, value) {
  const buffer = toArrayBuffer(value);
  if (!buffer || !buffer.byteLength) {
    post("notice", { tone: "error", message: `The emulator returned an empty ${kind}.` });
    return;
  }
  post(kind, { bytes: buffer });
}

function attachEjsHooks() {
  window.EJS_onGameStart = () => {
    try {
      if (window.EJS_emulator) {
        window.EJS_emulator.settings = {
          ...(window.EJS_emulator.settings || {}),
          "save-state-location": "browser",
        };
      }
    } catch {
      /* settings are a nicety */
    }
    post("started");
  };

  window.EJS_onSaveSave = ({ save } = {}) => {
    sendBytes("save", save);
  };

  window.EJS_onSaveState = ({ state } = {}) => {
    sendBytes("state", state);
  };

  window.EJS_onLoadState = () => {
    try {
      window.EJS_emulator?.pause?.();
    } catch {
      /* ignore */
    }
    post("state-request");
  };
}

async function bootEjs(config) {
  if (!config.core) {
    throw new Error("No emulator core is mapped for this system.");
  }

  bootStage = "engine";
  attachEjsHooks();
  window.EJS_player = "#game";
  window.EJS_core = config.core;
  window.EJS_gameUrl = config.gameUrl;
  window.EJS_gameName = config.gameName || "Binus Arcade game";
  window.EJS_gameID = config.gameID;
  window.EJS_pathtodata = config.ejsData;
  window.EJS_startOnLoaded = true;
  window.EJS_backgroundColor = "#0b0908";
  window.EJS_color = "#2FE0A8";
  window.EJS_language = "en-US";
  window.EJS_defaultOptions = {
    "save-state-location": "browser",
    rewindEnabled: "enabled",
  };
  window.EJS_Buttons = {
    exitEmulation: false,
    saveSavFiles: false,
    loadSavFiles: false,
    restart: true,
    pause: true,
    play: true,
    saveState: true,
    loadState: true,
    gamepad: true,
    cheat: true,
    cacheManager: true,
    netplay: false,
    mute: true,
    unmute: true,
    settings: true,
    fullscreen: true,
  };

  if (config.biosUrl) window.EJS_biosUrl = config.biosUrl;

  showMessage("Loading the emulator engine…");
  try {
    await loadScript(config.loader, "the emulator engine");
  } catch (error) {
    showMessage(`${error.message} Open the game in stock RomM if this keeps happening.`);
    throw error;
  }
  bootStage = "core";
  post("ready");
}

async function bootRuffle(config) {
  bootStage = "flash";
  showMessage("Loading the Flash player…");
  window.RufflePlayer = window.RufflePlayer || {};
  window.RufflePlayer.config = {
    autoplay: "on",
    unmuteOverlay: "hidden",
    splashScreen: false,
    letterbox: "on",
    contextMenu: "on",
  };
  await loadScript(config.ruffle, "the Flash player");
  const ruffle = window.RufflePlayer.newest?.();
  if (!ruffle) throw new Error("Ruffle could not start in this browser.");

  const player = ruffle.createPlayer();
  player.style.width = "100%";
  player.style.height = "100%";
  game.replaceChildren(player);
  mode = "ruffle";

  player.addEventListener?.("loaded", () => post("started"));
  player.addEventListener?.("error", () => {
    post("error", { message: "Ruffle couldn't load this Flash file. Open it in stock RomM instead." });
  });

  await player.load(config.gameUrl);
  post("ready");
}

function writeSaveToFs(bytes) {
  const emulator = window.EJS_emulator;
  const manager = emulator?.gameManager;
  const fs = manager?.FS;
  if (!fs || typeof manager.getSaveFilePath !== "function") {
    throw new Error("The emulator save folder isn't ready yet.");
  }

  const savePath = manager.getSaveFilePath();
  const parts = savePath.split("/");
  let current = "";
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!parts[i]) continue;
    current += `/${parts[i]}`;
    if (!fs.analyzePath(current).exists) fs.mkdir(current);
  }

  if (fs.analyzePath(savePath).exists) fs.unlink(savePath);
  fs.writeFile(savePath, new Uint8Array(bytes));
  manager.loadSaveFiles();
}

function handleMessage(event) {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== "binusarcade-host") return;

  try {
    if (data.type === "boot" && !booted) {
      booted = true;
      const config = data.config || {};
      if (config.mode === "ruffle") {
        mode = "ruffle";
        bootRuffle(config).catch((error) => post("error", { message: error.message }));
      } else {
        mode = "ejs";
        bootEjs(config).catch((error) => post("error", { message: error.message }));
      }
      return;
    }

    if (!booted) return;

    if (data.type === "load-state") {
      const manager = window.EJS_emulator?.gameManager;
      if (!manager) throw new Error("The emulator isn't ready for save states yet.");
      manager.loadState(new Uint8Array(data.bytes));
      post("notice", { tone: "success", message: "Save state loaded." });
      return;
    }

    if (data.type === "load-save") {
      writeSaveToFs(data.bytes);
      window.EJS_emulator?.gameManager?.restart?.();
      post("notice", { tone: "success", message: "Save loaded. Restarting the game." });
      return;
    }

    if (data.type === "save-state-now") {
      const state = window.EJS_emulator?.gameManager?.getState?.();
      if (!state) throw new Error("The emulator isn't ready to save a state.");
      sendBytes("state", state);
      return;
    }

    if (data.type === "pause") {
      window.EJS_emulator?.pause?.();
      return;
    }

    if (data.type === "resume") {
      window.EJS_emulator?.play?.();
      return;
    }
  } catch (error) {
    post("error", { message: error.message || "The emulator hit a snag." });
    post("notice", { tone: "error", message: error.message || "The emulator hit a snag." });
  }
}

/* Chromium emits this when a ResizeObserver triggers another layout change.
 * EJS does it constantly; it is noise, not a failed game. */
function isBenign(message) {
  return /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(
    String(message || ""),
  );
}

window.addEventListener("message", handleMessage);
window.addEventListener("error", (event) => {
  const message = event.message || "The emulator crashed.";
  if (isBenign(message)) return;
  post("error", { message: `Emulator (${bootStage}): ${message}` });
});
window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message || "The emulator hit an unhandled error.";
  if (isBenign(message)) return;
  post("error", { message: `Emulator (${bootStage}): ${message}` });
});

void mode;
