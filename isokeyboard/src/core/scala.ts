/**
 * The Scala (.scl) file format. This is the usual exchange format for tunings.
 *
 * A `!` character starts a comment line. The first line after the comments is
 * a description. The description is frequently blank, which is permitted. The
 * second line is the degree count. Each subsequent line that is not blank
 * gives one degree.
 *
 * A degree is in cents if it contains a `.` character. If not, the degree is a
 * ratio, such as `3/2`, or an integer.
 *
 * The list does not include 1/1, and the last degree is the period. Thus a
 * 12-note octave scale has 12 lines, and the last line is `2/1` or `1200.0`.
 */

import { centsForRatio, type TuningSpec } from "./tuning.js";

export function parseScala(text: string, fallbackName = "Imported scale"): TuningSpec {
  // The code removes the blank lines after the two header lines only. A file
  // with a blank description is permitted. If the code removed that blank line
  // first, it would read the degree count from the first degree.
  const lines = withoutComments(text);
  if (lines.length < 2) throw new Error("Not a Scala file: too few lines.");

  const [description, countLine, ...rest] = lines;
  const count = parseCount(countLine);

  const degreeLines = rest.filter((line) => line.length > 0).slice(0, count);
  if (degreeLines.length < count) {
    throw new Error(`Expected ${count} degrees, found ${degreeLines.length}.`);
  }
  const degrees = degreeLines.map(parseDegree);

  const period = degrees[degrees.length - 1];
  if (!(period > 0)) throw new Error("The last degree (the period) must be above 0¢.");

  return {
    kind: "scale",
    name: description === "" ? fallbackName : description,
    periodCents: period,
    // The file lists the degrees above 1/1 and ends with the period. This
    // list starts at 0 and ends below the period.
    cents: [0, ...degrees.slice(0, -1)]
  };
}

/** Gives each line without its outer spaces. Removes the `!` comment lines.
 *  Keeps the blank lines. */
function withoutComments(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("!"));
}

function parseCount(line: string): number {
  const count = Number.parseInt(line, 10);
  if (!Number.isFinite(count) || count < 1) throw new Error(`Bad degree count: "${line}"`);
  return count;
}

function parseDegree(line: string): number {
  const token = line.split(/\s+/)[0];
  if (token.includes(".")) {
    const cents = Number.parseFloat(token);
    if (!Number.isFinite(cents)) throw new Error(`Bad cents value: "${token}"`);
    return cents;
  }
  const [numerator, denominator = "1"] = token.split("/");
  const ratio = Number.parseInt(numerator, 10) / Number.parseInt(denominator, 10);
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`Bad ratio: "${token}"`);
  return centsForRatio(ratio);
}
