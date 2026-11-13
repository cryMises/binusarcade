import { api, getSession, hasSignupRelay, isRoleAdmin } from "../api.js";
import { clear, el, emptyState, icon, toast } from "../components.js";
import { signupClaimUrl, signupInviteUrl } from "../config.js";
import { t } from "../i18n.js";
import qrcode from "../vendor/qrcode.js";

const EXPIRATION_SECONDS = 3600;
const POLL_MS = 10_000;
const RELAY_POLL_MS = 4_000;

export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function buildQrSvg(url) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const markup = qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = document.importNode(doc.documentElement, true);
  svg.classList.add("signup-qr-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("Single-use player invite QR code"));
  return svg;
}

export function createSignupPanel({
  showClose = false,
  showFullScreen = false,
  onClose,
  initialState = null,
  onRelayDisabled,
} = {}) {
  const relayMode = hasSignupRelay();
  let disposed = false;
  let currentToken = null;
  let currentUrl = "";
  let expiresAt = 0;
  let knownUserIds = null;
  let mintInFlight = false;
  let pollInFlight = false;
  let pollStoppedForScope = false;
  let pollTimer = null;
  let tickTimer = null;
  let activeMint = null;
  let activePoll = null;

  const root = el("section", {
    class: "signup-panel block",
    "aria-label": t("Invite signup QR panel"),
  });

  const countdownBadge = el("span", { class: "signup-timer", "data-signup-timer": "" }, "60:00");
  const statusLine = el(
    "p",
    { class: "note signup-status", "data-signup-status": "" },
    relayMode ? t("Enabling shared signup QR…") : t("Minting a single-use player invite…"),
  );
  const errorSlot = el("div", { class: "signup-error-slot", "data-signup-error": "" });
  const qrFrame = el("div", { class: "signup-qr-frame", "data-signup-qr": "" });
  const linkInput = el("input", {
    class: "input signup-link-input",
    type: "text",
    readonly: true,
    value: "",
    "aria-label": t("Single-use invite link"),
    "data-signup-link": "",
  });

  const copyButton = el(
    "button",
    {
      class: "btn btn-primary signup-copy-btn",
      type: "button",
      disabled: true,
      "data-copy-link": "",
      on: {
        click: async () => {
          if (!currentUrl) return;
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(currentUrl);
            } else {
              linkInput.select();
              document.execCommand?.("copy");
            }
            toast(t("Invite link copied."), { tone: "success" });
          } catch {
            linkInput.focus();
            linkInput.select();
            toast(t("Select and copy the invite link above."));
          }
        },
      },
    },
    icon("copy", 16),
    t("Copy link"),
  );

  const newButton = el(
    "button",
    {
      class: "btn btn-ghost",
      type: "button",
      "data-new-invite": "",
      on: {
        click: () => {
          void mintInvite(t("Fresh single-use invite ready."), { refreshUsers: true, forceRotate: true });
        },
      },
    },
    icon("refresh", 16),
    t("New invite"),
  );

  const closeButton = showClose
    ? el(
        "button",
        {
          class: "btn btn-ghost",
          type: "button",
          "data-close-signup": "",
          on: {
            click: () => {
              cleanup();
              onClose?.();
            },
          },
        },
        icon("close", 16),
        t("Close"),
      )
    : null;

  const fullScreenLink = showFullScreen
    ? el(
        "a",
        { class: "btn btn-ghost", href: "#/signup" },
        icon("qr", 16),
        t("Full screen"),
      )
    : null;

  const body = el(
    "div",
    { class: "signup-body", hidden: true },
    el("div", { class: "signup-qr-card" }, qrFrame),
    el(
      "div",
      { class: "signup-link-row" },
      linkInput,
      copyButton,
    ),
    el(
      "div",
      { class: "signup-controls" },
      newButton,
      fullScreenLink,
      closeButton,
    ),
  );

  const notice = el(
    "p",
    { class: "signup-security-note" },
    icon("alert", 16),
    el(
      "span",
      {},
      relayMode
        ? t("Single-use player invite (role: user). While enabled, anyone who taps Create account sees this QR. Every scan or claim rotates immediately to a new unused QR.")
        : t("Single-use player invite (role: user). Anyone who scans this QR or opens the link can create a player account. Refreshes automatically when a new user registers or when the 60:00 timer runs out."),
    ),
  );

  root.append(
    el(
      "div",
      { class: "signup-head" },
      el(
        "div",
        {},
        el("div", { class: "eyebrow" }, t("Admin invite")),
        el("h2", {}, t("Friend signup QR")),
      ),
      el("div", { class: "signup-timer-wrap" }, el("span", { class: "note" }, t("Expires in")), countdownBadge),
    ),
    statusLine,
    errorSlot,
    body,
    notice,
  );

  function stopTimers() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    activeMint?.abort();
    activePoll?.abort();
    activeMint = null;
    activePoll = null;
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stopTimers();
    currentToken = null;
    currentUrl = "";
    expiresAt = 0;
    knownUserIds = null;
  }

  function showError(message, { canRetry = true } = {}) {
    clear(errorSlot);
    const box = el(
      "div",
      { class: "signup-error", role: "alert" },
      el("div", { class: "signup-error-copy" }, icon("alert", 18), el("span", {}, message)),
      canRetry
        ? el(
            "button",
            {
              class: "btn btn-ghost",
              type: "button",
              "data-retry-invite": "",
              on: { click: () => void mintInvite(t("Fresh single-use invite ready."), { refreshUsers: true, forceRotate: true }) },
            },
            t("Retry"),
          )
        : null,
    );
    errorSlot.append(box);
  }

  function renderCountdown() {
    if (disposed) return;
    if (!expiresAt || !currentToken) {
      countdownBadge.textContent = "--:--";
      return;
    }
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    countdownBadge.textContent = formatCountdown(remaining);
    if (remaining <= 0 && !mintInFlight) {
      void mintInvite(t("Invite expired — minted a fresh invite."), { forceRotate: !relayMode });
    }
  }

  function ensureTimers() {
    if (!tickTimer) {
      tickTimer = setInterval(renderCountdown, 1000);
    }
    if (!pollTimer && !pollStoppedForScope) {
      pollTimer = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        void (relayMode ? pollRelay() : pollUsers());
      }, relayMode ? RELAY_POLL_MS : POLL_MS);
    }
  }

  function applyRelayInvite(data, reason = "") {
    if (!data?.enabled) {
      cleanup();
      onRelayDisabled?.();
      return false;
    }
    if (!data.claimId) {
      return false;
    }
    const url = data.qrUrl || signupClaimUrl(data.claimId);
    const changed = data.claimId !== currentToken;
    currentToken = data.claimId;
    currentUrl = url;
    expiresAt = Number(data.expiresAt || Date.now() + EXPIRATION_SECONDS * 1000);

    if (changed) {
      clear(errorSlot);
      clear(qrFrame);
      qrFrame.append(buildQrSvg(currentUrl));
      linkInput.value = currentUrl;
      copyButton.disabled = false;
      body.hidden = false;
    }
    renderCountdown();
    if (reason) {
      statusLine.textContent = reason;
    } else if (changed) {
      statusLine.textContent = t("Shared on Create account. Rotates automatically after every scan.");
    }
    ensureTimers();
    return changed;
  }

  async function pollRelay() {
    if (disposed || pollInFlight || mintInFlight || !currentToken) return;
    pollInFlight = true;
    const ac = new AbortController();
    activePoll = ac;
    try {
      const data = await api.relayInvite({ signal: ac.signal });
      if (disposed) return;
      if (!data?.enabled) {
        cleanup();
        onRelayDisabled?.();
        return;
      }
      if (data.claimId && data.claimId !== currentToken) {
        toast(t("Invite scanned — updated QR."), { tone: "success" });
        applyRelayInvite(data, t("Invite scanned — updated to a fresh QR."));
      }
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      statusLine.textContent = t("Couldn't check relay status — keeping current QR and retrying soon.");
    } finally {
      pollInFlight = false;
      if (activePoll === ac) activePoll = null;
    }
  }

  async function snapshotUsers({ signal } = {}) {
    try {
      const users = await api.users({ signal });
      if (disposed || !Array.isArray(users)) return;
      knownUserIds = new Set(users.map((u) => u?.id).filter((id) => id !== undefined && id !== null));
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      if (error?.status === 403) {
        pollStoppedForScope = true;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        statusLine.textContent = t(
          "Invite ready, but this session lacks users.read scope for automatic refresh. Use New invite manually.",
        );
      }
    }
  }

  async function pollUsers() {
    if (disposed || pollInFlight || mintInFlight || pollStoppedForScope || !currentToken) return;
    pollInFlight = true;
    const ac = new AbortController();
    activePoll = ac;
    try {
      const users = await api.users({ signal: ac.signal });
      if (disposed || !Array.isArray(users)) return;
      const ids = new Set(users.map((u) => u?.id).filter((id) => id !== undefined && id !== null));
      if (knownUserIds === null) {
        knownUserIds = ids;
        return;
      }
      const hasNewUser = [...ids].some((id) => !knownUserIds.has(id));
      knownUserIds = ids;
      if (hasNewUser) {
        toast(t("New account registered — refreshed invite QR."), { tone: "success" });
        await mintInvite(t("New account registered — refreshed invite QR."));
      }
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      if (error?.status === 403) {
        pollStoppedForScope = true;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        statusLine.textContent = t(
          "Auto-refresh paused because users.read scope is missing. Current QR still works.",
        );
      } else {
        statusLine.textContent = t(
          "Couldn't check for new signups — keeping the current QR and retrying soon.",
        );
      }
    } finally {
      pollInFlight = false;
      if (activePoll === ac) activePoll = null;
    }
  }

  async function mintInvite(reason = "", { refreshUsers = false, forceRotate = false } = {}) {
    if (disposed || mintInFlight) return;
    mintInFlight = true;
    newButton.disabled = true;
    newButton.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), t("Minting…"));
    if (!currentToken) {
      statusLine.textContent = relayMode
        ? t("Enabling shared signup QR…")
        : t("Minting a single-use player invite…");
    }

    activeMint?.abort();
    const ac = new AbortController();
    activeMint = ac;

    try {
      if (relayMode) {
        const data = forceRotate
          ? await api.relayRotate({ signal: ac.signal })
          : await api.relaySetEnabled(true, { signal: ac.signal });
        if (disposed) return;
        if (!data?.claimId) {
          throw new Error(t("Signup relay returned no active invite."));
        }
        applyRelayInvite(
          data,
          reason || t("Shared on Create account. Rotates automatically after every scan."),
        );
        return;
      }

      const invite = await api.createInviteLink(
        { role: "user", expiration: EXPIRATION_SECONDS },
        { signal: ac.signal },
      );
      if (disposed) return;
      if (!invite?.token) {
        throw new Error(t("RomM returned an empty invite token."));
      }
      currentToken = invite.token;
      currentUrl = signupInviteUrl(currentToken);
      expiresAt = Date.now() + EXPIRATION_SECONDS * 1000;

      clear(errorSlot);
      clear(qrFrame);
      qrFrame.append(buildQrSvg(currentUrl));
      linkInput.value = currentUrl;
      copyButton.disabled = false;
      body.hidden = false;
      renderCountdown();
      statusLine.textContent = reason || t("Ready to scan. Listening for new signups every 10s.");
      ensureTimers();

      if (refreshUsers || knownUserIds === null) {
        await snapshotUsers({ signal: ac.signal });
      }
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      if (!currentToken) {
        body.hidden = true;
      }
      if (error?.status === 403) {
        stopTimers();
        document.addEventListener("visibilitychange", onVisibility);
        statusLine.textContent = t("Invite creation blocked.");
        showError(
          t("Your session is missing the users.write scope required to mint invite links. Sign out and sign back in as an admin, or check your RomM role."),
        );
      } else {
        statusLine.textContent = t("Couldn't mint a new invite.");
        showError(error?.detail || error?.message || t("Couldn't reach RomM to create an invite link."));
      }
    } finally {
      mintInFlight = false;
      if (activeMint === ac) activeMint = null;
      newButton.disabled = false;
      newButton.replaceChildren(icon("refresh", 16), t("New invite"));
    }
  }

  function onVisibility() {
    if (disposed || document.visibilityState !== "visible" || !currentToken) return;
    if (relayMode) {
      void pollRelay();
      renderCountdown();
      return;
    }
    if (expiresAt > 0 && Date.now() >= expiresAt) {
      void mintInvite(t("Invite expired while away — minted a fresh invite."));
    } else {
      renderCountdown();
    }
  }

  document.addEventListener("visibilitychange", onVisibility);
  if (relayMode && initialState?.enabled && initialState?.claimId) {
    applyRelayInvite(initialState);
  } else {
    void mintInvite("", { refreshUsers: true });
  }

  return { el: root, cleanup };
}

export function signupView(ctx) {
  const session = getSession();
  const root = el("div", { class: "view wrap signup-view" });

  if (!isRoleAdmin(session)) {
    root.append(
      emptyState({
        title: t("Admin access required"),
        note: t("Only RomM admins can open the signup QR panel."),
        action: el("a", { class: "btn btn-primary", href: "#/" }, t("Back to Home")),
      }),
    );
    return { el: root, cleanup() {} };
  }

  const panel = createSignupPanel({
    showClose: true,
    onClose: () => ctx.navigate("/me"),
    onRelayDisabled: () => ctx.navigate("/me"),
  });
  root.append(panel.el);
  return { el: root, cleanup: panel.cleanup };
}
