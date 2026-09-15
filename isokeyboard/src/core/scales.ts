/**
 * The scales. Each scale has one definition in 12-TET semitones.
 *
 * The function `stepsForSemitone` moves a scale into the active tuning. That
 * function rounds through just ratios. It does not scale the semitone count
 * linearly. Thus the major scale in 31 EDO is 0 5 10 13 18 23 28, which is the
 * correct meantone diatonic scale. In 19 EDO it is 0 3 6 8 11 14 17.
 *
 * To add a scale, add an entry to the list below. No other change is
 * necessary.
 */

import { mod, stepsForSemitone, type Tuning } from "./tuning.js";

export interface ScaleDef {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  /** The semitone offsets from the root. A value of null selects all notes. */
  readonly semitones: readonly number[] | null;
}

/** The id of the MOS entry. This entry has no fixed pattern. The generator
 *  settings control it. */
export const MOS_SCALE_ID = "mos";

const MODES = "Diatonic modes";
const MINOR = "Minor & altered";
const SYMMETRIC = "Symmetric";
const PENTATONIC = "Pentatonic & blues";
const WORLD = "World";

export const SCALES: readonly ScaleDef[] = [
  { id: "chromatic", name: "Chromatic (all notes)", group: "None", semitones: null },
  { id: MOS_SCALE_ID, name: "MOS / generated…", group: "None", semitones: null },

  { id: "major", name: "Major / Ionian", group: MODES, semitones: [0, 2, 4, 5, 7, 9, 11] },
  { id: "dorian", name: "Dorian", group: MODES, semitones: [0, 2, 3, 5, 7, 9, 10] },
  { id: "phrygian", name: "Phrygian", group: MODES, semitones: [0, 1, 3, 5, 7, 8, 10] },
  { id: "lydian", name: "Lydian", group: MODES, semitones: [0, 2, 4, 6, 7, 9, 11] },
  { id: "mixolydian", name: "Mixolydian", group: MODES, semitones: [0, 2, 4, 5, 7, 9, 10] },
  { id: "aeolian", name: "Natural minor / Aeolian", group: MODES, semitones: [0, 2, 3, 5, 7, 8, 10] },
  { id: "locrian", name: "Locrian", group: MODES, semitones: [0, 1, 3, 5, 6, 8, 10] },

  { id: "harmonicMinor", name: "Harmonic minor", group: MINOR, semitones: [0, 2, 3, 5, 7, 8, 11] },
  { id: "melodicMinor", name: "Melodic minor", group: MINOR, semitones: [0, 2, 3, 5, 7, 9, 11] },
  { id: "harmonicMajor", name: "Harmonic major", group: MINOR, semitones: [0, 2, 4, 5, 7, 8, 11] },
  { id: "phrygianDom", name: "Phrygian dominant", group: MINOR, semitones: [0, 1, 4, 5, 7, 8, 10] },
  { id: "lydianDom", name: "Lydian dominant / acoustic", group: MINOR, semitones: [0, 2, 4, 6, 7, 9, 10] },
  { id: "altered", name: "Altered / super-locrian", group: MINOR, semitones: [0, 1, 3, 4, 6, 8, 10] },
  { id: "neapolitanMinor", name: "Neapolitan minor", group: MINOR, semitones: [0, 1, 3, 5, 7, 8, 11] },

  { id: "wholeTone", name: "Whole tone", group: SYMMETRIC, semitones: [0, 2, 4, 6, 8, 10] },
  { id: "octatonicHW", name: "Octatonic (half–whole)", group: SYMMETRIC, semitones: [0, 1, 3, 4, 6, 7, 9, 10] },
  { id: "octatonicWH", name: "Octatonic (whole–half)", group: SYMMETRIC, semitones: [0, 2, 3, 5, 6, 8, 9, 11] },
  { id: "augmented", name: "Augmented", group: SYMMETRIC, semitones: [0, 3, 4, 7, 8, 11] },
  { id: "tritone", name: "Tritone", group: SYMMETRIC, semitones: [0, 1, 4, 6, 7, 10] },

  { id: "majorPent", name: "Major pentatonic", group: PENTATONIC, semitones: [0, 2, 4, 7, 9] },
  { id: "minorPent", name: "Minor pentatonic", group: PENTATONIC, semitones: [0, 3, 5, 7, 10] },
  { id: "blues", name: "Blues", group: PENTATONIC, semitones: [0, 3, 5, 6, 7, 10] },
  { id: "majorBlues", name: "Major blues", group: PENTATONIC, semitones: [0, 2, 3, 4, 7, 9] },

  { id: "doubleHarmonic", name: "Double harmonic / Byzantine", group: WORLD, semitones: [0, 1, 4, 5, 7, 8, 11] },
  { id: "hungarianMinor", name: "Hungarian minor", group: WORLD, semitones: [0, 2, 3, 6, 7, 8, 11] },
  { id: "hirajoshi", name: "Hirajōshi", group: WORLD, semitones: [0, 2, 3, 7, 8] },
  { id: "inSen", name: "In sen", group: WORLD, semitones: [0, 1, 5, 7, 10] },
  { id: "iwato", name: "Iwato", group: WORLD, semitones: [0, 1, 5, 6, 10] },
  { id: "kumoi", name: "Kumoi", group: WORLD, semitones: [0, 2, 3, 7, 9] },
  { id: "prometheus", name: "Prometheus", group: WORLD, semitones: [0, 2, 4, 6, 9, 10] }
];

export function getScale(id: string): ScaleDef {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

/**
 * Gives the degrees of the tuning that the scale contains, with `root` as the
 * root degree. A result of null shows that there is no mask. All degrees then
 * sound.
 */
export function scaleDegrees(tuning: Tuning, scale: ScaleDef, root: number): Set<number> | null {
  if (!scale.semitones) return null;
  const degrees = new Set<number>();
  for (const semitone of scale.semitones) {
    degrees.add(mod(root + stepsForSemitone(tuning, semitone), tuning.size));
  }
  return degrees.size >= tuning.size ? null : degrees;
}
