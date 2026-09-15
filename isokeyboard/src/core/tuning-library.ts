/**
 * The supplied tunings.
 *
 * The code calculates each historical temperament from the fifths that define
 * it. The code does not use a table of cents. Thus the values always agree
 * with the theory.
 *
 * The just tunings and the world tunings are lists of ratios or lists of
 * measurements. Each entry gives its source.
 */

import {
  centsForRatio,
  equalSpec,
  FIFTH_CENTS,
  makeTuning,
  mod,
  OCTAVE_CENTS,
  TRITAVE_CENTS,
  type TuningSpec
} from "./tuning.js";

export interface TuningPreset {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly group: string;
  readonly spec: TuningSpec;
}

const EDO_GROUP = "Equal divisions of the octave";
const NON_OCTAVE = "Non-octave";
const HISTORICAL = "Historical & just";
const WORLD = "World & experimental";

const EDO_NOTES: Record<number, string> = {
  5: "Equal pentatonic, slendro-like",
  7: "Equal heptatonic, pelog-like",
  10: "Two interleaved pentatonics",
  12: "Standard Western tuning",
  15: "Blackwood, warped diatonic",
  16: "Mavila, anti-diatonic",
  17: "Wide fifths, neutral seconds",
  19: "1/3-comma meantone",
  22: "Superpyth, strong 7-limit",
  24: "Quarter tones",
  31: "1/4-comma meantone, pure thirds",
  41: "Near-just 5- and 7-limit",
  53: "Near-just fifths, Turkish comma",
  72: "Twelfth-tones, 11-limit"
};

const PYTHAGOREAN_COMMA = 12 * FIFTH_CENTS - 7 * OCTAVE_CENTS; // 23.460¢
const SYNTONIC_COMMA = centsForRatio(81 / 80); // 21.506¢
const SCHISMA = PYTHAGOREAN_COMMA - SYNTONIC_COMMA; // 1.954¢

function fromRatios(name: string, ratios: number[], periodCents = OCTAVE_CENTS): TuningSpec {
  return { kind: "scale", name, periodCents, cents: ratios.map(centsForRatio) };
}

function fromCents(name: string, cents: number[], periodCents = OCTAVE_CENTS): TuningSpec {
  return { kind: "scale", name, periodCents, cents };
}

/**
 * Makes a circulating temperament of twelve notes.
 *
 * The code follows the chain of fifths C-G-D-A-E-B-F#-C#-G#-D#-A#-F. It makes
 * each fifth narrower by the given number of cents.
 *
 * The sum of the reductions must be equal to the Pythagorean comma. The circle
 * of fifths then closes. A different sum is an error in the data, and this
 * function reports it.
 */
function wellTemperament(name: string, narrowings: number[]): TuningSpec {
  const total = narrowings.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - PYTHAGOREAN_COMMA) > 0.01) {
    throw new Error(`${name}: fifths narrowed by ${total.toFixed(3)}¢, need ${PYTHAGOREAN_COMMA.toFixed(3)}¢`);
  }
  const cents = [0];
  let pitch = 0;
  for (const narrowing of narrowings.slice(0, 11)) {
    pitch += FIFTH_CENTS - narrowing;
    cents.push(mod(pitch, OCTAVE_CENTS));
  }
  return { kind: "scale", name, periodCents: OCTAVE_CENTS, cents };
}

/** Makes a meantone tuning from a chain of twelve equal fifths. The chain
 *  starts `lowest` fifths below C. */
function chainOfFifths(name: string, fifthCents: number, lowest: number): TuningSpec {
  const cents: number[] = [];
  for (let k = lowest; k < lowest + 12; k++) cents.push(mod(k * fifthCents, OCTAVE_CENTS));
  return { kind: "scale", name, periodCents: OCTAVE_CENTS, cents };
}

const JUST_12 = fromRatios("Just intonation (5-limit)", [
  1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8
]);

/** The 43-tone 11-limit gamut of Harry Partch. */
const PARTCH_43 = fromRatios("Partch 43-tone", [
  1, 81 / 80, 33 / 32, 21 / 20, 16 / 15, 12 / 11, 11 / 10, 10 / 9, 9 / 8, 8 / 7, 7 / 6, 32 / 27, 6 / 5,
  11 / 9, 5 / 4, 14 / 11, 9 / 7, 21 / 16, 4 / 3, 27 / 20, 11 / 8, 7 / 5, 10 / 7, 16 / 11, 40 / 27, 3 / 2,
  32 / 21, 14 / 9, 11 / 7, 8 / 5, 18 / 11, 5 / 3, 27 / 16, 12 / 7, 7 / 4, 16 / 9, 9 / 5, 20 / 11, 11 / 6,
  15 / 8, 40 / 21, 64 / 33, 160 / 81
]);

/** The harmonics 8 to 15. This part of the harmonic series sounds like a
 *  scale. */
const HARMONIC_SERIES = fromRatios(
  "Harmonic series 8–15",
  [8, 9, 10, 11, 12, 13, 14, 15].map((harmonic) => harmonic / 8)
);

export const TUNING_PRESETS: readonly TuningPreset[] = [
  ...[5, 7, 10, 12, 15, 16, 17, 19, 22, 24, 31, 41, 53, 72].map((divisions) => ({
    id: `edo-${divisions}`,
    name: divisions === 12 ? "12 TET" : `${divisions} EDO`,
    note: EDO_NOTES[divisions] ?? `${divisions} equal divisions of the octave`,
    group: EDO_GROUP,
    spec: equalSpec(divisions)
  })),

  {
    id: "bohlen-pierce",
    name: "Bohlen–Pierce",
    note: "13 equal divisions of 3/1 — no octaves, odd harmonics only",
    group: NON_OCTAVE,
    spec: equalSpec(13, TRITAVE_CENTS)
  },
  {
    id: "carlos-alpha",
    name: "Carlos Alpha",
    note: "9 equal divisions of 3/2 — 78.0¢ steps",
    group: NON_OCTAVE,
    spec: equalSpec(9, FIFTH_CENTS)
  },
  {
    id: "carlos-beta",
    name: "Carlos Beta",
    note: "11 equal divisions of 3/2 — 63.8¢ steps",
    group: NON_OCTAVE,
    spec: equalSpec(11, FIFTH_CENTS)
  },
  {
    id: "carlos-gamma",
    name: "Carlos Gamma",
    note: "20 equal divisions of 3/2 — 35.1¢ steps, near-just thirds and fifths",
    group: NON_OCTAVE,
    spec: equalSpec(20, FIFTH_CENTS)
  },

  { id: "just-5limit", name: "Just intonation (5-limit)", note: "Pure thirds and fifths in one key", group: HISTORICAL, spec: JUST_12 },
  {
    id: "pythagorean",
    name: "Pythagorean",
    note: "Twelve pure fifths, one wolf",
    group: HISTORICAL,
    spec: chainOfFifths("Pythagorean", FIFTH_CENTS, -1)
  },
  {
    id: "meantone-quarter",
    name: "Quarter-comma meantone",
    note: "Pure major thirds, fifths narrowed by 1/4 syntonic comma",
    group: HISTORICAL,
    spec: chainOfFifths("Quarter-comma meantone", (1200 * Math.log2(5)) / 4, -3)
  },
  {
    id: "werckmeister3",
    name: "Werckmeister III",
    note: "1691 — four fifths narrowed by 1/4 Pythagorean comma, every key usable",
    group: HISTORICAL,
    // The code makes C-G, G-D, D-A and B-F# narrower. B-F# is the sixth fifth
    // in the chain.
    spec: wellTemperament("Werckmeister III", [
      PYTHAGOREAN_COMMA / 4, PYTHAGOREAN_COMMA / 4, PYTHAGOREAN_COMMA / 4, 0, 0,
      PYTHAGOREAN_COMMA / 4, 0, 0, 0, 0, 0, 0
    ])
  },
  {
    id: "young2",
    name: "Young II",
    note: "1799 — the first six fifths narrowed by 1/6 comma, the rest pure",
    group: HISTORICAL,
    spec: wellTemperament(
      "Young II",
      Array.from({ length: 12 }, (_, i) => (i < 6 ? PYTHAGOREAN_COMMA / 6 : 0))
    )
  },
  {
    id: "kirnberger3",
    name: "Kirnberger III",
    note: "1779 — a pure C–E third, one schisma fifth, the rest pure",
    group: HISTORICAL,
    spec: wellTemperament("Kirnberger III", [
      SYNTONIC_COMMA / 4, SYNTONIC_COMMA / 4, SYNTONIC_COMMA / 4, SYNTONIC_COMMA / 4,
      0, 0, SCHISMA, 0, 0, 0, 0, 0
    ])
  },

  {
    id: "maqam-rast",
    name: "Maqam rast",
    note: "Seven degrees with neutral thirds — one common Arabic tuning of many",
    group: WORLD,
    spec: fromCents("Maqam rast", [0, 204, 355, 498, 702, 906, 1057])
  },
  {
    id: "slendro",
    name: "Slendro (approx.)",
    note: "Javanese five-tone gamelan tuning; every gamelan differs",
    group: WORLD,
    spec: fromCents("Slendro (approx.)", [0, 231, 474, 717, 955])
  },
  {
    id: "pelog",
    name: "Pelog (approx.)",
    note: "Javanese seven-tone gamelan tuning; every gamelan differs",
    group: WORLD,
    spec: fromCents("Pelog (approx.)", [0, 120, 258, 539, 675, 785, 1080])
  },
  { id: "partch43", name: "Partch 43-tone", note: "Harry Partch's 11-limit just gamut", group: WORLD, spec: PARTCH_43 },
  { id: "harmonics", name: "Harmonic series 8–15", note: "The overtone series as a scale", group: WORLD, spec: HARMONIC_SERIES }
];

export function findPreset(tuningId: string): TuningPreset | null {
  return TUNING_PRESETS.find((preset) => makeTuning(preset.spec).id === tuningId) ?? null;
}
