import { api, hasSignupRelay } from "../api.js";
import {
  clear,
  el,
  emptyState,
  icon,
  loadingLine,
  siteFooter,
  timeAgo,
  toast,
} from "../components.js";
import { t } from "../i18n.js";

const PLATFORMS = [
  ["atari2600", "Atari 2600"],
  ["flash", "Flash"],
  ["gb", "Game Boy"],
  ["gba", "Game Boy Advance"],
  ["gbc", "Game Boy Color"],
  ["genesis", "Genesis / Mega Drive"],
  ["nds", "Nintendo DS"],
  ["nes", "NES"],
  ["psx", "PlayStation"],
  ["psp", "PSP"],
  ["snes", "SNES"],
];

const STATUS_LABELS = {
  open: "Open request",
  planned: "Planned",
  added: "Added",
  denied: "Denied",
};

function platformName(slug) {
  return PLATFORMS.find(([value]) => value === slug)?.[1] || "";
}

export function requestView() {
  const root = el("div", { class: "view wrap request-view" });

  const title = el("input", {
    class: "input",
    type: "text",
    maxlength: "100",
    required: "",
    id: "request-title",
    placeholder: t("Game title"),
    "aria-label": t("Game title"),
  });
  const platform = el(
    "select",
    { class: "input", id: "request-platform", "aria-label": t("Platform") },
    el("option", { value: "" }, t("Any platform")),
    ...PLATFORMS.map(([value, label]) => el("option", { value }, label)),
  );
  const note = el("textarea", {
    class: "input",
    rows: "2",
    maxlength: "200",
    id: "request-note",
    placeholder: t("Why this game? Optional"),
    "aria-label": t("Note"),
  });
  const status = el("p", { class: "field-hint", role: "status" });
  const submit = el(
    "button",
    { class: "btn btn-primary", type: "submit" },
    icon("arrow-right", 16),
    t("Send request"),
  );

  const form = el(
    "form",
    { class: "block request-form", novalidate: "" },
    el(
      "div",
      { class: "request-fields" },
      el(
        "label",
        { class: "field request-field-title", for: "request-title" },
        el("span", { class: "field-label" }, t("Game title")),
        title,
      ),
      el(
        "label",
        { class: "field", for: "request-platform" },
        el("span", { class: "field-label" }, t("Platform (optional)")),
        platform,
      ),
      el(
        "label",
        { class: "field request-field-note", for: "request-note" },
        el("span", { class: "field-label" }, t("Note (optional)")),
        note,
      ),
    ),
    el("div", { class: "request-form-foot" }, status, submit),
  );

  const list = el("section", { class: "request-list", "aria-live": "polite" }, loadingLine(t("Loading requests…")));

  const head = el(
    "header",
    { class: "request-head" },
    el(
      "a",
      { class: "back-link", href: "#/" },
      icon("arrow-left", 17),
      t("Home"),
    ),
    el("p", { class: "eyebrow" }, t("Request box")),
    el("h1", { class: "marker" }, t("Request a game")),
    el(
      "p",
      { class: "note" },
      t("Ask the admin to add a game. Upvote an existing request instead of filing a duplicate."),
    ),
  );

  root.append(head, form, el("div", { class: "section-head" }, el("h2", { class: "marker marker-sm" }, t("Wanted games"))), list, siteFooter());

  const setBusy = (busy) => {
    submit.disabled = busy;
    submit.textContent = busy ? t("Sending…") : t("Send request");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = title.value.trim();
    if (!name) {
      status.textContent = t("Enter a game title.");
      title.focus();
      return;
    }
    setBusy(true);
    status.textContent = "";
    try {
      await api.createRequest({
        title: name,
        platform_slug: platform.value || null,
        note: note.value.trim(),
      });
      title.value = "";
      platform.value = "";
      note.value = "";
      toast(t("Request sent."), { tone: "success" });
      await load();
    } catch (error) {
      status.textContent = error.message || t("Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  });

  const render = (payload) => {
    const rows = Array.isArray(payload?.requests) ? payload.requests : [];
    clear(list);
    if (!rows.length) {
      list.append(
        emptyState({
          title: t("No requests yet"),
          note: t("Be the first to ask for a game."),
        }),
      );
      return;
    }
    rows.forEach((request) => list.append(requestCard(request)));
  };

  async function load() {
    if (!hasSignupRelay()) {
      clear(list);
      list.append(
        emptyState({
          title: t("Request box unavailable"),
          note: t("Couldn't reach the request box. Try again later."),
        }),
      );
      return;
    }
    try {
      render(await api.requests());
    } catch {
      clear(list);
      list.append(
        emptyState({
          title: t("Request box unavailable"),
          note: t("Couldn't reach the request box. Try again later."),
        }),
      );
    }
  }

  void load();
  return root;
}

function requestCard(request) {
  const count = el("span", { class: "request-vote-count" }, String(request.votes || 0));
  const button = el(
    "button",
    {
      class: `request-vote${request.voted ? " is-voted" : ""}`,
      type: "button",
      "aria-pressed": String(Boolean(request.voted)),
      "aria-label": t("Vote for {title}", { title: request.title }),
      title: t("One vote per person. Tap again to remove your vote."),
      on: {
        click: async () => {
          button.disabled = true;
          try {
            const result = await api.voteRequest(request.id);
            count.textContent = String(result.votes);
            button.classList.toggle("is-voted", Boolean(result.voted));
            button.setAttribute("aria-pressed", String(Boolean(result.voted)));
            request.votes = result.votes;
            request.voted = result.voted;
          } catch (error) {
            toast(error.message || t("Couldn't save your vote."), { tone: "error" });
          } finally {
            button.disabled = false;
          }
        },
      },
    },
    el("span", { class: "request-vote-plus" }, "+1"),
    count,
  );

  return el(
    "article",
    { class: "request-card", dataset: { status: request.status } },
    el(
      "div",
      { class: "request-card-main" },
      el(
        "div",
        { class: "request-card-title" },
        el("h3", {}, request.title),
        el("span", { class: `chip-cat request-status status-${request.status}` }, t(STATUS_LABELS[request.status] || "Open request")),
      ),
      el(
        "p",
        { class: "request-meta" },
        [
          request.platform_slug ? platformName(request.platform_slug) : null,
          request.requester ? t("Requested by {name}", { name: request.requester }) : null,
          request.created_at ? timeAgo(request.created_at) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
      request.note ? el("p", { class: "request-note" }, request.note) : null,
    ),
    button,
  );
}
