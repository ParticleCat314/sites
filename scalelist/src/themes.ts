/** Theme switcher. Palettes live in styles.css under [data-theme=…]. */

export interface Theme {
  id: string;
  label: string;
}

export const THEMES: Theme[] = [
  { id: "paper", label: "Paper" },
  { id: "glacier", label: "Glacier" },
  { id: "sepia", label: "Sepia" },
  { id: "forest", label: "Forest" },
  { id: "brass", label: "Brass" },
  { id: "riviera", label: "Riviera" },
  { id: "midnight", label: "Midnight" },
  { id: "nocturne", label: "Nocturne" },
  { id: "synthwave", label: "Synthwave" },
  { id: "rosewood", label: "Rosewood" },
  { id: "scriabin", label: "Scriabin" },
];

const STORAGE_KEY = "scale-compendium-theme";

/** First-visit default follows the OS light/dark preference. */
export function defaultThemeId(): string {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "midnight" : "paper";
}

export function applyTheme(id: string): void {
  const changed = document.documentElement.dataset.theme !== id;
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // private mode etc. — theme still applies for this visit
  }
  if (changed) document.dispatchEvent(new CustomEvent("themechange"));
}

/** `preferred` (e.g. from the URL) wins over the saved choice when valid. */
export function initThemePicker(container: HTMLElement, preferred?: string | null): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  const valid = (id: string | null | undefined) => THEMES.some((t) => t.id === id);
  const initial = valid(preferred) ? preferred! : valid(saved) ? saved! : defaultThemeId();

  const label = document.createElement("span");
  label.className = "lbl";
  label.id = "themelbl";
  label.textContent = "Theme";

  const select = document.createElement("select");
  select.id = "theme";
  select.setAttribute("aria-labelledby", "themelbl");
  for (const theme of THEMES) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.label;
    select.appendChild(option);
  }
  select.value = initial;
  select.addEventListener("change", () => applyTheme(select.value));

  container.append(label, select);
  applyTheme(initial);
}
