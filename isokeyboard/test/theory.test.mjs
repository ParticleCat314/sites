/**
 * The unit tests for the music-theory core. These tests use no DOM and no
 * audio.
 *
 * To run them, use `node --test test/theory.test.mjs` or `npm test`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const {
  apotome,
  centsAt,
  degreeNames,
  equalSpec,
  frequency,
  makeTuning,
  nearestStep,
  perfectFifth,
  referenceStep,
  stepRange,
  stepsForSemitone,
  centsForRatio,
  TRITAVE_CENTS
} = await import(join(dist, "core/tuning.js"));
const { TUNING_PRESETS, findPreset } = await import(join(dist, "core/tuning-library.js"));
const { getScale, scaleDegrees } = await import(join(dist, "core/scales.js"));
const { LAYOUTS, isLayoutUsable, usableLayout } = await import(join(dist, "core/layouts.js"));
const { nearestRatio, formatRatio, formatError } = await import(join(dist, "core/ratios.js"));
const { isMos, mosDegrees, mosNoteCounts, defaultGenerator } = await import(join(dist, "core/mos.js"));
const { parseScala } = await import(join(dist, "core/scala.js"));
const { sustainedRelease } = await import(join(dist, "audio/synth.js"));
const { repeatVector, isPrimaryInstance, repeatIndex, latticeStride, reallocationOffset, octaveOffset } =
  await import(join(dist, "core/lattice.js"));
const { migrateRows, DEFAULT_ROWS, MAP_ROWS, MAP_COLS, defaultSettings } = await import(
  join(dist, "state/settings.js")
);
const { buildModel, octaveShiftRange } = await import(join(dist, "state/model.js"));

const edo = (n) => makeTuning(equalSpec(n));
const sorted = (set) => [...set].sort((a, b) => a - b);

test("equal tunings divide the period evenly", () => {
  assert.equal(edo(12).size, 12);
  assert.equal(centsAt(edo(12), 1), 100);
  assert.equal(centsAt(edo(31), 31), 1200);
  assert.equal(edo(12).octaveBased, true);
});

test("12 TET lands on the familiar frequencies", () => {
  const t = edo(12);
  assert.equal(referenceStep(t), 69); // A4 is MIDI note 69.
  assert.equal(frequency(t, 69, 440), 440);
  assert.ok(Math.abs(frequency(t, 60, 440) - 261.6256) < 0.001); // Middle C.
});

test("intervals are approximated by ratio, not by rescaled semitones", () => {
  assert.equal(perfectFifth(edo(12)), 7);
  assert.equal(perfectFifth(edo(31)), 18);
  assert.equal(perfectFifth(edo(19)), 11);
  assert.equal(stepsForSemitone(edo(31), 4), 10); // An almost pure major third.
  assert.equal(stepsForSemitone(edo(31), 12), 31); // One octave stays one octave.
  assert.equal(apotome(edo(12)), 1);
  assert.equal(apotome(edo(31)), 2);
});

test("note names come from the chain of fifths", () => {
  assert.deepEqual(degreeNames(edo(12)), ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]);
  assert.deepEqual(degreeNames(edo(7)), ["C", "D", "E", "F", "G", "A", "B"]);
  const names31 = degreeNames(edo(31));
  assert.deepEqual(names31.slice(0, 6), ["C", "C↑", "C♯", "D♭", "D♭↑", "D"]);
  assert.equal(degreeNames(edo(24))[1], "C↑"); // A quarter tone uses an up mark.
});

test("scales keep their harmonic meaning in every tuning", () => {
  const major = getScale("major");
  assert.deepEqual(sorted(scaleDegrees(edo(12), major, 0)), [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(sorted(scaleDegrees(edo(31), major, 0)), [0, 5, 10, 13, 18, 23, 28]);
  assert.deepEqual(sorted(scaleDegrees(edo(19), major, 0)), [0, 3, 6, 8, 11, 14, 17]);
  // A different root moves each degree of the set.
  assert.deepEqual(sorted(scaleDegrees(edo(12), major, 2)), [1, 2, 4, 6, 7, 9, 11]);
  assert.equal(scaleDegrees(edo(12), getScale("chromatic"), 0), null);
});

test("layouts derive their vectors from the tuning", () => {
  const wicki = LAYOUTS.find((l) => l.id === "wicki");
  assert.deepEqual(wicki.vectors(edo(12)), { east: 2, upLeft: 5 });
  assert.deepEqual(wicki.vectors(edo(31)), { east: 5, upLeft: 13 });
  // The north-east neighbour is a fifth in each tuning.
  for (const n of [12, 19, 22, 31, 53]) {
    const v = wicki.vectors(edo(n));
    assert.equal(v.east + v.upLeft, perfectFifth(edo(n)), `${n} EDO`);
  }
});

test("MOS scales have exactly two step sizes", () => {
  assert.ok(isMos(12, 7, 7)); // The diatonic scale.
  assert.deepEqual(sorted(mosDegrees(12, 7, 7, 0, 0)), [0, 2, 4, 6, 7, 9, 11]); // Mode 0 is lydian.
  assert.deepEqual(sorted(mosDegrees(12, 7, 7, 0, 1)), [0, 2, 4, 5, 7, 9, 11]); // Mode 1 is ionian.
  assert.deepEqual(sorted(mosDegrees(12, 7, 7, 0, 4)), [0, 2, 3, 5, 7, 8, 10]); // Mode 4 is aeolian.
  assert.deepEqual(sorted(mosDegrees(12, 7, 7, 0, 6)), [0, 1, 3, 5, 6, 8, 10]); // Mode 6 is locrian, the darkest mode.
  assert.ok(isMos(12, 7, 5)); // The pentatonic scale.
  assert.ok(!isMos(12, 7, 6)); // Three step sizes. This is not a MOS scale.
  assert.ok(isMos(22, 3, 7)); // The porcupine[7] scale. It has no 12-TET equivalent.
  assert.ok(mosNoteCounts(12, 7).includes(7));
  assert.equal(defaultGenerator(edo(12)), 5); // The fifth, reduced below one half of an octave.
});

test("non-octave tunings work end to end", () => {
  const bp = makeTuning(equalSpec(13, TRITAVE_CENTS));
  assert.equal(bp.size, 13);
  assert.equal(bp.octaveBased, false);
  assert.ok(Math.abs(centsAt(bp, 13) - TRITAVE_CENTS) < 0.001);
  assert.deepEqual(degreeNames(bp).slice(0, 3), ["0", "1", "2"]); // The names are numbers, not letters.
  const range = stepRange(bp, 440);
  assert.ok(frequency(bp, range.lo, 440) >= 16 && frequency(bp, range.hi, 440) <= 8400);
});

test("unequal tunings keep their exact degrees", () => {
  const just = makeTuning(findPreset(makeTuning(TUNING_PRESETS.find((p) => p.id === "just-5limit").spec).id).spec);
  assert.equal(just.size, 12);
  assert.ok(Math.abs(centsAt(just, 7) - 701.955) < 0.01); // A pure fifth.
  assert.ok(Math.abs(centsAt(just, 4) - 386.314) < 0.01); // A pure major third.
  assert.equal(perfectFifth(just), 7);
  assert.deepEqual(degreeNames(just).slice(0, 3), ["C", "C♯", "D"]);
});

test("nearestStep snaps to the closest degree, across periods", () => {
  const t = edo(12);
  assert.equal(nearestStep(t, 0), 0);
  assert.equal(nearestStep(t, 701.955), 7);
  assert.equal(nearestStep(t, 1190), 12); // The result moves up into the next period.
  assert.equal(nearestStep(t, 2400), 24);
});

test("Scala files parse into exact tunings", () => {
  const spec = parseScala(["! major.scl", "!", "Pure major", " 7", " 9/8", " 5/4", " 4/3", " 3/2", " 5/3", " 15/8", " 2/1"].join("\n"));
  assert.equal(spec.kind, "scale");
  assert.equal(spec.name, "Pure major");
  assert.equal(spec.periodCents, 1200);
  assert.equal(spec.cents.length, 7); // 1/1 and six degrees. The period is not a degree.
  const tuning = makeTuning(spec);
  assert.ok(Math.abs(centsAt(tuning, 4) - 701.955) < 0.001);

  // Cents values, comment lines, and extra text after a value.
  const cents = parseScala("!x\nCents test\n2\n350.0 comment\n1200.000\n");
  assert.deepEqual(makeTuning(cents).degreeCents, [0, 350]);

  assert.throws(() => parseScala("only one line"), /too few lines/);
  assert.throws(() => parseScala("name\nnot-a-number\n"), /Bad degree count/);
});

test("a blank Scala description is a description, not a missing line", () => {
  // Many files in the Scala archive have an empty description. If the code
  // removed that blank line, it would read the degree count from the first
  // degree.
  const blank = parseScala(["! blank.scl", "!", "", " 5", " 100.0", " 200.0", " 300.0", " 400.0", " 1200.0"].join("\n"),
    "blank");
  assert.equal(blank.name, "blank"); // The file gives no name, thus the code uses the fallback name.
  assert.equal(blank.periodCents, 1200);
  assert.deepEqual(makeTuning(blank).degreeCents, [0, 100, 200, 300, 400]);

  // A description of spaces only is also blank after the code trims it.
  assert.equal(parseScala(["  ", "1", "1200.0"].join("\n"), "fallback").name, "fallback");

  // The code continues to ignore a blank line between the degrees.
  const gappy = parseScala(["Gappy", "2", "", " 350.0", "", " 1200.0", ""].join("\n"));
  assert.deepEqual(makeTuning(gappy).degreeCents, [0, 350]);
});

test("every preset builds a usable tuning", () => {
  for (const preset of TUNING_PRESETS) {
    const tuning = makeTuning(preset.spec);
    assert.ok(tuning.size >= 2, preset.id);
    assert.equal(tuning.degreeCents[0], 0, preset.id);
    assert.ok(tuning.degreeCents.every((c, i, all) => i === 0 || c > all[i - 1]), `${preset.id} ascends`);
    assert.ok(tuning.degreeCents.every((c) => c < tuning.periodCents), `${preset.id} is period-reduced`);
    assert.equal(findPreset(tuning.id)?.id, preset.id, `${preset.id} round-trips`);
    assert.equal(degreeNames(tuning).length, tuning.size, preset.id);
  }
});

test("layouts that would run backwards are replaced", () => {
  const bp = makeTuning(equalSpec(13, TRITAVE_CENTS));
  const wicki = LAYOUTS.find((l) => l.id === "wicki");
  assert.ok(!isLayoutUsable(wicki.vectors(bp)), "Wicki-Hayden's east axis is negative in Bohlen-Pierce");

  const { layout, requested } = usableLayout("wicki", bp);
  assert.equal(requested.id, "wicki");
  assert.notEqual(layout.id, "wicki");
  assert.ok(isLayoutUsable(layout.vectors(bp)));

  // The code keeps the layout where the layout is usable.
  assert.equal(usableLayout("wicki", edo(31)).layout.id, "wicki");
});

test("just ratios are named within the odd limit", () => {
  const fifth = nearestRatio(701.955, 9);
  assert.equal(formatRatio(fifth), "3/2");
  assert.ok(Math.abs(fifth.error) < 0.01);

  assert.equal(formatRatio(nearestRatio(386.314, 5)), "5/4");
  assert.equal(formatRatio(nearestRatio(400, 5)), "5/4"); // 12-TET major third
  assert.equal(formatError(nearestRatio(400, 5)), "+13.7¢");

  // The odd limit controls the permitted names.
  assert.equal(formatRatio(nearestRatio(968.826, 7)), "7/4");
  assert.notEqual(formatRatio(nearestRatio(968.826, 5)), "7/4");

  // An interval of more than one octave gets the name of its reduced form.
  assert.equal(formatRatio(nearestRatio(1200 + 701.955, 9)), "3/2");
  assert.equal(formatRatio(nearestRatio(0, 9)), "1/1");
});

test("well temperaments close the circle of fifths", () => {
  for (const id of ["werckmeister3", "young2", "kirnberger3"]) {
    const tuning = makeTuning(TUNING_PRESETS.find((p) => p.id === id).spec);
    assert.equal(tuning.size, 12, id);
    assert.equal(degreeNames(tuning)[0], "C", id);
  }
  // The pure C-E third defines Kirnberger III.
  const kirnberger = makeTuning(TUNING_PRESETS.find((p) => p.id === "kirnberger3").spec);
  assert.ok(Math.abs(centsAt(kirnberger, 4) - 386.314) < 0.01, `${centsAt(kirnberger, 4)}`);
  // In Werckmeister III, C-G is one quarter comma narrow.
  const werck = makeTuning(TUNING_PRESETS.find((p) => p.id === "werckmeister3").spec);
  assert.ok(Math.abs(centsAt(werck, 7) - 696.09) < 0.01, `${centsAt(werck, 7)}`);
});

test("the world tunings load with the right sizes", () => {
  const sizes = { "maqam-rast": 7, slendro: 5, pelog: 7, partch43: 43, harmonics: 8 };
  for (const [id, size] of Object.entries(sizes)) {
    const tuning = makeTuning(TUNING_PRESETS.find((p) => p.id === id).spec);
    assert.equal(tuning.size, size, id);
  }
  // The gamut of Partch contains the ratios that define it.
  const partch = makeTuning(TUNING_PRESETS.find((p) => p.id === "partch43").spec);
  for (const cents of [centsForRatio(11 / 8), centsForRatio(7 / 4), centsForRatio(3 / 2)]) {
    assert.ok(partch.degreeCents.some((c) => Math.abs(c - cents) < 0.01), `${cents.toFixed(2)}¢`);
  }
});

test("an older key mapping survives the bigger grid", () => {
  const old = [
    ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", null, null],
    ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", null],
    ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
    ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"]
  ];
  const rows = migrateRows(old);
  assert.equal(rows.length, MAP_ROWS);
  assert.ok(rows.every((row) => row.length === MAP_COLS));
  // Each old assignment keeps its exact position.
  assert.equal(rows[0][0], "KeyZ");
  assert.equal(rows[3][11], "Equal");
  // Each new cell takes the current default value.
  assert.equal(rows[1][11], "Enter");
  assert.equal(rows[4][0], "F1");

  // The code keeps a mapping of the user. It does not use a key code twice.
  const custom = old.map((row) => row.slice());
  custom[0][10] = "Enter";
  const migrated = migrateRows(custom);
  assert.equal(migrated[0][10], "Enter");
  assert.equal(migrated[1][11], null, "Enter is not handed out twice");

  // Invalid data gives the default mapping.
  assert.deepEqual(migrateRows([]), DEFAULT_ROWS);
});

test("every note has exactly one primary hex", () => {
  assert.deepEqual(repeatVector(2, 5), { q: 5, r: 2 }); // 12 TET Wicki-Hayden
  assert.deepEqual(repeatVector(4, 10), { q: 5, r: 2 }); // reduced by the gcd
  assert.equal(repeatVector(0, 5), null);

  // The repeat vector gives the same note.
  const east = 2;
  const upLeft = 5;
  const v = repeatVector(east, upLeft);
  const stepAt = (q, r) => east * q - upLeft * r;
  assert.equal(stepAt(v.q, v.r), 0);

  // Across a large area of the grid, each note has one primary instance.
  const primaries = new Map();
  const instances = new Map();
  for (let r = -14; r <= 14; r++) {
    for (let q = -14; q <= 14; q++) {
      const step = stepAt(q, r);
      instances.set(step, (instances.get(step) ?? 0) + 1);
      if (isPrimaryInstance(q, r, east, upLeft)) primaries.set(step, (primaries.get(step) ?? 0) + 1);
    }
  }
  // The test examines a step only if the area contains several instances of
  // it. For a step near the edge, the primary instance can be outside the
  // area.
  let checked = 0;
  for (const [step, count] of instances) {
    if (count < 3) continue;
    assert.equal(primaries.get(step), 1, `step ${step} has ${primaries.get(step)} primaries`);
    checked++;
  }
  assert.ok(checked > 20, `only ${checked} steps had enough instances to check`);

  assert.ok(isPrimaryInstance(0, 0, east, upLeft), "the centre is always primary");
  assert.ok(!isPrimaryInstance(5, 2, east, upLeft), "one repeat away is a duplicate");
  assert.ok(!isPrimaryInstance(-5, -2, east, upLeft));
});

test("spare bands can cover the notes a layout skips", () => {
  const wicki = LAYOUTS.find((l) => l.id === "wicki");

  // In 12 TET the layout reaches each step. In 24 EDO Wicki-Hayden reaches
  // every second step.
  const twelve = wicki.vectors(edo(12));
  assert.equal(latticeStride(twelve.east, twelve.upLeft), 1);
  const quarter = wicki.vectors(edo(24));
  assert.deepEqual(quarter, { east: 4, upLeft: 10 });
  assert.equal(latticeStride(quarter.east, quarter.upLeft), 2);

  const { east, upLeft } = quarter;
  const plain = new Set();
  const filled = new Set();
  for (let r = -12; r <= 12; r++) {
    for (let q = -12; q <= 12; q++) {
      const base = east * q - upLeft * r;
      plain.add(((base % 24) + 24) % 24);
      filled.add(((base + reallocationOffset(q, r, east, upLeft)) % 24 + 24) % 24);
    }
  }
  assert.equal(plain.size, 12, "without reallocation only half the degrees appear");
  assert.ok([...plain].every((degree) => degree % 2 === 0), "and they are all even");
  assert.equal(filled.size, 24, "with it, every degree of 24 EDO is reachable");

  // The code never changes the main area, at each value of the stride.
  assert.equal(reallocationOffset(0, 0, east, upLeft), 0);
  assert.equal(repeatIndex(0, 0, east, upLeft), 0);
  assert.ok(isPrimaryInstance(0, 0, east, upLeft));

  // The code does not change a layout that reaches each note.
  for (let r = -4; r <= 4; r++) {
    for (let q = -4; q <= 4; q++) {
      assert.equal(reallocationOffset(q, r, twelve.east, twelve.upLeft), 0, `${q},${r}`);
    }
  }

  // The bands at one repeat play the odd degrees. The bands at two repeats
  // play the same notes as the main area.
  const v = repeatVector(east, upLeft);
  assert.equal(reallocationOffset(v.q, v.r, east, upLeft), 1);
  assert.equal(reallocationOffset(2 * v.q, 2 * v.r, east, upLeft), 0);
});

test("octave bands widen the range without changing a scale degree", () => {
  const wicki = LAYOUTS.find((l) => l.id === "wicki");
  const { east, upLeft } = wicki.vectors(edo(12));
  const size = 12;
  const v = repeatVector(east, upLeft);
  const stepAt = (q, r) => east * q - upLeft * r + octaveOffset(q, r, east, upLeft, size);

  // The code does not change the main area. Each subsequent band is one
  // period above the band before it.
  assert.equal(octaveOffset(0, 0, east, upLeft, size), 0);
  assert.equal(stepAt(v.q, v.r) - stepAt(0, 0), size, "the next band is a period up");
  assert.equal(stepAt(-v.q, -v.r) - stepAt(0, 0), -size, "and the one below is a period down");

  // Each hex keeps its pitch class. Thus a diatonic mask does not change.
  for (let r = -10; r <= 10; r++) {
    for (let q = -10; q <= 10; q++) {
      const base = east * q - upLeft * r;
      assert.equal(((stepAt(q, r) % 12) + 12) % 12, ((base % 12) + 12) % 12, `${q},${r} changed pitch class`);
    }
  }

  // The increase is visible on the key grid, where the range is small. That
  // grid has 5 rows of 14 cells. The centre note is at row 1, column 5.
  const reach = (offsetting) => {
    const steps = new Set();
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 14; col++) {
        const q = col - 5;
        const r = -(row - 1);
        steps.add(east * q - upLeft * r + (offsetting ? octaveOffset(q, r, east, upLeft, size) : 0));
      }
    }
    return { count: steps.size, span: Math.max(...steps) - Math.min(...steps) };
  };
  const plain = reach(false);
  const octaves = reach(true);
  assert.ok(octaves.span > plain.span, `span ${plain.span} -> ${octaves.span}`);
  assert.ok(octaves.count > plain.count, `notes ${plain.count} -> ${octaves.count}`);
  assert.ok(octaves.span / size >= 5, `only ${(octaves.span / size).toFixed(1)} octaves`);
});

test("the octave shift moves the grid, and only as far as it can sound", () => {
  const settings = defaultSettings(); // 12 TET, centre D4
  const plain = buildModel(settings);
  const up = buildModel(settings, 2);

  // The shift is in the grid. Thus the centre hex plays the note that sounds.
  assert.equal(up.centerStep - plain.centerStep, 2 * plain.tuning.size);
  assert.ok(Math.abs(up.frequency(up.centerStep) / plain.frequency(plain.centerStep) - 4) < 1e-9);
  // Thus the label and the pitch always agree.
  assert.equal(up.name(up.centerStep), plain.name(plain.centerStep));
  assert.equal(up.register(up.centerStep), plain.register(plain.centerStep) + 2);
  // A shift of one period does not move the scale.
  assert.equal(up.scaleRoot, plain.scaleRoot);

  // The limit keeps the centre note inside the audible band.
  const range = octaveShiftRange(settings, 6);
  assert.ok(range.max >= 1 && range.min <= -1, `${range.min}..${range.max}`);
  for (const shift of [range.min, 0, range.max]) {
    const shifted = buildModel(settings, shift);
    assert.ok(
      shifted.centerStep >= shifted.minStep && shifted.centerStep <= shifted.maxStep,
      `shift ${shift} puts the centre outside the audible range`
    );
  }
  // One period more moves the centre note out of that band.
  const tooHigh = buildModel(settings, range.max + 1);
  assert.ok(tooHigh.centerStep > tooHigh.maxStep, "the bound is not tight");

  // The ceiling limits the shift at each width of the band.
  assert.deepEqual(octaveShiftRange(settings, 1), { min: -1, max: 1 });
  assert.deepEqual(octaveShiftRange(settings, 0), { min: 0, max: 0 });
});

test("sustained notes ring longer the lower they are", () => {
  assert.equal(sustainedRelease(14, 440), 14); // the reference pitch is the baseline
  assert.ok(Math.abs(sustainedRelease(14, 110) - 28) < 0.001, "two octaves down rings twice as long");
  assert.ok(Math.abs(sustainedRelease(14, 1760) - 7) < 0.001, "two octaves up, half as long");
  assert.ok(sustainedRelease(14, 27.5) <= 14 * 2.5, "clamped so the bass does not ring forever");
  assert.ok(sustainedRelease(14, 8000) >= 14 * 0.45, "and the treble still gets a tail");
  // A piano pedal must give a release of several seconds.
  assert.ok(sustainedRelease(14, 261.6) > 10, `${sustainedRelease(14, 261.6).toFixed(1)}s at middle C`);
});
