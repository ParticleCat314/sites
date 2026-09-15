/**
 * Note-spelling and transposition helpers.
 *
 * Notes are plain strings like "C", "F#", "Bb", "Bbb". All scales in the data
 * set are spelled with tonic C; other tonics are derived by letter-true
 * transposition so accidentals stay correctly spelled.
 */

export type NoteName = string;

export interface ParsedNote {
  letter: string;
  /** "", "#", "##", "b" or "bb" */
  accidental: string;
  /** semitone offset of the accidental: # = +1, b = -1 */
  offset: number;
  /** pitch class 0-11, C = 0 */
  pitchClass: number;
}

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

export const LETTER_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

export function parseNote(note: NoteName): ParsedNote {
  const letter = note[0]!;
  const accidental = note.slice(1);
  let offset = 0;
  for (const ch of accidental) offset += ch === "#" ? 1 : -1;
  const base = LETTER_SEMITONES[letter]!;
  return {
    letter,
    accidental,
    offset,
    pitchClass: ((base + offset) % 12 + 12) % 12,
  };
}

/** Letter-true transposition of the canonical C spelling to another root. */
export function transpose(notes: NoteName[], root: NoteName): NoteName[] {
  if (root === "C") return notes;
  const r = parseNote(root);
  const rootLetterIndex = LETTERS.indexOf(r.letter as typeof LETTERS[number]);
  return notes.map((note) => {
    const p = parseNote(note);
    const letterIndex = LETTERS.indexOf(p.letter as typeof LETTERS[number]);
    const newLetter = LETTERS[(rootLetterIndex + letterIndex) % 7]!;
    const targetPc = (r.pitchClass + p.pitchClass) % 12;
    let diff = targetPc - LETTER_SEMITONES[newLetter]!;
    while (diff > 6) diff -= 12;
    while (diff < -6) diff += 12;
    return newLetter + (diff > 0 ? "#".repeat(diff) : "b".repeat(-diff));
  });
}

/** "Bbb" -> "B𝄫", "F#" -> "F♯" … for display. Handles any accidental count. */
export function prettyNote(note: NoteName): string {
  return (
    note[0]! +
    note.slice(1)
      .replace(/##/g, "𝄪")
      .replace(/bb/g, "𝄫")
      .replace(/#/g, "♯")
      .replace(/b/g, "♭")
  );
}

/** The fifteen standard major key signatures, from 7 sharps to 7 flats. */
const MAJOR_KEY_ROOTS = [
  "C", "G", "D", "A", "E", "B", "F#", "C#",
  "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
];
const C_MAJOR: NoteName[] = ["C", "D", "E", "F", "G", "A", "B"];
let majorKeySpellings: Map<string, string> | undefined;

/**
 * The major key whose scale is exactly this 7-note spelling (in any rotation),
 * or null. Lets diatonic modes render with a key signature instead of
 * per-note accidentals.
 */
export function majorKeyOf(notes: NoteName[]): string | null {
  if (notes.length !== 7) return null;
  if (!majorKeySpellings) {
    majorKeySpellings = new Map(
      MAJOR_KEY_ROOTS.map((root) => [[...transpose(C_MAJOR, root)].sort().join(" "), root])
    );
  }
  return majorKeySpellings.get([...notes].sort().join(" ")) ?? null;
}

/** Degree formula relative to major, e.g. "1 2 ♭3 4 5 ♭6 ♭7". Uses the canonical C spelling. */
export function degreeFormula(notes: NoteName[]): string {
  return notes
    .map((note) => {
      const p = parseNote(note);
      const degree = LETTERS.indexOf(p.letter as typeof LETTERS[number]) + 1;
      const mark = p.accidental.replace(/#/g, "♯").replace(/b/g, "♭");
      return mark + degree;
    })
    .join(" ");
}

/** Successive steps in semitones, closing back to the octave: "2–2–1–2–2–2–1". */
export function intervalPattern(notes: NoteName[]): string {
  const pcs = notes.map((n) => parseNote(n).pitchClass);
  pcs.push(12); // upper tonic
  const steps: number[] = [];
  for (let i = 1; i < pcs.length; i++) {
    let d = pcs[i]! - pcs[i - 1]!;
    if (d <= 0) d += 12;
    steps.push(d);
  }
  return steps.join("–");
}

export interface DiatonicChord {
  /** Roman numeral with quality case/marks, e.g. "ii", "♭III", "vii°". */
  roman: string;
  /** Chord symbol, e.g. "Dm7". */
  symbol: string;
  /** Spelled chord tones, e.g. ["D", "F", "A", "C"]. */
  notes: NoteName[];
  /** MIDI numbers for playback, voiced upward from octave 4. */
  midis: number[];
}

const TRIADS: Record<string, string> = {
  "4,7": "", "3,7": "m", "3,6": "°", "4,8": "+",
};
const SEVENTHS: Record<string, string> = {
  "4,7,11": "maj7", "4,7,10": "7", "3,7,10": "m7", "3,7,11": "m(maj7)",
  "3,6,10": "m7♭5", "3,6,9": "°7", "4,8,11": "maj7♯5", "4,8,10": "7♯5",
  "4,6,10": "7♭5", "4,6,11": "maj7♭5",
};
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * Seventh chords built by stacking scale thirds on each degree. Only defined
 * for 7-note scales with one note per letter; falls back to the plain triad
 * when the seventh combination has no standard name, and skips degrees whose
 * triad is unnameable (rare, e.g. one degree of the double harmonic scale).
 */
export function diatonicChords(
  /** Canonical C spelling — supplies the degree alterations for the numerals. */
  canonical: NoteName[],
  /** Transposed spelling — supplies the chord names and pitches. */
  notes: NoteName[]
): DiatonicChord[] | null {
  if (notes.length !== 7) return null;
  if (new Set(notes.map((n) => n[0])).size !== 7) return null;
  const seq = midiSequence(notes); // 8 entries; extend by octaves for stacking
  const midiAt = (j: number) => seq[j % 7]! + 12 * Math.floor(j / 7);
  const chords: DiatonicChord[] = [];
  notes.forEach((_, degree) => {
    const toneIndices = [degree, degree + 2, degree + 4, degree + 6];
    const midis = toneIndices.map(midiAt);
    const rel = midis.slice(1).map((m) => (m - midis[0]!) % 12).join(",");
    const [third = 0, fifth = 0] = midis.slice(1).map((m) => (m - midis[0]!) % 12);
    const triadKey = `${third},${fifth}`;
    const seventhName = SEVENTHS[rel];
    const triadName = TRIADS[triadKey];
    if (seventhName === undefined && triadName === undefined) return;
    const chordNotes = toneIndices.map((j) => notes[j % 7]!);
    const useSeventh = seventhName !== undefined;
    const accidentalMark = parseNote(canonical[degree]!)
      .accidental.replace(/#/g, "♯").replace(/b/g, "♭");
    const minorish = third === 3;
    let roman = accidentalMark + (minorish ? ROMAN[degree]!.toLowerCase() : ROMAN[degree]!);
    if (fifth === 6) roman += "°";
    else if (fifth === 8) roman += "+";
    chords.push({
      roman,
      symbol: prettyNote(notes[degree]!) + (useSeventh ? seventhName! : triadName!),
      notes: useSeventh ? chordNotes : chordNotes.slice(0, 3),
      midis: useSeventh ? midis : midis.slice(0, 3),
    });
  });
  return chords.length ? chords : null;
}

/** Bitmask of the scale's pitch classes (bit n = pitch class n). */
export function pitchClassMask(notes: NoteName[]): number {
  let mask = 0;
  for (const n of notes) mask |= 1 << parseNote(n).pitchClass;
  return mask;
}

/** `mask` transposed up by `k` semitones. */
export function rotateMask(mask: number, k: number): number {
  return ((mask << k) | (mask >>> (12 - k))) & 0xfff;
}

/**
 * MIDI numbers for one ascending pass through the scale plus the closing
 * tonic, starting at octave 4. The octave bumps whenever the letter wraps
 * past B.
 */
export function midiSequence(notes: NoteName[]): number[] {
  let octave = 4;
  let prevLetterIndex = -1;
  const seq: number[] = [];
  for (const note of notes) {
    const p = parseNote(note);
    const letterIndex = LETTERS.indexOf(p.letter as typeof LETTERS[number]);
    if (prevLetterIndex >= 0 && letterIndex < prevLetterIndex) octave++;
    prevLetterIndex = letterIndex;
    seq.push(12 * (octave + 1) + LETTER_SEMITONES[p.letter]! + p.offset);
  }
  seq.push(seq[0]! + 12); // closing tonic
  return seq;
}
