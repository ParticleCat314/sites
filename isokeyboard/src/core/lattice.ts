/**
 * The positions where the grid repeats.
 *
 * The equation `step(q, r) = centre + east * q - upLeft * r` maps a lattice of
 * two dimensions onto one dimension of pitch. Thus the map is many-to-one:
 * complete lines of hexes play the same note.
 *
 * Each of these lines is parallel to one repeat vector. The repeat vector is
 * the smallest integer movement that does not change the step:
 *
 *   east * q - upLeft * r = 0   gives   (q, r) = (upLeft, east) / gcd(east, upLeft)
 *
 * In 12 TET Wicki-Hayden the repeat vector is (5, 2). Move five columns to the
 * right and two rows up. The note is the same.
 *
 * The primary instance of a note is the instance nearest to the centre of the
 * grid. The band of primary instances is the main area. Each other instance is
 * a duplicate. The code can make a duplicate grey, but the duplicate stays
 * fully playable.
 *
 * The same equations give the notes that a layout can reach. The image of the
 * map is `centre + gcd(east, upLeft) * Z`. Thus a layout whose two vectors
 * have a common factor cannot play the notes between. In 24 EDO Wicki-Hayden,
 * `gcd(4, 10) = 2`. The layout reaches every second step only, and the quarter
 * tones are not available.
 *
 * This common factor is the stride. If the stride is more than 1, the
 * duplicate bands are spare. The code can move band `k` by `k mod stride`
 * steps. The band then plays the notes that the main area cannot play.
 */

/** Pointy-top hex geometry for a radius of 1. Only the ratio is important. */
const COL = Math.sqrt(3);
const ROW = 1.5;

/** The notes that the repeated bands of a grid play. */
export type BandMode = "repeat" | "octave" | "fill";

export interface LatticeVector {
  readonly q: number;
  readonly r: number;
}

export function repeatVector(east: number, upLeft: number): LatticeVector | null {
  if (east === 0 || upLeft === 0) return null;
  const divisor = gcd(Math.abs(east), Math.abs(upLeft));
  return { q: upLeft / divisor, r: east / divisor };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function world(q: number, r: number): { x: number; y: number } {
  return { x: COL * (q + r / 2), y: ROW * r };
}

/**
 * Two instances of a note can be at an equal distance from the centre. This
 * occurs when the repeat line of the note passes on both sides of the origin.
 *
 * The code rounds a value of 0.5 up. The small addition is more than the error
 * of the floating-point calculation. Thus the code makes the same decision
 * from both hexes, and one hex only becomes the primary instance.
 */
const HALF_UP = 0.5 + 1e-9;

/**
 * Counts the repeat vectors between this hex and the main area. A result of 0
 * shows the primary instance of the note. A result of +1 or -1 shows a band
 * adjacent to the main area.
 */
export function repeatIndex(q: number, r: number, east: number, upLeft: number): number {
  const repeat = repeatVector(east, upLeft);
  if (!repeat) return 0;

  const here = world(q, r);
  const along = world(repeat.q, repeat.r);
  const lengthSquared = along.x * along.x + along.y * along.y;
  if (lengthSquared === 0) return 0;

  const projection = -(here.x * along.x + here.y * along.y) / lengthSquared;
  const bandsToCentre = Math.floor(projection + HALF_UP);
  return bandsToCentre === 0 ? 0 : -bandsToCentre; // Never give -0 as a result.
}

/** Returns true if this hex is the instance of its note nearest to the centre
 *  of the grid. */
export function isPrimaryInstance(q: number, r: number, east: number, upLeft: number): boolean {
  return repeatIndex(q, r, east, upLeft) === 0;
}

/** Counts the steps between the notes that a layout can reach. A result of 1
 *  shows that the layout reaches all notes. */
export function latticeStride(east: number, upLeft: number): number {
  if (east === 0 || upLeft === 0) return 1;
  return gcd(Math.abs(east), Math.abs(upLeft));
}

/**
 * Calculates the offset that moves each repeated band one period above the
 * band before it. The band then plays new pitches, not the same notes again.
 *
 * The sign of the offset is important. The pitch increases across a band. The
 * repeat vector is the direction in which the pitch does not change. An
 * addition of one period for each band in that direction continues the
 * increase. An addition in the opposite direction cancels it.
 *
 * This is the function that increases the range. On a computer keyboard in
 * 12 TET Wicki-Hayden, the range increases from 3.8 octaves to 5.8 octaves.
 * Each band keeps the same finger positions and the same pitch classes. Thus
 * the notes stay diatonic.
 */
export function octaveOffset(q: number, r: number, east: number, upLeft: number, size: number): number {
  return repeatIndex(q, r, east, upLeft) * size;
}

/**
 * Calculates the offset that makes the duplicate bands play the notes that the
 * main area does not reach. The result is 0 for a layout that reaches all
 * notes.
 */
export function reallocationOffset(q: number, r: number, east: number, upLeft: number): number {
  const stride = latticeStride(east, upLeft);
  if (stride <= 1) return 0;
  return mod(repeatIndex(q, r, east, upLeft), stride);
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Calculates the offset of a hex from its geometric step, for a given mode. */
export function bandOffset(
  q: number,
  r: number,
  east: number,
  upLeft: number,
  size: number,
  mode: BandMode
): number {
  switch (mode) {
    case "octave":
      return octaveOffset(q, r, east, upLeft, size);
    case "fill":
      return reallocationOffset(q, r, east, upLeft);
    case "repeat":
      return 0;
  }
}

/**
 * Returns true if this hex plays a note that the main area also plays.
 *
 * This is the only condition in which the code makes a hex grey. In each other
 * condition the hex plays a note that no other hex plays.
 */
export function isEcho(q: number, r: number, east: number, upLeft: number, size: number, mode: BandMode): boolean {
  return bandOffset(q, r, east, upLeft, size, mode) === 0 && repeatIndex(q, r, east, upLeft) !== 0;
}
