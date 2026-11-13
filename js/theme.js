import { STORAGE } from "./config.js";

const media = () => window.matchMedia?.("(prefers-color-scheme: dark)");
let bound = false;

export function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE.theme);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme() {
  return media()?.matches ? "dark" : "light";
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", "#2a0145");

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const dark = next === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    button.title = button.getAttribute("aria-label");
    const sun = button.querySelector("[data-icon-sun]");
    const moon = button.querySelector("[data-icon-moon]");
    if (sun) sun.hidden = !dark;
    if (moon) moon.hidden = dark;
  });

  return next;
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(STORAGE.theme, next);
  } catch {
    /* ignore */
  }
  return applyTheme(next);
}

export function initTheme() {
  applyTheme(currentTheme());
  if (bound) return;
  bound = true;

  const query = media();
  query?.addEventListener?.("change", () => {
    if (!storedTheme()) applyTheme(systemTheme());
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-theme-toggle]");
    if (!button) return;
    event.preventDefault();
    toggleTheme();
  });
}
