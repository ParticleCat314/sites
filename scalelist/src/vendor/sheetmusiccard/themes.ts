import type { Theme, ThemeName } from "./types";

const base = {
  fontFamily:
    "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  padding: "20px 24px",
  borderRadius: "14px",
};

export const THEMES: Record<ThemeName, Theme> = {
  paper: {
    ...base,
    background: "#fdfcf8",
    staveColor: "#4a4438",
    noteColor: "#211d15",
    highlightColor: "#c2410c",
    highlightGlow: "rgba(194, 65, 12, 0.35)",
    textColor: "#3d3729",
    shadow: "0 2px 10px rgba(60, 50, 20, 0.12)",
    border: "1px solid #e8e2d2",
  },
  midnight: {
    ...base,
    background: "linear-gradient(160deg, #16182b 0%, #1e2240 100%)",
    staveColor: "#5b628f",
    noteColor: "#e7e9ff",
    highlightColor: "#7dd3fc",
    highlightGlow: "rgba(125, 211, 252, 0.45)",
    textColor: "#c3c8f2",
    shadow: "0 4px 18px rgba(0, 0, 0, 0.45)",
    border: "1px solid #2c3158",
  },
  sepia: {
    ...base,
    background: "#f3e6cf",
    staveColor: "#7a5c3a",
    noteColor: "#43301b",
    highlightColor: "#a4460f",
    highlightGlow: "rgba(164, 70, 15, 0.35)",
    textColor: "#5c4426",
    shadow: "0 2px 8px rgba(90, 60, 20, 0.2)",
    border: "1px solid #dcc7a1",
  },
  mint: {
    ...base,
    background: "#f0faf5",
    staveColor: "#3e6b58",
    noteColor: "#123c2b",
    highlightColor: "#0d9488",
    highlightGlow: "rgba(13, 148, 136, 0.35)",
    textColor: "#1f5240",
    shadow: "0 2px 10px rgba(20, 80, 60, 0.12)",
    border: "1px solid #cdeadd",
  },
};

export function resolveTheme(theme?: ThemeName | Partial<Theme>): Theme {
  if (!theme) return THEMES.paper;
  if (typeof theme === "string") return THEMES[theme] ?? THEMES.paper;
  return { ...THEMES.paper, ...theme };
}
