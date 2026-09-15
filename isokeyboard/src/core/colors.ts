/**
 * The key colours.
 *
 * The hue follows the chain of fifths. Thus two degrees that are near in
 * harmonic function get near colours in each tuning.
 *
 * In some tunings the fifth does not generate all degrees. Examples are
 * 24 EDO, 72 EDO and most imported scales. The hue then follows the degree
 * order.
 */

import { mod, perfectFifth, type Tuning } from "./tuning.js";

export interface HexPalette {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeOpacity: string;
  readonly hotFill: string;
  readonly hotStroke: string;
}

const hueCache = new Map<string, number[]>();

function hueTable(tuning: Tuning): number[] {
  const cached = hueCache.get(tuning.id);
  if (cached) return cached;

  const inverse = modInverse(perfectFifth(tuning), tuning.size);
  const hues: number[] = [];
  for (let degree = 0; degree < tuning.size; degree++) {
    const position = inverse === null ? degree : mod(degree * inverse, tuning.size);
    hues.push((position / tuning.size) * 360);
  }
  hueCache.set(tuning.id, hues);
  return hues;
}

function modInverse(a: number, n: number): number | null {
  const value = mod(a, n);
  for (let x = 1; x < n; x++) {
    if (mod(value * x, n) === 1) return x;
  }
  return null;
}

export function hueForDegree(tuning: Tuning, degree: number): number {
  return hueTable(tuning)[mod(degree, tuning.size)];
}

export interface HexState {
  readonly inScale: boolean;
  /** True if this hex is an instance of the note outside the main area. */
  readonly duplicate: boolean;
}

export function hexPalette(tuning: Tuning, degree: number, state: HexState): HexPalette {
  const h = hueForDegree(tuning, degree);
  const { inScale, duplicate } = state;
  if (!inScale) {
    return {
      fill: `hsl(${h} 10% 9%)`,
      stroke: `hsl(${h} 14% 30%)`,
      strokeOpacity: "0.4",
      hotFill: `hsl(${h} 30% 34%)`,
      hotStroke: `hsl(${h} 40% 55%)`
    };
  }
  if (duplicate) {
    // The note is in the scale and the hex is playable. But the user must
    // read the note from the main area.
    return {
      fill: `hsl(${h} 22% 10%)`,
      stroke: `hsl(${h} 35% 40%)`,
      strokeOpacity: "0.35",
      hotFill: `hsl(${h} 85% 58%)`,
      hotStroke: `hsl(${h} 95% 75%)`
    };
  }
  return {
    fill: `hsl(${h} 45% 12%)`,
    stroke: `hsl(${h} 75% 55%)`,
    strokeOpacity: "0.55",
    hotFill: `hsl(${h} 85% 58%)`,
    hotStroke: `hsl(${h} 95% 75%)`
  };
}
