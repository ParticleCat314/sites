/**
 * The isomorphic grid layouts.
 *
 * Each hex has axial coordinates (q, r) and a pointy top. The value r
 * increases in the downward direction. The step equation is:
 *
 *   step(q, r) = centre + east * q - upLeft * r
 *
 * Thus the six adjacent hexes are: E = +east, W = -east, NW = +upLeft,
 * SE = -upLeft, NE = east + upLeft, SW = -(east + upLeft).
 *
 * Each layout calculates its vectors from the tuning. Thus a layout keeps its
 * musical function in each tuning. The north-east neighbour in Wicki-Hayden is
 * a fifth in 12 TET (7 steps), in 31 EDO (18 steps) and in a just scale.
 */

import { perfectFifth, stepsForRatio, type Tuning } from "./tuning.js";

export interface LayoutVectors {
  readonly east: number;
  readonly upLeft: number;
}

export interface LayoutDef {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  vectors(tuning: Tuning): LayoutVectors;
}

export const LAYOUTS: readonly LayoutDef[] = [
  {
    id: "wicki",
    name: "Wicki–Hayden",
    note: "E = whole tone · NW = fourth · NE = fifth",
    vectors(tuning) {
      const fifth = perfectFifth(tuning);
      return { east: 2 * fifth - tuning.size, upLeft: tuning.size - fifth };
    }
  },
  {
    id: "harmonic",
    name: "Harmonic table",
    note: "NW = minor third · NE = major third · N = fifth",
    vectors(tuning) {
      const minorThird = stepsForRatio(tuning, 6 / 5);
      const majorThird = stepsForRatio(tuning, 5 / 4);
      return { east: majorThird - minorThird, upLeft: minorThird };
    }
  },
  {
    id: "bosanquet",
    name: "Bosanquet (fifths)",
    note: "E = one step · NE = fifth — the classic generalised microtonal keyboard",
    vectors(tuning) {
      return { east: 1, upLeft: perfectFifth(tuning) - 1 };
    }
  }
];

export function getLayout(id: string): LayoutDef {
  return LAYOUTS.find((layout) => layout.id === id) ?? LAYOUTS[0];
}

/**
 * Returns true if the pitch increases along both axes. A layout is usable only
 * in this condition.
 *
 * A calculated vector can be 0 or negative in a tuning for which the layout is
 * not applicable. In Bohlen-Pierce, the Wicki-Hayden equation `2 * fifth -
 * size` gives -3. The pitch then decreases from left to right.
 */
export function isLayoutUsable(vectors: LayoutVectors): boolean {
  return vectors.east > 0 && vectors.upLeft > 0;
}

/** Gives the requested layout. If that layout is not usable in this tuning,
 *  gives the first layout that is usable. */
export function usableLayout(id: string, tuning: Tuning): { layout: LayoutDef; requested: LayoutDef } {
  const requested = getLayout(id);
  if (isLayoutUsable(requested.vectors(tuning))) return { layout: requested, requested };
  const fallback = LAYOUTS.find((candidate) => isLayoutUsable(candidate.vectors(tuning)));
  return { layout: fallback ?? requested, requested };
}
