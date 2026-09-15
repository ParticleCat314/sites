/**
 * A tuning is a table of cents.
 *
 * A tuning has `size` degrees. The degrees repeat at each `periodCents`.
 * Equal divisions are the usual case. 12 TET has 12 degrees of 100¢.
 * This module does not assume equal steps. It does not assume an octave
 * period. Bohlen-Pierce repeats at 3/1. The Carlos scales repeat at 3/2.
 * An imported Scala file can have any degrees.
 *
 * A pitch is an integer `step`. Step 0 is 0¢ in each tuning. Thus
 * `register = floor(step / size) - 1` is always correct. One code path is
 * sufficient for 12 TET, for 31 EDO and for a 5-limit just scale.
 */

export interface Tuning {
  /** The identity of the value. Two tunings with the same id are equivalent. */
  readonly id: string;
  readonly name: string;
  readonly note: string;
  /** The number of degrees in each period. */
  readonly size: number;
  readonly periodCents: number;
  /** In ascending order. `[0]` is 0. Each value is less than `periodCents`. */
  readonly degreeCents: readonly number[];
  readonly equal: boolean;
  /** A tuning that repeats at the octave uses letter names. Other tunings use
   *  degree numbers. */
  readonly octaveBased: boolean;
}

export type TuningSpec =
  | { kind: "equal"; divisions: number; periodCents: number }
  | { kind: "scale"; name: string; periodCents: number; cents: number[] };

export const MIN_DIVISIONS = 2;
export const MAX_DIVISIONS = 96;
export const OCTAVE_CENTS = 1200;
export const TRITAVE_CENTS = 1200 * Math.log2(3); // 1901.955¢. The Bohlen-Pierce period.
export const FIFTH_CENTS = 1200 * Math.log2(3 / 2); // 701.955¢. The Carlos period.

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function centsForRatio(ratio: number): number {
  return 1200 * Math.log2(ratio);
}

export function equalSpec(divisions: number, periodCents = OCTAVE_CENTS): TuningSpec {
  return { kind: "equal", divisions, periodCents };
}

export function clampDivisions(value: number): number {
  return Math.min(MAX_DIVISIONS, Math.max(MIN_DIVISIONS, Math.round(value)));
}

const tuningCache = new Map<string, Tuning>();

export function makeTuning(spec: TuningSpec): Tuning {
  const built = spec.kind === "equal" ? buildEqual(spec) : buildScale(spec);
  const cached = tuningCache.get(built.id);
  if (cached) return cached;
  tuningCache.set(built.id, built);
  return built;
}

function buildEqual(spec: { divisions: number; periodCents: number }): Tuning {
  const size = clampDivisions(spec.divisions);
  const period = Math.max(1, spec.periodCents);
  const degreeCents = Array.from({ length: size }, (_, degree) => (degree * period) / size);
  const octaveBased = Math.abs(period - OCTAVE_CENTS) < 0.5;
  return {
    id: `equal:${size}:${period.toFixed(4)}`,
    name: octaveBased ? `${size} EDO` : `${size} ED ${periodName(period)}`,
    note: octaveBased ? `${(period / size).toFixed(2)}¢ per step` : `${(period / size).toFixed(2)}¢ per step, repeats at ${period.toFixed(1)}¢`,
    size,
    periodCents: period,
    degreeCents,
    equal: true,
    octaveBased
  };
}

function buildScale(spec: { name: string; periodCents: number; cents: number[] }): Tuning {
  const period = Math.max(1, spec.periodCents);
  const degreeCents = normaliseDegrees(spec.cents, period);
  const octaveBased = Math.abs(period - OCTAVE_CENTS) < 0.5;
  return {
    id: `scale:${period.toFixed(4)}:${degreeCents.map((c) => c.toFixed(3)).join(",")}`,
    name: spec.name || "Custom scale",
    note: `${degreeCents.length} degrees, repeats at ${period.toFixed(1)}¢`,
    size: degreeCents.length,
    periodCents: period,
    degreeCents,
    equal: false,
    octaveBased
  };
}

/** Sorts the degrees. Removes duplicates. Reduces each into one period.
 *  The result always starts at 0. */
function normaliseDegrees(cents: readonly number[], period: number): number[] {
  const seen = new Set<number>([0]);
  for (const value of cents) {
    if (!Number.isFinite(value)) continue;
    const reduced = mod(value, period);
    seen.add(Math.round(reduced * 1000) / 1000);
  }
  const sorted = [...seen].sort((a, b) => a - b).slice(0, MAX_DIVISIONS);
  return sorted.length >= MIN_DIVISIONS ? sorted : [0, period / 2];
}

function periodName(cents: number): string {
  if (Math.abs(cents - TRITAVE_CENTS) < 0.5) return "3/1";
  if (Math.abs(cents - FIFTH_CENTS) < 0.5) return "3/2";
  return `${cents.toFixed(1)}¢`;
}

// ------------------------------------------------------------ pitch equations

export function centsAt(tuning: Tuning, step: number): number {
  const period = Math.floor(step / tuning.size);
  return period * tuning.periodCents + tuning.degreeCents[mod(step, tuning.size)];
}

/** Finds the step with the pitch nearest to `cents` above step 0. */
export function nearestStep(tuning: Tuning, cents: number): number {
  const period = Math.floor(cents / tuning.periodCents);
  const remainder = cents - period * tuning.periodCents;
  let best = 0;
  let bestDistance = Infinity;
  for (let degree = 0; degree <= tuning.size; degree++) {
    // The value `size` is degree 0 of the next period. Thus an interval near
    // the top of a period can move up into that period.
    const candidate = degree === tuning.size ? tuning.periodCents : tuning.degreeCents[degree];
    const distance = Math.abs(candidate - remainder);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = degree;
    }
  }
  return period * tuning.size + best;
}

/** Finds the number of steps nearest to a frequency ratio. Example: 3/2 gives
 *  the fifth. */
export function stepsForRatio(tuning: Tuning, ratio: number): number {
  return nearestStep(tuning, centsForRatio(ratio));
}

/**
 * The ratio for each 12-TET semitone.
 *
 * The code rounds these ratios into the target tuning. This is the method that
 * moves a 12-TET item, such as a scale or a layout interval, into a different
 * tuning. The method keeps the harmonic function of the interval. A linear
 * change of the semitone count does not keep the harmonic function.
 */
const SEMITONE_RATIOS = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8];

export function stepsForSemitone(tuning: Tuning, semitone: number): number {
  const octaves = Math.floor(semitone / 12);
  return stepsForRatio(tuning, Math.pow(2, octaves) * SEMITONE_RATIOS[mod(semitone, 12)]);
}

export function perfectFifth(tuning: Tuning): number {
  return stepsForRatio(tuning, 3 / 2);
}

/** Finds the number of steps in a sharp. This is the difference between a
 *  chromatic semitone and a diatonic semitone. */
export function apotome(tuning: Tuning): number {
  return 7 * perfectFifth(tuning) - 4 * tuning.size;
}

export function degreeOf(tuning: Tuning, step: number): number {
  return mod(step, tuning.size);
}

/** Gives the octave number for a tuning that repeats at the octave. Gives the
 *  period number for each other tuning. */
export function registerOf(tuning: Tuning, step: number): number {
  return Math.floor(step / tuning.size) - 1;
}

export function stepFor(tuning: Tuning, register: number, degree: number): number {
  return (register + 1) * tuning.size + degree;
}

/** Finds the step for A4. A4 is 6900¢ above step 0. The same calculation gives
 *  MIDI note 69. */
export function referenceStep(tuning: Tuning): number {
  return nearestStep(tuning, 6900);
}

export function frequency(tuning: Tuning, step: number, aHz: number): number {
  return aHz * Math.pow(2, (centsAt(tuning, step) - centsAt(tuning, referenceStep(tuning))) / 1200);
}

const MIN_HZ = 16;
const MAX_HZ = 8400;

/** Gives the range of steps that the user can play. The limits are the audible
 *  band. The limits are not a MIDI range. */
export function stepRange(tuning: Tuning, aHz: number): { lo: number; hi: number } {
  const referenceCents = centsAt(tuning, referenceStep(tuning));
  let lo = nearestStep(tuning, referenceCents + centsForRatio(MIN_HZ / aHz));
  let hi = nearestStep(tuning, referenceCents + centsForRatio(MAX_HZ / aHz));
  while (frequency(tuning, lo, aHz) < MIN_HZ) lo++;
  while (frequency(tuning, hi, aHz) > MAX_HZ) hi--;
  return { lo, hi };
}

/** Moves a degree into a new tuning. The pitch stays approximately the same. */
export function convertDegree(fromSize: number, toSize: number, degree: number): number {
  return mod(Math.round((degree * toSize) / fromSize), toSize);
}

// -------------------------------------------------------------- note naming

const LETTERS: ReadonlyArray<readonly [string, number]> = [
  ["F", -1], ["C", 0], ["G", 1], ["D", 2], ["A", 3], ["E", 4], ["B", 5]
];
// The code uses single accidentals only. Double sharps and double flats can
// name more degrees, but the names are not usable. In 31 EDO, degree 1 becomes
// B##. Thus the code uses up marks and down marks for each degree that the
// chain of fifths does not name.
const ACCIDENTALS: ReadonlyArray<readonly [string, number]> = [["", 0], ["♯", 1], ["♭", -1]];

const nameCache = new Map<string, string[]>();

/**
 * Makes a name for each degree from the chain of fifths. The code names the
 * naturals first, then the sharps, then the flats.
 *
 * The chain does not reach all degrees. Examples are the odd quarter tones of
 * 24 EDO and most degrees of 53 EDO. Each of these degrees gets the name of
 * the nearest named degree below it and one `↑` mark for each step above it.
 *
 * A tuning that does not repeat at the octave uses degree numbers.
 */
export function degreeNames(tuning: Tuning): string[] {
  const cached = nameCache.get(tuning.id);
  if (cached) return cached;

  const names = tuning.octaveBased ? letterNames(tuning) : numberNames(tuning);
  nameCache.set(tuning.id, names);
  return names;
}

function numberNames(tuning: Tuning): string[] {
  return Array.from({ length: tuning.size }, (_, degree) => String(degree));
}

function letterNames(tuning: Tuning): string[] {
  const fifth = perfectFifth(tuning);
  const sharp = apotome(tuning);
  const named: (string | null)[] = new Array(tuning.size).fill(null);

  for (const [symbol, count] of ACCIDENTALS) {
    if (count !== 0 && sharp === 0) break; // This tuning has no accidentals.
    for (const [letter, chain] of LETTERS) {
      const degree = mod(chain * fifth + count * sharp, tuning.size);
      if (named[degree] === null) named[degree] = letter + symbol;
    }
  }
  return named.map((name, degree) => name ?? upsFrom(named, degree, tuning.size));
}

function upsFrom(named: (string | null)[], degree: number, size: number): string {
  for (let up = 1; up < size; up++) {
    const below = named[mod(degree - up, size)];
    if (below) return up <= 2 ? below + "↑".repeat(up) : `${below}+${up}`;
  }
  return String(degree);
}
