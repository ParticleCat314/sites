/**
 * The moment-of-symmetry (MOS) scales.
 *
 * To make a MOS scale, add one generator interval `count` times and reduce
 * each result into the period. The result is a MOS scale only if it has two
 * different step sizes. Two step sizes give the scale a clear pattern of tones
 * and semitones, like a diatonic scale.
 *
 * This is the important scale family outside 12 TET. The 12-TET modes are the
 * MOS scale of size 7 with the fifth as the generator. The porcupine[7] scale
 * of 22 EDO (generator 3\22) and the mavila[7] scale of 16 EDO have no 12-TET
 * equivalent.
 */

import { centsAt, mod, perfectFifth, type Tuning } from "./tuning.js";

export const MIN_MOS_NOTES = 3;

/**
 * Gives the degrees of a MOS scale.
 *
 * The value `mode` moves the generator chain below the root. Mode 0 adds each
 * generator above the root. This is the brightest mode, which is lydian for
 * fifths in 12 EDO. Mode 1 starts one generator below the root, which is
 * ionian. Each subsequent mode is darker.
 */
export function mosDegrees(size: number, generator: number, count: number, root: number, mode = 0): Set<number> {
  const degrees = new Set<number>();
  for (let i = 0; i < count; i++) degrees.add(mod(root + (i - mode) * generator, size));
  return degrees;
}

/** Returns true if the generated scale has two different step sizes or fewer. */
export function isMos(size: number, generator: number, count: number): boolean {
  const degrees = [...mosDegrees(size, generator, count, 0)].sort((a, b) => a - b);
  if (degrees.length !== count) return false; // The generator chain repeats a degree.
  const stepSizes = new Set<number>();
  for (let i = 0; i < degrees.length; i++) {
    const next = i + 1 < degrees.length ? degrees[i + 1] : degrees[0] + size;
    stepSizes.add(next - degrees[i]);
  }
  return stepSizes.size <= 2;
}

/** Lists the note counts that make a MOS scale with this generator. The
 *  smallest count is first. */
export function mosNoteCounts(size: number, generator: number): number[] {
  const counts: number[] = [];
  for (let count = MIN_MOS_NOTES; count <= size; count++) {
    if (isMos(size, generator, count)) counts.push(count);
  }
  return counts;
}

export interface GeneratorOption {
  readonly steps: number;
  readonly cents: number;
  readonly label: string;
}

/**
 * Lists the generators to show to the user. The list contains each generator
 * up to one half of the period. A larger generator is the inversion of a
 * generator in the list and makes the same scales.
 */
export function generatorOptions(tuning: Tuning): GeneratorOption[] {
  const options: GeneratorOption[] = [];
  for (let steps = 1; steps <= Math.floor(tuning.size / 2); steps++) {
    const cents = centsAt(tuning, steps);
    options.push({
      steps,
      cents,
      label: `${steps}\\${tuning.size} · ${cents.toFixed(1)}¢`
    });
  }
  return options;
}

/** Gives a suitable initial generator. This is the fifth, reduced into the
 *  range of the offered generators. */
export function defaultGenerator(tuning: Tuning): number {
  const fifth = mod(perfectFifth(tuning), tuning.size);
  const folded = fifth > tuning.size / 2 ? tuning.size - fifth : fifth;
  return Math.max(1, folded);
}

/** Lists the modes. Each mode is a rotation of the generator chain. There is
 *  one mode for each note in the scale. */
export function modeOptions(count: number): number[] {
  return Array.from({ length: count }, (_, mode) => mode);
}

/** Gives the nearest available note count. The code uses this when the tuning
 *  changes and the stored count is not available. */
export function nearestNoteCount(size: number, generator: number, wanted: number): number {
  const counts = mosNoteCounts(size, generator);
  if (counts.length === 0) return Math.min(wanted, size);
  return counts.reduce((best, count) => (Math.abs(count - wanted) < Math.abs(best - wanted) ? count : best), counts[0]);
}
