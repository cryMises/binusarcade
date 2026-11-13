/* Register view.
 *
 * Creates a real RomM user through POST /api/users/register (invite-only).
 * The invite token comes from the real URL query (?token=...), not the hash.
 * A new account lands in a deny-by-default permission group, so auto-login may
 * answer 403 "Insufficient scope"; that is shown as a waiting-for-activation
 * state, never as a raw error.
 */

import { api } from "../api.js";
import { login } from "../auth.js";
import { el, icon } from "../components.js";

function queryToken() {
  try {
    return new URLSearchParams(window.location.search).get("token") || "";
  } catch {
    return "";
  }
}

function errorBox(message) {
  return el("div", { class: "login-error", role: "alert" }, icon("alert", 18), el("span", {}, message));
}

function backLink(label = "Back to sign in") {
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
  const token = queryToken();
  const screen = el("main", { class: "login-screen" });

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
    placeholder: token ? "" : "Paste your invite token",
  });
  if (token) tokenInput.value = token;

  const submit = el(
    "button",
    { class: "btn btn-keycap btn-mint", type: "submit" },
    icon("user", 18),
    "Create account",
  );

  const errorSlot = el("div", { class: "register-error-slot" });

  const setError = (message) => {
    errorSlot.replaceChildren(message ? errorBox(message) : "");
  };

  const idleButton = () => {
    submit.disabled = false;
    submit.replaceChildren(icon("user", 18), "Create account");
  };

  const form = el(
    "form",
    { class: "login-form register-form", novalidate: true },
    el(
      "div",
      { class: "field" },
      el("label", { for: "register-username" }, "Username"),
      username,
    ),
    el(
      "div",
      { class: "field" },
      el("label", { for: "register-email" }, "Email"),
      email,
    ),
    el(
      "div",
      { class: "field" },
      el("label", { for: "register-password" }, "Password"),
      password,
    ),
    el(
      "div",
      { class: "field" },
      el("label", { for: "register-confirm" }, "Confirm password"),
      confirm,
    ),
    el(
      "div",
      { class: "field" },
      el("label", { for: "register-token" }, "Invite token"),
      tokenInput,
      el(
        "p",
        { class: "register-hint" },
        token
          ? "Filled from your invite link. Edit it if you paste a different token."
          : "Registration is invite-only. Ask the RomM admin for an invite link, then paste its token here.",
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
      setError("Fill in every field, including the invite token.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (values.password !== confirm.value) {
      setError("Passwords don't match.");
      return;
    }

    submit.disabled = true;
    submit.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), "Creating account…");

    try {
      await api.register(values);
    } catch (error) {
      idleButton();
      if (error?.status === 422) {
        setError(error.detail || "RomM rejected those details. Check every field and try again.");
      } else if (error?.status === 0) {
        setError("Can't reach the RomM server. Check your connection and try again.");
      } else {
        setError(error?.detail || error?.message || "Couldn't create the account. Try again.");
      }
      return;
    }

    /* Account exists now. Try to sign in with the same credentials. */
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
          ? "Account created, but the server couldn't be reached to sign in. Try signing in from the login screen."
          : error?.detail || error?.message || "Account created, but sign-in failed.";
      setError(message);
    }
  });

  function showWaiting() {
    password.value = "";
    confirm.value = "";
    document.title = "Account created · Binus Arcade";

    screen.replaceChildren(
      el(
        "div",
        { class: "login-wrap" },
        el(
          "section",
          { class: "login-card register-waiting" },
          el("div", { class: "eyebrow" }, "Account created"),
          el("h2", {}, "Waiting for activation"),
          el(
            "p",
            { class: "note" },
            "Your RomM account exists, but it doesn't have access yet. Ask the RomM admin to grant it in the server's user settings, then sign in.",
          ),
          el(
            "p",
            { class: "login-note" },
            "New accounts start with no permissions until the admin promotes them.",
          ),
          backLink(),
        ),
      ),
    );
  }

  const poster = el(
    "div",
    { class: "login-poster" },
    el("div", { class: "eyebrow" }, "Join the arcade"),
    el("h1", { class: "hero-title" }, el("span", { class: "marker-line" }, "Create account")),
    el(
      "p",
      { class: "note" },
      "Registration is invite-only. Open the invite link from the RomM admin to fill in your token automatically, or paste a token here.",
    ),
  );

  screen.append(
    el(
      "div",
      { class: "login-wrap" },
      poster,
      el(
        "section",
        { class: "login-card" },
        el("div", { class: "eyebrow" }, "New player"),
        el("h2", {}, "Create your account"),
        el(
          "p",
          { class: "note" },
          "Uses the same RomM account you'll sign in with. The password never touches storage.",
        ),
        form,
        el(
          "p",
          { class: "login-note register-back-row" },
          backLink(),
        ),
      ),
    ),
  );

  return { el: screen, cleanup: () => screen.remove() };
}
