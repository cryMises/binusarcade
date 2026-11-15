import { el, siteFooter } from "../components.js";
import { t } from "../i18n.js";

function section(title, ...children) {
  return el("section", { class: "privacy-section" }, el("h2", { class: "marker marker-sm" }, title), ...children);
}

function note(text) {
  return el("p", { class: "note" }, text);
}

function storageRow(key, text) {
  return el("li", {}, el("code", { class: "privacy-key" }, key), el("span", {}, text));
}

function bullet(text) {
  return el("li", {}, text);
}

export function privacyView() {
  const root = el("div", { class: "view wrap privacy-view" });

  root.append(
    el(
      "header",
      { class: "privacy-head" },
      el("p", { class: "eyebrow" }, t("About this site")),
      el("h1", { class: "marker" }, t("Privacy and data")),
      note(t("What this site keeps, where it goes, and how to remove it.")),
    ),

    section(
      t("Saved in this browser"),
      note(t("These keys sit in localStorage or sessionStorage on your device. None of them are cookies.")),
      el(
        "ul",
        { class: "privacy-list" },
        storageRow(
          "binusarcade.session",
          t("Your RomM access token. localStorage when stay signed in is on, sessionStorage otherwise."),
        ),
        storageRow("binusarcade.remember", t("Whether stay signed in is on.")),
        storageRow("binusarcade.theme", t("Light or dark mode.")),
        storageRow("binusarcade.lang", t("The language you picked.")),
        storageRow("binusarcade.device", t("A device label used when listing your saves.")),
        storageRow("binusarcade.reports-seen", t("Ticket ids you already opened, so the reply badge clears.")),
      ),
      note(t("Your RomM password is never stored. Signing out deletes the token.")),
    ),

    section(
      t("Sent to your RomM server"),
      note(
        t(
          "Signing in, browsing, and reading saves talk to the RomM server that hosts this library. Your player name and your saves stay on that server.",
        ),
      ),
    ),

    section(
      t("Sent to the relay"),
      note(
        t(
          "Broken-game reports, game requests, votes, and admin notes are stored on the self-hosted relay Worker so the admin can read them. Your RomM player name is attached so the admin can follow up.",
        ),
      ),
      note(
        t(
          "Tickets and requests are plain database rows with no retention timer. Ask the admin to delete anything you want gone.",
        ),
      ),
    ),

    section(
      t("Not collected"),
      el(
        "ul",
        { class: "privacy-list privacy-list-plain" },
        bullet(t("No analytics, ads, or third-party trackers.")),
        bullet(t("No tracking cookies. The site sets no cookies at all.")),
        bullet(t("Game files never pass through this site. The player fetches them from your RomM server.")),
      ),
    ),

    section(
      t("Removing your data"),
      el(
        "ul",
        { class: "privacy-list privacy-list-plain" },
        bullet(t("Sign out from your account page to delete the stored token.")),
        bullet(t("Delete your own tickets from your account page, one at a time.")),
        bullet(t("Clear site data in your browser settings to drop the theme, language, and device keys.")),
        bullet(t("Ask the RomM admin to remove reports, requests, or notes from the relay.")),
      ),
    ),

    siteFooter(),
  );

  return root;
}
