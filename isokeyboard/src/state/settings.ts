/** The data that the app stores. This module also loads that data, examines it
 *  for errors, and moves data from an older version. */

import type { BandMode } from "../core/lattice.js";
import { LAYOUTS } from "../core/layouts.js";
import { nearestNoteCount } from "../core/mos.js";
import { DEFAULT_ODD_LIMIT, ODD_LIMITS } from "../core/ratios.js";
import { SCALES } from "../core/scales.js";
import {
  centsAt,
  clampDivisions,
  convertDegree,
  degreeOf,
  equalSpec,
  makeTuning,
  mod,
  nearestStep,
  registerOf,
  stepFor,
  type TuningSpec
} from "../core/tuning.js";

export type LabelMode = "names" | "degrees" | "cents" | "ratios" | "hz" | "off";
export type VoiceId = "piano" | "warm" | "glass" | "pure";
export type OutOfScaleMode = "silent" | "quiet";
/**
 * The method that a MIDI note number uses to select a step.
 *  - `linear`: one key gives one step. All degrees of the tuning are
 *    available, but one octave on the controller is not one octave.
 *  - `pitch`:  the step nearest to the 12-TET pitch of the note. A piano
 *    continues to sound like a piano, but the degrees between are not
 *    available.
 *  - `scale`:  the subsequent degrees of the active scale.
 */
export type MidiMode = "linear" | "pitch" | "scale";
/** The function of the space bar. The user holds it like a pedal, or pushes it
 *  one time to latch it. */
export type SustainMode = "hold" | "toggle";
/**
 * The notes that the repeated bands of the grid play.
 *  - `repeat`:  the same note again, as the geometry gives it.
 *  - `octave`:  the same layout one period above or below for each band. This
 *               increases the range of the board. It does not change a scale
 *               degree, thus each note stays diatonic.
 *  - `fill`:    the notes that the stride of the layout does not reach, if the
 *               layout does not reach all notes.
 */
export type DuplicateMode = BandMode;

export const MAP_ROWS = 5;
export const MAP_COLS = 14;

export type KeyRows = (string | null)[][];

/**
 * The physical key positions, as `KeyboardEvent.code` values. Thus QWERTY,
 * AZERTY and Dvorak keyboards all operate correctly.
 *
 * The columns go from left to right across one row of the keyboard. The
 * columns after the first twelve contain Enter, Backslash, Backspace and the
 * function row. These keys reach the instrument only while key capture is on.
 * If key capture is off, the browser uses these keys.
 */
export const DEFAULT_ROWS: KeyRows = [
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", "IntlRo", null, null, null],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", "Enter", null, null],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash", null],
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", "Backspace", null],
  ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", null, null]
];

export interface Settings {
  tuning: TuningSpec;
  aHz: number;
  layout: string;
  centerRegister: number;
  centerDegree: number;
  scale: string;
  /** The code ignores this value while `rootFollowsCenter` is true. */
  scaleRoot: number;
  /** Puts the root of the scale on the centre note. The grid and the scale
   *  then agree. */
  rootFollowsCenter: boolean;
  /** The code uses this value when `scale` is the MOS entry. */
  mosGenerator: number;
  mosNotes: number;
  /** The rotation of the generator chain. Mode 0 is the brightest mode. */
  mosMode: number;
  sustainMode: SustainMode;
  outOfScale: OutOfScaleMode;
  /** Makes each copy of a note outside the main area grey. The copies continue
   *  to play. */
  dimDuplicates: boolean;
  /** An advanced setting. It gives a function to the repeated bands. */
  duplicateMode: DuplicateMode;
  labels: LabelMode;
  /** The odd limit for the just-ratio labels and the interval display. */
  jiLimit: number;
  glow: number;
  volume: number;
  voice: VoiceId;
  midiMode: MidiMode;
  /** Plays each MIDI note at the velocity that the controller sends. */
  midiVelocity: boolean;
  /** Requests MIDI access at load. The user does not push the button. */
  midiAutoConnect: boolean;
  rows: KeyRows;
  /** Maps a key code to the character that the physical keyboard of the user
   *  produces. The editor shows these characters. */
  keyLabels: Record<string, string>;
}

export function defaultSettings(): Settings {
  return {
    tuning: equalSpec(12),
    aHz: 440,
    layout: "wicki",
    centerRegister: 4,
    centerDegree: 2,
    scale: "chromatic",
    scaleRoot: 0,
    rootFollowsCenter: true,
    mosGenerator: 7,
    mosNotes: 7,
    mosMode: 1, // Fifths, seven notes, one generator down. This is the major scale.
    sustainMode: "hold",
    outOfScale: "silent",
    dimDuplicates: false,
    duplicateMode: "repeat",
    labels: "names",
    jiLimit: DEFAULT_ODD_LIMIT,
    glow: 1,
    volume: 0.7,
    voice: "piano",
    midiMode: "linear",
    midiVelocity: true,
    midiAutoConnect: false,
    rows: DEFAULT_ROWS.map((row) => row.slice()),
    keyLabels: {}
  };
}

const STORE_KEY = "hexatone-settings-v3";
const LEGACY_KEY = "hexatone-settings-v2";

export interface LoadResult {
  settings: Settings;
  storageAvailable: boolean;
}

export function loadSettings(): LoadResult {
  const settings = defaultSettings();
  let storageAvailable = false;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    storageAvailable = true;
  } catch {
    return { settings, storageAvailable };
  }
  if (raw) {
    try {
      merge(settings, JSON.parse(raw) as Partial<Settings> & LegacyFields);
    } catch {
      /* The stored entry has an error. Keep the default settings. */
    }
  }
  return { settings, storageAvailable };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* The browser is in private mode, or the quota is full. The settings then
       stay available for this session only. */
  }
}

/**
 * Changes the tuning. The code recalculates each value that the settings hold
 * as a degree. Thus the centre note, the scale root and the MOS generator keep
 * approximately the same pitch.
 */
export function retune(settings: Settings, spec: TuningSpec): void {
  const fromTuning = makeTuning(settings.tuning);
  const toTuning = makeTuning(spec);
  const from = fromTuning.size;
  const to = toTuning.size;

  // The centre of the grid keeps its pitch. It does not keep its register and
  // its degree. If it kept the register, register 4 of a tuning that repeats
  // at 3/1 would be two octaves too high.
  const centerCents = centsAt(fromTuning, stepFor(fromTuning, settings.centerRegister, settings.centerDegree));
  const center = nearestStep(toTuning, centerCents);
  settings.tuning = spec;
  settings.centerRegister = Math.min(8, Math.max(-1, registerOf(toTuning, center)));
  settings.centerDegree = degreeOf(toTuning, center);

  if (from === to) return;
  settings.scaleRoot = convertDegree(from, to, settings.scaleRoot);
  const generator = Math.max(1, Math.min(Math.floor(to / 2), Math.round((settings.mosGenerator * to) / from)));
  settings.mosGenerator = generator;
  settings.mosNotes = nearestNoteCount(to, generator, settings.mosNotes);
  settings.mosMode = Math.min(settings.mosMode, settings.mosNotes - 1);
}

/** The fields that older versions wrote. The loader continues to accept
 *  these. */
interface LegacyFields {
  divisions?: number;
  centerOctave?: number;
}

/** Applies a set of examined values to the active settings. The storage and
 *  the shared links both use this function. */
export function mergeSettings(target: Settings, stored: Partial<Settings> & LegacyFields): void {
  merge(target, stored);
}

function merge(target: Settings, stored: Partial<Settings> & LegacyFields): void {
  if (isTuningSpec(stored.tuning)) target.tuning = stored.tuning;
  else if (typeof stored.divisions === "number") target.tuning = equalSpec(clampDivisions(stored.divisions));
  const size = makeTuning(target.tuning).size;

  if (typeof stored.aHz === "number") target.aHz = clamp(stored.aHz, 380, 500);
  if (LAYOUTS.some((layout) => layout.id === stored.layout)) target.layout = stored.layout as string;

  const register = stored.centerRegister ?? stored.centerOctave;
  if (typeof register === "number") target.centerRegister = clamp(Math.round(register), -1, 8);
  if (typeof stored.centerDegree === "number") target.centerDegree = mod(Math.round(stored.centerDegree), size);

  if (SCALES.some((scale) => scale.id === stored.scale)) target.scale = stored.scale as string;
  if (typeof stored.scaleRoot === "number") target.scaleRoot = mod(Math.round(stored.scaleRoot), size);
  if (typeof stored.rootFollowsCenter === "boolean") target.rootFollowsCenter = stored.rootFollowsCenter;
  if (typeof stored.mosGenerator === "number") {
    target.mosGenerator = clamp(Math.round(stored.mosGenerator), 1, Math.max(1, Math.floor(size / 2)));
  }
  if (typeof stored.mosNotes === "number") {
    target.mosNotes = nearestNoteCount(size, target.mosGenerator, Math.round(stored.mosNotes));
  }
  if (typeof stored.mosMode === "number") {
    target.mosMode = clamp(Math.round(stored.mosMode), 0, target.mosNotes - 1);
  }

  if (stored.sustainMode === "hold" || stored.sustainMode === "toggle") target.sustainMode = stored.sustainMode;
  if (stored.outOfScale === "silent" || stored.outOfScale === "quiet") target.outOfScale = stored.outOfScale;
  if (typeof stored.dimDuplicates === "boolean") target.dimDuplicates = stored.dimDuplicates;
  if (stored.duplicateMode === "repeat" || stored.duplicateMode === "octave" || stored.duplicateMode === "fill") {
    target.duplicateMode = stored.duplicateMode;
  } else if (typeof (stored as { reallocateDuplicates?: unknown }).reallocateDuplicates === "boolean") {
    // In an older version this setting was a boolean. A value of true had the
    // same function as the `fill` mode.
    target.duplicateMode = (stored as { reallocateDuplicates?: boolean }).reallocateDuplicates ? "fill" : "repeat";
  }
  if (isLabelMode(stored.labels)) target.labels = stored.labels;
  if (typeof stored.jiLimit === "number" && ODD_LIMITS.includes(stored.jiLimit as never)) target.jiLimit = stored.jiLimit;
  if (typeof stored.glow === "number") target.glow = clamp(stored.glow, 0, 1.5);
  if (typeof stored.volume === "number") target.volume = clamp(stored.volume, 0, 1);
  if (isVoice(stored.voice)) target.voice = stored.voice;
  if (stored.midiMode === "linear" || stored.midiMode === "pitch" || stored.midiMode === "scale") {
    target.midiMode = stored.midiMode;
  }
  if (typeof stored.midiVelocity === "boolean") target.midiVelocity = stored.midiVelocity;
  if (typeof stored.midiAutoConnect === "boolean") target.midiAutoConnect = stored.midiAutoConnect;
  if (Array.isArray(stored.rows)) target.rows = migrateRows(stored.rows);
  if (stored.keyLabels && typeof stored.keyLabels === "object") {
    for (const [code, label] of Object.entries(stored.keyLabels)) {
      if (typeof label === "string") target.keyLabels[code] = label;
    }
  }
}

function isTuningSpec(value: unknown): value is TuningSpec {
  if (!value || typeof value !== "object") return false;
  const spec = value as Partial<TuningSpec> & { periodCents?: unknown };
  if (typeof spec.periodCents !== "number" || !(spec.periodCents > 0)) return false;
  if (spec.kind === "equal") return typeof spec.divisions === "number" && spec.divisions >= 2;
  if (spec.kind === "scale") return Array.isArray(spec.cents) && spec.cents.every((c) => typeof c === "number");
  return false;
}

function clamp(value: number, lo: number, hi: number): number {
  return Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : lo;
}

function isLabelMode(value: unknown): value is LabelMode {
  return (
    value === "names" || value === "degrees" || value === "cents" ||
    value === "ratios" || value === "hz" || value === "off"
  );
}

function isVoice(value: unknown): value is VoiceId {
  return value === "piano" || value === "warm" || value === "glass" || value === "pure";
}

/**
 * Adjusts a stored key mapping to the current grid.
 *
 * Older versions stored 4 rows of 12 cells. Each assignment in a stored
 * mapping keeps its exact position.
 *
 * A cell that is empty in the stored mapping takes the current default value.
 * Thus an upgrade gives the new keys to the user. But the code also fills a
 * cell that the user cleared. To clear that cell again, push Backspace one
 * time.
 *
 * The code does not apply a default value if the mapping already contains that
 * key code. A key code can have one position only.
 */
export function migrateRows(stored: unknown[]): KeyRows {
  const claimed = new Set<string>();
  for (const row of stored) {
    if (!Array.isArray(row)) continue;
    for (const code of row) if (typeof code === "string") claimed.add(code);
  }

  return DEFAULT_ROWS.map((defaults, rowIndex) => {
    const storedRow: unknown[] = Array.isArray(stored[rowIndex]) ? (stored[rowIndex] as unknown[]) : [];
    return defaults.map((fallback, col) => {
      const code = storedRow[col];
      if (typeof code === "string") return code;
      return fallback && !claimed.has(fallback) ? fallback : null;
    });
  });
}
