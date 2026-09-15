/** The grid of the computer keyboard. It maps a physical key code to a row and
 *  a column. */

import type { KeyRows } from "./settings.js";

export interface KeyPosition {
  readonly row: number;
  readonly col: number;
}

/** The column on the centre note. The row numbers increase from the bottom
 *  row. */
export const CENTER_COL = 5;
export const CENTER_ROW = 1;

const CODE_LABELS: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Backslash: "\\",
  IntlBackslash: "\\",
  IntlRo: "ro",
  IntlYen: "¥",
  Enter: "⏎",
  Backspace: "⌫",
  Tab: "⇥",
  Space: "␣"
};

export function buildCodeMap(rows: KeyRows): Map<string, KeyPosition> {
  const map = new Map<string, KeyPosition>();
  rows.forEach((row, rowIndex) => {
    row.forEach((code, col) => {
      if (code) map.set(code, { row: rowIndex, col });
    });
  });
  return map;
}

/** Gives the character that the key produces on the keyboard of this user. The
 *  code knows this character after the user pushes the key one time. */
export function keyLabel(code: string | null, seen: Record<string, string>): string {
  if (!code) return "";
  const observed = seen[code];
  if (observed) return observed.length === 1 ? observed.toUpperCase() : observed;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return CODE_LABELS[code] ?? code;
}
