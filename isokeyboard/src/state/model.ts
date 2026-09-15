/**
 * The calculated read-only description of the instrument. It contains the data
 * that the board, the inputs and the synth use. The code calculates it one
 * time after each change of the settings.
 */

import { usableLayout, type LayoutDef, type LayoutVectors } from "../core/layouts.js";
import { mosDegrees } from "../core/mos.js";
import { getScale, MOS_SCALE_ID, scaleDegrees, type ScaleDef } from "../core/scales.js";
import {
  centsAt,
  degreeNames,
  degreeOf,
  frequency,
  makeTuning,
  mod,
  registerOf,
  stepFor,
  stepRange,
  type Tuning
} from "../core/tuning.js";
import type { Settings } from "./settings.js";

export interface Model {
  readonly tuning: Tuning;
  readonly layout: LayoutDef;
  /** The requested layout, if that layout is not usable in this tuning and the
   *  code selected a different one. If not, null. */
  readonly layoutFallbackFrom: LayoutDef | null;
  readonly vectors: LayoutVectors;
  /** The centre of the grid, with the octave shift included. This is the note
   *  that the middle hex sounds. */
  readonly centerStep: number;
  readonly minStep: number;
  readonly maxStep: number;
  readonly names: readonly string[];
  readonly scale: ScaleDef;
  readonly scaleRoot: number;
  /** The name of the active scale for the user, with the MOS parameters. */
  readonly scaleLabel: string;
  /** The degrees that sound. A value of null shows that all degrees sound. */
  readonly maskedDegrees: Set<number> | null;
  /** A string that contains each value that changes the contents of a hex. The
   *  code compares two of these strings to find a change. */
  readonly key: string;
  degree(step: number): number;
  register(step: number): number;
  name(step: number): string;
  frequency(step: number): number;
  cents(step: number): number;
  /** Gives the interval above the scale root, reduced into one period. */
  centsFromRoot(step: number): number;
  inScale(step: number): boolean;
}

/**
 * Builds the model.
 *
 * The value `octaveShift` moves the complete grid by a number of periods. The
 * code does not transpose the pitch on the path to the synth.
 *
 * Thus the label of a hex shows the note that the hex sounds. The audible
 * range below also removes a shifted pitch, as it removes each other pitch.
 */
export function buildModel(settings: Settings, octaveShift = 0): Model {
  const tuning = makeTuning(settings.tuning);
  const { layout, requested } = usableLayout(settings.layout, tuning);
  const vectors = layout.vectors(tuning);
  const scale = getScale(settings.scale);
  // The centre of the grid is the usual tonic. A movement of the centre must
  // also move the scale, the root indication and each value that the code
  // measures from the root.
  const scaleRoot = settings.rootFollowsCenter
    ? mod(settings.centerDegree, tuning.size)
    : mod(settings.scaleRoot, tuning.size);
  const masked = maskFor(tuning, settings, scale, scaleRoot);
  const names = degreeNames(tuning);
  const range = stepRange(tuning, settings.aHz);
  const unshiftedCenter = stepFor(tuning, settings.centerRegister, settings.centerDegree);
  const centerStep = unshiftedCenter + octaveShift * tuning.size;

  return {
    tuning,
    layout,
    layoutFallbackFrom: layout === requested ? null : requested,
    vectors,
    centerStep,
    minStep: range.lo,
    maxStep: range.hi,
    names,
    scale,
    scaleRoot,
    scaleLabel:
      scale.id === MOS_SCALE_ID
        ? `${settings.mosNotes}-note MOS, generator ${settings.mosGenerator}\\${tuning.size}, mode ${settings.mosMode}`
        : scale.name,
    maskedDegrees: masked,
    key: [
      tuning.id,
      layout.id,
      vectors.east,
      vectors.upLeft,
      centerStep,
      scale.id,
      scaleRoot,
      settings.mosGenerator,
      settings.mosNotes,
      settings.mosMode,
      settings.aHz
    ].join("|"),
    degree: (step) => degreeOf(tuning, step),
    register: (step) => registerOf(tuning, step),
    name: (step) => names[degreeOf(tuning, step)],
    frequency: (step) => frequency(tuning, step, settings.aHz),
    cents: (step) => centsAt(tuning, step),
    centsFromRoot: (step) =>
      mod(tuning.degreeCents[degreeOf(tuning, step)] - tuning.degreeCents[scaleRoot], tuning.periodCents),
    inScale: (step) => masked === null || masked.has(degreeOf(tuning, step))
  };
}

/** The permitted shift of the grid, in periods. The range includes both
 *  limits. */
export interface OctaveShiftRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Calculates the largest shift of the grid that continues to sound.
 *
 * At a larger shift the centre note moves out of the audible band. The code
 * then removes each hex, and the keys become silent.
 *
 * The code calculates the two directions separately. A low centre note can
 * move up more than it can move down.
 *
 * The value `ceiling` limits both directions. Thus a control does not offer
 * nine octaves of movement when the audible band permits it.
 */
export function octaveShiftRange(settings: Settings, ceiling: number): OctaveShiftRange {
  const tuning = makeTuning(settings.tuning);
  const range = stepRange(tuning, settings.aHz);
  const center = stepFor(tuning, settings.centerRegister, settings.centerDegree);
  const above = clampToCeiling(Math.floor((range.hi - center) / tuning.size), ceiling);
  const below = clampToCeiling(Math.floor((center - range.lo) / tuning.size), ceiling);
  return { min: below === 0 ? 0 : -below, max: above }; // Never give -0 as a result.
}

function clampToCeiling(periods: number, ceiling: number): number {
  return Math.max(0, Math.min(ceiling, periods));
}

function maskFor(tuning: Tuning, settings: Settings, scale: ScaleDef, root: number): Set<number> | null {
  if (scale.id !== MOS_SCALE_ID) return scaleDegrees(tuning, scale, root);
  const degrees = mosDegrees(tuning.size, settings.mosGenerator, settings.mosNotes, root, settings.mosMode);
  return degrees.size >= tuning.size ? null : degrees;
}
