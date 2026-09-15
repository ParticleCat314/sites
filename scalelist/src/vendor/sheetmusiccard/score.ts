import type { NoteEvent, NoteInput, ScoreInput, ScoreObject } from "./types";

/** Beats (quarter notes) per VexFlow duration code. */
const DURATION_BEATS: Record<string, number> = {
  w: 4,
  h: 2,
  q: 1,
  "8": 0.5,
  "16": 0.25,
  "32": 0.125,
};

const STEP_SEMITONES: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

const ACCIDENTAL_OFFSETS: Record<string, number> = {
  "#": 1,
  "##": 2,
  b: -1,
  bb: -2,
  n: 0,
  "": 0,
};

/** Convert a VexFlow key like "c#/4" or "eb/5" to a MIDI note number. */
export function keyToMidi(key: string): number {
  const match = /^([a-g])(#{1,2}|b{1,2}|n)?\/(-?\d+)$/i.exec(key.trim());
  if (!match) throw new Error(`sheetmusiccard: invalid note key "${key}"`);
  const [, step, accidental = "", octave] = match;
  return (
    12 * (Number(octave) + 1) +
    STEP_SEMITONES[step!.toLowerCase()]! +
    ACCIDENTAL_OFFSETS[accidental.toLowerCase()]!
  );
}

export function durationToBeats(duration: string, dotted: boolean): number {
  const beats = DURATION_BEATS[duration.replace(/[dr]/g, "")];
  if (beats === undefined) {
    throw new Error(`sheetmusiccard: unsupported duration "${duration}"`);
  }
  return dotted ? beats * 1.5 : beats;
}

/**
 * Parse a minimal EasyScore-style string, e.g. "C4/q, D4, E4/h, B4/q/r"
 * or chords "(C4 E4 G4)/h", into NoteInput objects. Duration carries over
 * to subsequent notes when omitted. A trailing "/r" marks a rest, a
 * trailing "." (in the duration) marks a dotted note.
 */
export function parseEasyScore(source: string): NoteInput[] {
  const tokens = source
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const notes: NoteInput[] = [];
  let currentDuration = "q";

  for (const token of tokens) {
    const chordMatch = /^\(([^)]+)\)(.*)$/.exec(token);
    let pitchPart: string;
    let rest = "";
    if (chordMatch) {
      pitchPart = chordMatch[1]!;
      rest = chordMatch[2]!;
    } else {
      const slash = token.indexOf("/");
      pitchPart = slash === -1 ? token : token.slice(0, slash);
      rest = slash === -1 ? "" : token.slice(slash);
    }

    const modifiers = rest.split("/").map((m) => m.trim()).filter(Boolean);
    let dotted = false;
    let isRest = false;
    for (const mod of modifiers) {
      if (mod === "r") {
        isRest = true;
      } else {
        dotted = mod.endsWith(".");
        currentDuration = dotted ? mod.slice(0, -1) : mod;
      }
    }

    const keys = pitchPart.split(/\s+/).map(easyPitchToKey);
    notes.push({ keys, duration: currentDuration, dotted, rest: isRest });
  }
  return notes;
}

/** "C#4" -> "c#/4" */
function easyPitchToKey(pitch: string): string {
  const match = /^([A-Ga-g])(#{1,2}|b{1,2}|n)?(-?\d+)$/.exec(pitch.trim());
  if (!match) throw new Error(`sheetmusiccard: invalid pitch "${pitch}"`);
  const [, step, accidental = "", octave] = match;
  return `${step!.toLowerCase()}${accidental}/${octave}`;
}

export function normalizeScore(input: ScoreInput): ScoreObject {
  if (typeof input === "string") {
    return { notes: parseEasyScore(input) };
  }
  return input;
}

/** Flatten a score into timed events for playback/highlighting. */
export function scoreToEvents(score: ScoreObject): NoteEvent[] {
  const events: NoteEvent[] = [];
  let cursor = 0;
  for (const note of score.notes) {
    const durationBeats = durationToBeats(note.duration, !!note.dotted);
    events.push({
      midi: note.rest ? [] : note.keys.map(keyToMidi),
      startBeats: cursor,
      durationBeats,
      rest: !!note.rest,
    });
    cursor += durationBeats;
  }
  return events;
}
