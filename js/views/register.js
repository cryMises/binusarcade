/* Register view.
 *
 * Creates a real RomM user through POST /api/users/register (invite-only).
 * Supports:
 *   - ?token=<jwt>   direct RomM invite link
 *   - ?claim=<id>    single-use relay claim from a scanned QR
 *   - public #/register when Signup QR panel is enabled on the relay
 */

import { api, hasSignupRelay } from "../api.js";
import { login } from "../auth.js";
import { clear, el, icon, langSwitch } from "../components.js";
import { signupClaimUrl } from "../config.js";
import { t } from "../i18n.js";
import { buildQrSvg, formatCountdown } from "./signup.js";

const RELAY_POLL_MS = 4_000;

function queryParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      token: params.get("token") || "",
      claim: params.get("claim") || "",
    };
  } catch {
    return { token: "", claim: "" };
  }
}

function clearQueryParams() {
  try {
    if (window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}#/register`);
    }
  } catch {
    /* ignore */
  }
}

function errorBox(message) {
  return el("div", { class: "login-error", role: "alert" }, icon("alert", 18), el("span", {}, message));
}

function cardHead(eyebrow) {
  return el("div", { class: "login-card-top" }, el("div", { class: "eyebrow" }, eyebrow), langSwitch());
}

function backLink(label = t("Back to sign in")) {
  return el(
    "button",
    {
      class: "btn btn-ghost register-back",
      type: "button",
      on: { click: () => window.location.assign("./") },
    },
    icon("arrow-left", 18),
    label,
  );
}

function isScopeDenied(error) {
  return error?.status === 403 && /insufficient scope/i.test(error?.detail || "");
}

export function registerView() {
  const { token: initialToken, claim: initialClaim } = queryParams();
  const screen = el("main", { class: "login-screen" });

  let disposed = false;
  let pollTimer = null;
  let tickTimer = null;
  let activeController = null;
  let pollInFlight = false;
  let currentClaimId = "";
  let currentExpiresAt = 0;

  function stopLiveQr() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    activeController?.abort();
    activeController = null;
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function cleanup() {
    disposed = true;
    stopLiveQr();
    screen.remove();
  }

  function renderForm(prefillToken, { fromClaim = false } = {}) {
    stopLiveQr();
    if (disposed) return;

    const username = el("input", {
      class: "input",
      id: "register-username",
      name: "username",
      type: "text",
      autocomplete: "username",
      required: true,
      autocapitalize: "none",
      spellcheck: "false",
    });

    const email = el("input", {
      class: "input",
      id: "register-email",
      name: "email",
      type: "email",
      inputmode: "email",
      autocomplete: "email",
      required: true,
      autocapitalize: "none",
      spellcheck: "false",
    });

    const password = el("input", {
      class: "input",
      id: "register-password",
      name: "password",
      type: "password",
      autocomplete: "new-password",
      required: true,
    });

    const confirm = el("input", {
      class: "input",
      id: "register-confirm",
      name: "confirm",
      type: "password",
      autocomplete: "new-password",
      required: true,
    });

    const tokenInput = el("input", {
      class: "input",
      id: "register-token",
      name: "token",
      type: "text",
      autocomplete: "off",
      autocapitalize: "none",
      spellcheck: "false",
      required: true,
      placeholder: prefillToken ? "" : t("Paste your invite token"),
    });
    if (prefillToken) tokenInput.value = prefillToken;

    const submit = el(
      "button",
      { class: "btn btn-keycap btn-mint", type: "submit" },
      icon("user", 18),
      t("Create account"),
    );

    const errorSlot = el("div", { class: "register-error-slot" });

    const setError = (message) => {
      errorSlot.replaceChildren(message ? errorBox(message) : "");
    };

    const idleButton = () => {
      submit.disabled = false;
      submit.replaceChildren(icon("user", 18), t("Create account"));
    };

    const form = el(
      "form",
      { class: "login-form register-form", novalidate: true },
      el(
        "div",
        { class: "field" },
        el("label", { for: "register-username" }, t("Username")),
        username,
      ),
      el(
        "div",
        { class: "field" },
        el("label", { for: "register-email" }, t("Email")),
        email,
      ),
      el(
        "div",
        { class: "field" },
        el("label", { for: "register-password" }, t("Password")),
        password,
      ),
      el(
        "div",
        { class: "field" },
        el("label", { for: "register-confirm" }, t("Confirm password")),
        confirm,
      ),
      el(
        "div",
        { class: "field" },
        el("label", { for: "register-token" }, t("Invite token")),
        tokenInput,
        el(
          "p",
          { class: "register-hint" },
          fromClaim
            ? t("Single-use invite claimed from QR. Complete your account details below.")
            : prefillToken
              ? t("Filled from your invite link. Edit it if you paste a different token.")
              : t("Registration is invite-only. Ask the RomM admin for an invite code or enable the signup QR."),
        ),
      ),
      errorSlot,
      submit,
    );

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;

      const values = {
        username: username.value.trim(),
        email: email.value.trim(),
        password: password.value,
        token: tokenInput.value.trim(),
      };

      setError("");
      if (!values.username || !values.email || !values.password || !values.token) {
        setError(t("Fill in every field, including the invite token."));
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        setError(t("Enter a valid email address."));
        return;
      }
      if (values.password !== confirm.value) {
        setError(t("Passwords don't match."));
        return;
      }

      submit.disabled = true;
      submit.replaceChildren(
        el("span", { class: "spinner", "aria-hidden": "true" }),
        t("Creating account…"),
      );

      try {
        await api.register(values);
        if (!hasSignupRelay()) {
          void api.relayRegistered(values.token);
        }
      } catch (error) {
        idleButton();
        if (error?.status === 422) {
          setError(error.detail || t("RomM rejected those details. Check every field and try again."));
        } else if (error?.status === 0) {
          setError(t("Can't reach the RomM server. Check your connection and try again."));
        } else {
          setError(error?.detail || error?.message || t("Couldn't create the account. Try again."));
        }
        return;
      }

      try {
        await login(values.username, values.password);
        password.value = "";
        confirm.value = "";
        window.location.hash = "#/";
      } catch (error) {
        if (isScopeDenied(error)) {
          showWaiting();
          return;
        }
        idleButton();
        const message =
          error?.status === 0
            ? t("Account created, but the server couldn't be reached to sign in. Try signing in from the login screen.")
            : error?.detail || error?.message || t("Account created, but sign-in failed.");
        setError(message);
      }
    });

    function showWaiting() {
      password.value = "";
      confirm.value = "";
      document.title = t("Account created · Binus Arcade");

      screen.replaceChildren(
        el(
          "div",
          { class: "login-wrap" },
          el(
            "section",
            { class: "login-card register-waiting" },
            cardHead(t("Account created")),
            el("h2", {}, t("Waiting for activation")),
            el(
              "p",
              { class: "note" },
              t("Your RomM account exists, but it doesn't have access yet. Ask the RomM admin to grant it in the server's user settings, then sign in."),
            ),
            el(
              "p",
              { class: "login-note" },
              t("New accounts start with no permissions until the admin promotes them."),
            ),
            backLink(),
          ),
        ),
      );
    }

    const poster = el(
      "div",
      { class: "login-poster" },
      el("div", { class: "eyebrow" }, t("Join the arcade")),
      el("h1", { class: "hero-title" }, el("span", { class: "marker-line" }, t("Create account"))),
      el(
        "p",
        { class: "note" },
        t("Registration is invite-only. Open the invite link from the RomM admin to fill in your token automatically, or paste a token here."),
      ),
    );

    screen.replaceChildren(
      el(
        "div",
        { class: "login-wrap" },
        poster,
        el(
          "section",
          { class: "login-card" },
          cardHead(t("New player")),
          el("h2", {}, t("Account details")),
          el(
            "p",
            { class: "note" },
            t("Uses the same RomM account you'll sign in with. The password never touches storage."),
          ),
          form,
          el("p", { class: "login-note register-back-row" }, backLink()),
        ),
      ),
    );
  }

  function renderDisabled({ note = "", showRefresh = false } = {}) {
    stopLiveQr();
    if (disposed) return;

    screen.replaceChildren(
      el(
        "div",
        { class: "login-wrap" },
        el(
          "section",
          { class: "login-card register-disabled", "data-register-disabled": "" },
          cardHead(t("Invite required")),
          el("h2", {}, t("Ask the admin for a signup code")),
          el(
            "p",
            { class: "note" },
            note ||
              t("The signup QR panel is currently turned off. Ask the RomM admin to enable it or send you an invite code."),
          ),
          el(
            "div",
            { class: "signup-controls" },
            showRefresh
              ? el(
                  "button",
                  {
                    class: "btn btn-primary",
                    type: "button",
                    "data-refresh-signup": "",
                    on: { click: () => void loadPublicQr() },
                  },
                  icon("refresh", 16),
                  t("Check again"),
                )
              : null,
            el(
              "button",
              {
                class: "btn btn-ghost",
                type: "button",
                "data-enter-token": "",
                on: { click: () => renderForm("") },
              },
              t("I have a signup code"),
            ),
            backLink(),
          ),
        ),
      ),
    );
  }

  async function claimAndOpen(claimId) {
    if (disposed) return;
    stopLiveQr();
    screen.replaceChildren(
      el(
        "div",
        { class: "login-wrap" },
        el(
          "section",
          { class: "login-card" },
          cardHead(t("Invite QR")),
          el("h2", {}, t("Checking invite QR…")),
          el("p", { class: "note" }, t("Claiming your single-use invite token.")),
        ),
      ),
    );

    const ac = new AbortController();
    activeController = ac;
    try {
      const res = await api.relayClaim(claimId, { signal: ac.signal });
      if (disposed) return;
      clearQueryParams();
      if (!res?.token) {
        renderDisabled({
          note: t("No invite token was returned. Ask the admin for a signup code."),
          showRefresh: hasSignupRelay(),
        });
        return;
      }
      renderForm(res.token, { fromClaim: true });
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      clearQueryParams();
      const message =
        error?.status === 403
          ? error.detail || t("The signup QR panel is turned off. Ask the admin for a signup code.")
          : error?.detail || t("This invite QR was already used or expired.");
      screen.replaceChildren(
        el(
          "div",
          { class: "login-wrap" },
          el(
            "section",
            { class: "login-card register-claim-error", "data-claim-error": "" },
            cardHead(t("Invite unavailable")),
            el(
              "h2",
              {},
              error?.status === 403 ? t("Ask the admin for a signup code") : t("QR code already used"),
            ),
            errorBox(message),
            el(
              "div",
              { class: "signup-controls" },
              hasSignupRelay()
                ? el(
                    "button",
                    {
                      class: "btn btn-primary",
                      type: "button",
                      "data-fresh-qr": "",
                      on: { click: () => void loadPublicQr() },
                    },
                    icon("qr", 16),
                    t("Get fresh QR"),
                  )
                : null,
              el(
                "button",
                {
                  class: "btn btn-ghost",
                  type: "button",
                  "data-enter-token": "",
                  on: { click: () => renderForm("") },
                },
                t("I have a signup code"),
              ),
              backLink(),
            ),
          ),
        ),
      );
    }
  }

  function renderPublicQr(initialData) {
    if (disposed) return;
    currentClaimId = initialData.claimId;
    currentExpiresAt = Number(initialData.expiresAt || Date.now() + 3_600_000);

    const countdown = el("span", { class: "signup-timer", "data-public-timer": "" }, "60:00");
    const status = el(
      "p",
      { class: "note signup-status", "data-public-status": "" },
      t("Scan with another phone's camera or tap Use this invite. Updates automatically after each scan."),
    );
    const qrFrame = el("div", { class: "signup-qr-frame", "data-public-qr": "" });
    const useButton = el(
      "button",
      {
        class: "btn btn-primary",
        type: "button",
        "data-claim-here": "",
        on: {
          click: () => {
            if (!currentClaimId) return;
            void claimAndOpen(currentClaimId);
          },
        },
      },
      icon("user", 16),
      t("Use this invite"),
    );

    function drawQr(data) {
      currentClaimId = data.claimId;
      currentExpiresAt = Number(data.expiresAt || Date.now() + 3_600_000);
      const qrUrl = data.qrUrl || signupClaimUrl(currentClaimId);
      clear(qrFrame);
      qrFrame.append(buildQrSvg(qrUrl));
      qrFrame.dataset.claimId = currentClaimId;
      qrFrame.dataset.qrUrl = qrUrl;
      updateTimer();
    }

    function updateTimer() {
      if (disposed || !currentExpiresAt) return;
      const remaining = Math.max(0, Math.ceil((currentExpiresAt - Date.now()) / 1000));
      countdown.textContent = formatCountdown(remaining);
      if (remaining <= 0 && !pollInFlight) {
        void pollPublicQr();
      }
    }

    async function pollPublicQr() {
      if (disposed || pollInFlight || document.visibilityState === "hidden") return;
      pollInFlight = true;
      const ac = new AbortController();
      activeController = ac;
      try {
        const next = await api.relayInvite({ signal: ac.signal });
        if (disposed) return;
        if (!next?.enabled || !next?.claimId) {
          renderDisabled({ showRefresh: true });
          return;
        }
        if (next.claimId !== currentClaimId) {
          drawQr(next);
          status.textContent = t("Previous QR was scanned — updated to a fresh QR.");
        }
      } catch {
        /* Keep current QR on transient poll hiccup. */
      } finally {
        pollInFlight = false;
        if (activeController === ac) activeController = null;
      }
    }

    drawQr(initialData);
    tickTimer = setInterval(updateTimer, 1000);
    pollTimer = setInterval(() => void pollPublicQr(), RELAY_POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);

    screen.replaceChildren(
      el(
        "div",
        { class: "login-wrap" },
        el(
          "section",
          { class: "login-card signup-panel", "data-public-signup": "" },
          el(
            "div",
            { class: "signup-head" },
            el(
              "div",
              {},
              el(
                "div",
                { class: "login-card-top" },
                el("div", { class: "eyebrow" }, t("Create account")),
                langSwitch(),
              ),
              el("h2", {}, t("Scan invite QR")),
            ),
            el("div", { class: "signup-timer-wrap" }, el("span", { class: "note" }, t("Expires in")), countdown),
          ),
          status,
          el("div", { class: "signup-qr-card" }, qrFrame),
          el(
            "div",
            { class: "signup-controls" },
            useButton,
            el(
              "button",
              {
                class: "btn btn-ghost",
                type: "button",
                "data-enter-token": "",
                on: { click: () => renderForm("") },
              },
              t("I have a signup code"),
            ),
            backLink(),
          ),
        ),
      ),
    );
  }

  function onVisibility() {
    if (disposed || document.visibilityState !== "visible") return;
    if (pollTimer) {
      void (async () => {
        try {
          const next = await api.relayInvite();
          if (disposed) return;
          if (!next?.enabled) renderDisabled({ showRefresh: true });
          else if (next.claimId && next.claimId !== currentClaimId) renderPublicQr(next);
        } catch {
          /* ignore */
        }
      })();
    }
  }

  async function loadPublicQr() {
    stopLiveQr();
    if (!hasSignupRelay()) {
      renderDisabled();
      return;
    }
    screen.replaceChildren(
      el(
        "div",
        { class: "login-wrap" },
        el(
          "section",
          { class: "login-card" },
          cardHead(t("Create account")),
          el("h2", {}, t("Checking signup QR…")),
          el("p", { class: "note" }, t("Asking the server if self-serve signup is open.")),
        ),
      ),
    );
    const ac = new AbortController();
    activeController = ac;
    try {
      const data = await api.relayInvite({ signal: ac.signal });
      if (disposed) return;
      if (data?.enabled && data?.claimId) {
        renderPublicQr(data);
      } else {
        renderDisabled({ showRefresh: true });
      }
    } catch (error) {
      if (disposed || error?.name === "AbortError") return;
      renderDisabled({
        note: t("Couldn't reach the signup relay. Ask the admin for a signup code or try again."),
        showRefresh: true,
      });
    }
  }

  if (initialToken) {
    clearQueryParams();
    renderForm(initialToken);
  } else if (initialClaim) {
    clearQueryParams();
    if (hasSignupRelay()) {
      void claimAndOpen(initialClaim);
    } else {
      renderDisabled({
        note: t("Signup relay is not configured on this build. Ask the admin for a direct invite link."),
      });
    }
  } else {
    void loadPublicQr();
  }

  return { el: screen, cleanup };
}
