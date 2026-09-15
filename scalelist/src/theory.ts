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

/** "Bbb" -> "B𝄫", "F#" -> "F♯" … for display. */
export function prettyNote(note: NoteName): string {
  return (
    note[0]! +
    note.slice(1)
      .replace(/##/, "𝄪")
      .replace(/bb/, "𝄫")
      .replace(/#/, "♯")
      .replace(/b/, "♭")
  );
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
