/**
 * Finds the just ratio nearest to an interval, within an odd limit.
 *
 * The odd limit is the standard method to select the permitted ratios. The
 * 5-limit permits 3, 5, 9 and 15 as odd factors, which gives 5/4, 6/5 and 3/2.
 * The 7-limit adds 7/4 and 7/6. The 11-limit adds 11/8.
 *
 * The code reduces each ratio into one octave. Thus it names an interval of
 * any size with the reduced form. This is the form that the player reads on a
 * key.
 */

import { centsForRatio, mod, OCTAVE_CENTS } from "./tuning.js";

export interface RatioMatch {
  readonly numerator: number;
  readonly denominator: number;
  readonly cents: number;
  /** The distance from the given interval, in cents. The value has a sign. */
  readonly error: number;
}

export const ODD_LIMITS = [3, 5, 7, 9, 11, 13, 15] as const;
export const DEFAULT_ODD_LIMIT = 9;

const tableCache = new Map<number, RatioMatch[]>();

function ratioTable(oddLimit: number): RatioMatch[] {
  const cached = tableCache.get(oddLimit);
  if (cached) return cached;

  const seen = new Map<string, RatioMatch>();
  for (let a = 1; a <= oddLimit; a += 2) {
    for (let b = 1; b <= oddLimit; b += 2) {
      const { numerator, denominator } = octaveReduce(a, b);
      const key = `${numerator}/${denominator}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        numerator,
        denominator,
        cents: centsForRatio(numerator / denominator),
        error: 0
      });
    }
  }
  const table = [...seen.values()].sort((x, y) => x.cents - y.cents);
  tableCache.set(oddLimit, table);
  return table;
}

/** Reduces a ratio into one octave. The numerator and the denominator stay
 *  exact integers. */
function octaveReduce(a: number, b: number): { numerator: number; denominator: number } {
  let numerator = a;
  let denominator = b;
  while (numerator / denominator >= 2) denominator *= 2;
  while (numerator / denominator < 1) numerator *= 2;
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Finds the just ratio nearest to `cents`. The interval can be more than one
 *  octave. */
export function nearestRatio(cents: number, oddLimit = DEFAULT_ODD_LIMIT): RatioMatch {
  const reduced = mod(cents, OCTAVE_CENTS);
  const table = ratioTable(oddLimit);
  let best = table[0];
  let bestDistance = Infinity;
  for (const candidate of table) {
    // The ratios 2/1 and 1/1 are the same position in the octave. Thus the
    // code also examines the candidate one octave above.
    for (const target of [candidate.cents, candidate.cents + OCTAVE_CENTS]) {
      const distance = Math.abs(target - reduced);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  }
  const error = signedError(reduced, best.cents);
  return { ...best, error };
}

function signedError(reduced: number, ratioCents: number): number {
  const direct = reduced - ratioCents;
  const wrapped = reduced - (ratioCents + OCTAVE_CENTS);
  return Math.abs(wrapped) < Math.abs(direct) ? wrapped : direct;
}

export function formatRatio(match: RatioMatch): string {
  return `${match.numerator}/${match.denominator}`;
}

export function formatError(match: RatioMatch): string {
  const rounded = Math.round(match.error * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "±0¢";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}¢`;
}
