/**
 * The end-to-end smoke test. It starts the application in jsdom with a
 * substitute AudioContext. It then operates the header controls and the
 * settings dialog.
 *
 * To run it, use `npm test`. That command builds the code first.
 *
 * The test is intentionally wide and not deep. It finds a connection error.
 * Three examples are a changed element id, a listener that the code does not
 * attach, and a rebuild that does not draw the grid. A type checker cannot
 * find these errors.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");

const { window } = new JSDOM(html, { pretendToBeVisual: true, url: "http://localhost/" });

// ---------- substitutes for the functions that jsdom does not have ----------
const startedFrequencies = [];

class FakeParam {
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  cancelScheduledValues() {}
}

const audioNode = (extra = {}) => ({ connect: (target) => target, ...extra });

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = "running";
    this.destination = audioNode();
  }
  resume() {}
  createGain() {
    return audioNode({ gain: new FakeParam(1) });
  }
  createDelay() {
    return audioNode({ delayTime: new FakeParam() });
  }
  createBiquadFilter() {
    return audioNode({ type: "", Q: new FakeParam(), frequency: new FakeParam() });
  }
  createDynamicsCompressor() {
    return audioNode({ threshold: new FakeParam(), ratio: new FakeParam() });
  }
  createOscillator() {
    const osc = audioNode({
      type: "",
      frequency: new FakeParam(),
      detune: new FakeParam(),
      start: () => startedFrequencies.push(osc.frequency.value),
      stop: () => {}
    });
    return osc;
  }
  createBufferSource() {
    return audioNode({ playbackRate: new FakeParam(), start: () => {}, stop: () => {} });
  }
}

window.AudioContext = FakeAudioContext;
window.fetch = () => Promise.reject(new Error("no network in tests"));
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 1200 });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get: () => 700 });
window.document.elementFromPoint = () => null;
window.navigator.clipboard = { writeText: () => Promise.resolve() };

// A substitute MIDI port. The test uses it to operate the complete input path.
const midiPort = { name: "Test Controller", onmidimessage: null };
window.navigator.requestMIDIAccess = () =>
  Promise.resolve({ inputs: new Map([["1", midiPort]]), onstatechange: null });
const midi = (...bytes) => midiPort.onmidimessage?.({ data: Uint8Array.from(bytes) });

for (const key of ["window", "document", "navigator", "HTMLElement", "KeyboardEvent", "Event", "getComputedStyle"]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}
globalThis.localStorage = window.localStorage;
globalThis.AudioContext = FakeAudioContext;
// The modules use the global fetch function, not window.fetch. Without this
// line the piano sampler starts a real network request.
globalThis.fetch = window.fetch;

// ---------- the test tools ----------
const failures = [];
const check = (label, condition, detail = "") => {
  if (!condition) failures.push(label);
  console.log(`${condition ? "ok  " : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};
const $ = (id) => window.document.getElementById(id);
const hexCount = () => window.document.querySelectorAll("g.hex").length;
const press = (code, extra = {}) => {
  const event = new window.KeyboardEvent("keydown", { code, key: "x", bubbles: true, cancelable: true, ...extra });
  window.dispatchEvent(event);
  return event;
};
const release = (code) => window.dispatchEvent(new window.KeyboardEvent("keyup", { code, bubbles: true }));
/** The capture mode changes asynchronously, because of the fullscreen mode
 *  and the key lock. This function waits for the change. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const click = (id) => $(id).dispatchEvent(new window.Event("click", { bubbles: true }));
const change = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new window.Event("change"));
};
/** Makes a change with the mouse. The test sends a pointerdown event to the
 *  control and then a change event. */
const clickChange = (id, value) => {
  $(id).dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  $(id).focus();
  $(id).value = value;
  $(id).dispatchEvent(new window.Event("change", { bubbles: true }));
};

const { makeTuning } = await import(join(root, "dist/core/tuning.js"));
const { App } = await import(join(root, "dist/app.js"));
const app = new App();
app.start();

// ---------- 12 TET ----------
check("grid is drawn", hexCount() > 50, `${hexCount()} hexes`);
check("tuning presets listed", $("tuningSel").options.length > 10);
check("scales are grouped", $("scaleSel").querySelectorAll("optgroup").length >= 5);
check("roots are named", $("rootSel").options.length === 12 && $("rootSel").options[1].textContent === "C♯");
check("the root select stays live while it drives the centre", $("rootSel").disabled === false);
check("footer describes the board", /12 EDO · fifth 7 steps/.test($("boardInfo").textContent), $("boardInfo").textContent);

press("KeyH"); // The physical H key is on the centre note. That note is D4 by default.
check("a key sounds at the right pitch", Math.abs(startedFrequencies[0] - 293.66) < 0.1, `${startedFrequencies[0]?.toFixed(2)} Hz`);
check("its hex lights up", window.document.querySelectorAll("g.hex.active").length > 0);
release("KeyH");
check("its hex goes dark", window.document.querySelectorAll("g.hex.active").length === 0);

// ---------- the centre note is the tonic ----------
check("the root starts on the centre note", app.model.scaleRoot === app.settings.centerDegree);
click("settingsBtn");
await settle();
change("centerDegSel", "4"); // Move the centre from D to E.
check("moving the centre moves the root", app.model.scaleRoot === 4 && app.model.names[app.model.scaleRoot] === "E");
check("and the centre reads as 0¢ from the root", app.model.centsFromRoot(app.model.centerStep) === 0);
click("closeSettings");
await settle();
check("the header root follows", $("rootSel").value === "4");

change("scaleSel", "major");
check("the scale is rooted on the centre",
  app.model.inScale(app.model.centerStep) && app.model.maskedDegrees.has(4), [...app.model.maskedDegrees].sort((a, b) => a - b).join(" "));
check("the footer says so", /on E/.test($("boardInfo").textContent), $("boardInfo").textContent);

// A selection of a root in the header also moves the centre.
change("rootSel", "7");
check("choosing a root moves the centre", app.settings.centerDegree === 7 && app.model.scaleRoot === 7,
  `centre degree ${app.settings.centerDegree}`);
check("the grid transposed with it", app.model.name(app.model.centerStep) === "G");

// With no link, the root and the centre are independent.
click("settingsBtn");
await settle();
$("rootFollowsIn").checked = false;
$("rootFollowsIn").dispatchEvent(new window.Event("change"));
check("unlinking keeps the root where it sounded", app.model.scaleRoot === 7);
change("centerDegSel", "0");
check("now the centre moves alone", app.model.scaleRoot === 7 && app.settings.centerDegree === 0);
$("rootFollowsIn").checked = true;
$("rootFollowsIn").dispatchEvent(new window.Event("change"));
check("relinking snaps the root back to the centre", app.model.scaleRoot === 0);
change("centerDegSel", "2"); // Set the centre back to D for the subsequent tests.
click("closeSettings");
await settle();
change("scaleSel", "chromatic");

// ---------- 31 EDO ----------
change("tuningSel", "edo-31");
check(
  "31 EDO retunes the layout",
  app.model.tuning.size === 31 && app.model.vectors.east === 5 && app.model.vectors.upLeft === 13,
  `east=${app.model.vectors.east} upLeft=${app.model.vectors.upLeft}`
);
check("31 EDO redraws the grid", hexCount() > 50, `${hexCount()} hexes`);
check("31 EDO relists the roots", $("rootSel").options.length === 31);

startedFrequencies.length = 0;
press("KeyH");
check("31 EDO still plays", startedFrequencies.length > 0, `${startedFrequencies[0]?.toFixed(2)} Hz`);
release("KeyH");

// ---------- scale masking ----------
change("scaleSel", "major");
check("root becomes selectable", $("rootSel").disabled === false);
const muted = window.document.querySelectorAll("g.hex.muted").length;
const total = hexCount();
check("out-of-scale hexes are masked", muted > 0 && muted < total, `${muted}/${total} masked`);
check("about 7 of 31 notes survive", Math.abs((total - muted) / total - 7 / 31) < 0.06, ((total - muted) / total).toFixed(3));

const outOfScale = ["KeyG", "KeyJ", "KeyK", "KeyD", "KeyF"].find((code) => {
  const step = app.stepForCode(code);
  return step !== null && !app.model.inScale(step);
});
startedFrequencies.length = 0;
press(outOfScale);
check("out-of-scale key is silent", startedFrequencies.length === 0, outOfScale);
release(outOfScale);

change("outScaleSel", "quiet");
startedFrequencies.length = 0;
press(outOfScale);
check("…but plays when set to playable", startedFrequencies.length > 0);
release(outOfScale);

// ---------- MOS scales ----------
change("scaleSel", "mos");
check("MOS controls appear", $("mosGroup").hidden === false);
check("generators are offered", $("mosGenSel").options.length === 15, `${$("mosGenSel").options.length} generators for 31 EDO`);
change("mosGenSel", "13"); // 13\31, the meantone fourth
change("mosNotesSel", "7");
check("MOS mask has the requested size", app.model.maskedDegrees.size === 7, `${app.model.maskedDegrees.size} notes`);
check("MOS is described", /7-note MOS, generator 13\\31/.test($("boardInfo").textContent), $("boardInfo").textContent);
change("scaleSel", "major");
check("MOS controls hide again", $("mosGroup").hidden === true);

// ---------- a non-octave tuning ----------
change("tuningSel", "bohlen-pierce");
check("Bohlen–Pierce loads", app.model.tuning.size === 13 && Math.abs(app.model.tuning.periodCents - 1901.955) < 0.01,
  `${app.model.tuning.size} degrees, period ${app.model.tuning.periodCents.toFixed(2)}¢`);
check("non-octave degrees are numbered", $("rootSel").options[1].textContent === "1");
check("the octave control becomes a period control", $("octTag").textContent === "Period");
startedFrequencies.length = 0;
press("KeyH");
check("Bohlen–Pierce plays near the old centre pitch", startedFrequencies[0] > 200 && startedFrequencies[0] < 400,
  `${startedFrequencies[0]?.toFixed(2)} Hz`);
release("KeyH");
change("tuningSel", "edo-31");

// ---------- an imported Scala tuning ----------
const { parseScala } = await import(join(root, "dist/core/scala.js"));
const { retune } = await import(join(root, "dist/state/settings.js"));
retune(app.settings, parseScala("! test.scl\n!\nPure major\n 7\n 9/8\n 5/4\n 4/3\n 3/2\n 5/3\n 15/8\n 2/1\n"));
app.apply();
check("a Scala scale becomes the tuning", app.model.tuning.size === 7 && app.model.names[0] === "C",
  `${app.model.tuning.size} degrees, "${app.model.tuning.name}"`);
check("its degrees keep their exact cents", Math.abs(app.model.cents(4) - 701.955) < 0.01, `${app.model.cents(4).toFixed(3)}¢`);
startedFrequencies.length = 0;
press("KeyH");
check("the imported tuning plays", startedFrequencies.length > 0, `${startedFrequencies[0]?.toFixed(2)} Hz`);
release("KeyH");
change("tuningSel", "edo-31");

// ---------- pointer hit-testing is geometric, not DOM-based ----------
const stageRect = $("stage").getBoundingClientRect();
check("the centre of the stage is the centre note",
  app.board.stepAt(stageRect.left + stageRect.width / 2, stageRect.top + stageRect.height / 2) === app.model.centerStep);

// ---------- ratio labels and the interval readout ----------
$("settingsBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
change("labelSel", "ratios");
$("closeSettings").dispatchEvent(new window.Event("click", { bubbles: true }));
check("ratio labels are drawn", /^\d+\/\d+$/.test(window.document.querySelector("g.hex text")?.textContent ?? ""),
  window.document.querySelector("g.hex text")?.textContent);

press("KeyH");
press("KeyK");
check("the readout names the held interval", /\d+\/\d+/.test($("readout").textContent), $("readout").textContent);
release("KeyH");
release("KeyK");
check("the readout clears", $("readout").textContent === "");

// ---------- the board does not slide when the chrome reflows ----------
// jsdom does not calculate a page layout. Thus the test sets the box of the
// stage and then moves it. A footer that becomes larger, or a header that
// becomes two lines, moves the stage in the same manner.
change("scaleSel", "chromatic");
let stageBox = { left: 0, top: 60, width: 1200, height: 700, right: 1200, bottom: 760, x: 0, y: 60 };
$("stage").getBoundingClientRect = () => stageBox;
app.board.refresh(); // establish the anchor with the current box

const probe = { x: 500, y: 300 };
const stepBefore = app.board.stepAt(probe.x, probe.y);
stageBox = { ...stageBox, height: 660, bottom: 720 }; // The footer became 40 px larger.
app.board.refresh();
check("the key under the pointer stays put when the stage resizes",
  app.board.stepAt(probe.x, probe.y) === stepBefore,
  `${stepBefore} -> ${app.board.stepAt(probe.x, probe.y)}`);

stageBox = { ...stageBox, top: 100, height: 620, bottom: 720 }; // The header became two lines.
app.board.refresh();
check("…and when the header wraps", app.board.stepAt(probe.x, probe.y) === stepBefore,
  `${stepBefore} -> ${app.board.stepAt(probe.x, probe.y)}`);
change("scaleSel", "major");

// ---------- voice stealing ----------
const codes = ["KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP","KeyA","KeyS","KeyD","KeyF",
  "KeyG","KeyH","KeyJ","KeyK","KeyL","KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM","Comma","Period","Slash",
  "Digit1","Digit2","Digit3","Digit4","Digit5"];
app.settings.outOfScale = "quiet";
app.apply();
for (const code of codes) press(code);
check("polyphony is capped", app.synth.activeCount <= 24, `${app.synth.activeCount} voices from ${codes.length} keys`);
check("stolen notes stop glowing", window.document.querySelectorAll("g.hex.active").length <= 24,
  `${window.document.querySelectorAll("g.hex.active").length} lit`);
for (const code of codes) release(code);
check("everything is released", app.synth.activeCount === 0 && $("readout").textContent === "");

// ---------- Space: a pedal by default, a latch by choice ----------
check("sustain starts off", app.sustain === false && $("sustainBtn").getAttribute("aria-pressed") === "false");
check("Space is swallowed", press("Space").defaultPrevented === true);
check("holding Space sustains", app.sustain === true && $("sustainBtn").getAttribute("aria-pressed") === "true");
release("Space");
check("letting go releases it", app.sustain === false);

press("Space", { repeat: true });
check("auto-repeat is inert", app.sustain === false);

press("Space");
check("the button follows the key", $("sustainBtn").getAttribute("aria-pressed") === "true");
release("Space");
click("sustainBtn");
check("the button still latches on its own", app.sustain === true);
click("sustainBtn");
check("and off again", app.sustain === false);

click("settingsBtn");
await settle();
change("sustainModeSel", "toggle");
click("closeSettings");
await settle();
press("Space");
check("in toggle mode a tap latches", app.sustain === true);
release("Space");
check("and letting go leaves it on", app.sustain === true);
press("Space");
release("Space");
check("a second tap clears it", app.sustain === false);

click("settingsBtn");
await settle();
change("sustainModeSel", "hold");
click("closeSettings");
await settle();
check("switching modes starts from released", app.sustain === false);
check("Space never pans", $("stage").classList.contains("panning") === false);

// ---------- the pedal ----------
press("Space"); // Hold the pedal.
press("KeyH");
release("KeyH");
check("a released key keeps ringing under the pedal", app.synth.ringingCount === 1,
  `${app.synth.ringingCount} ringing`);
release("Space"); // Lift the pedal.
check("lifting the pedal damps what was ringing", app.synth.ringingCount === 0);

press("KeyH");
release("KeyH");
check("without the pedal the tail is short-lived", app.synth.ringingCount === 1);
app.synth.allOff();
check("all-off clears the tails too", app.synth.ringingCount === 0 && app.synth.activeCount === 0);

// ---------- a latched sustain is not typed away ----------
// The space bar operates the pedal only while the instrument uses the
// keyboard. A space character in a settings field did not operate the pedal,
// thus it must not release the pedal.
click("sustainBtn");
check("the button latches sustain on", app.sustain === true);
click("settingsBtn");
await settle();
press("Space");
release("Space");
check("a space typed in the dialog leaves the latch alone", app.sustain === true);
click("closeSettings");
await settle();
click("sustainBtn");
check("and it still unlatches normally", app.sustain === false);

// ---------- the octave shift moves the grid, labels and all ----------
click("settingsBtn");
await settle();
change("labelSel", "hz");
click("closeSettings");
await settle();

/** Gives the text on the hex at the middle of the stage. */
const centreHexText = () => {
  const rect = $("stage").getBoundingClientRect();
  const step = app.board.stepAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  const groups = [...app.board.byStepEntries()].find(([drawn]) => drawn === step)?.[1] ?? [];
  return groups[0]?.querySelector("text")?.textContent ?? "";
};
const everyDrawnStepIsAudible = () =>
  [...app.board.byStepEntries()].every(([step]) => step >= app.model.minStep && step <= app.model.maxStep);
const heldNoteName = (code) => {
  const step = app.stepForCode(code);
  return `${app.model.name(step)}${app.model.register(step)}`;
};

app.board.resetView();
const unshiftedLabel = centreHexText();
const unshiftedHz = app.model.frequency(app.model.centerStep);

app.setOctaveShift(2);
app.board.resetView();
startedFrequencies.length = 0;
app.player.press("test-shift", app.model.centerStep);
const shiftedHz = startedFrequencies[0];
check("the shifted centre sounds two octaves up",
  Math.abs(shiftedHz / unshiftedHz - 4) < 0.01,
  `${unshiftedHz.toFixed(1)} Hz -> ${shiftedHz?.toFixed(1)} Hz`);
check("and its hex label says so, rather than the unshifted pitch",
  Math.abs(Number(centreHexText()) - shiftedHz) < 0.5,
  `label "${centreHexText()}" vs ${shiftedHz?.toFixed(1)} Hz (was "${unshiftedLabel}")`);
app.player.release("test-shift");

press("KeyH");
check("the readout names the note that is actually sounding",
  $("readout").textContent.startsWith(heldNoteName("KeyH")),
  $("readout").textContent);
release("KeyH");
check("no hex is drawn outside the audible range", everyDrawnStepIsAudible());

const bound = app.octaveShiftBounds();
app.setOctaveShift(99);
check("the shift stops where the centre note would leave the audible band",
  app.octaveShift === bound.max, `${app.octaveShift} vs ${bound.max}`);
check("the arrow goes dead at the bound", $("octUp").disabled === true && $("octDown").disabled === false);
check("nothing is drawn out of range at the bound", everyDrawnStepIsAudible());
app.setOctaveShift(0);
check("and back to the middle", app.octaveShift === 0 && $("octUp").disabled === false);
check("the centre hex reads as it did before the shift", centreHexText() === unshiftedLabel,
  `"${centreHexText()}" vs "${unshiftedLabel}"`);
click("settingsBtn");
await settle();
change("labelSel", "ratios"); // Set the mode that the ratio-label checks above use.
click("closeSettings");
await settle();

// ---------- a failed sample download can be retried ----------
let sampleRequests = 0;
globalThis.fetch = () => {
  sampleRequests++;
  return Promise.reject(new Error("no network in tests"));
};
await app.synth.loadPiano();
const afterFirst = sampleRequests;
check("a failed piano download is reported", app.synth.piano.status === "failed" && afterFirst > 0,
  `${app.synth.piano.status}, ${afterFirst} requests`);
await app.synth.loadPiano();
check("and picking the piano again actually retries", sampleRequests > afterFirst,
  `${afterFirst} -> ${sampleRequests} requests`);

// ---------- duplicate notes, greyed but playable ----------
change("scaleSel", "chromatic");
check("no duplicates are marked by default", window.document.querySelectorAll("g.hex.duplicate").length === 0);
click("settingsBtn");
await settle();
$("dimDupIn").checked = true;
$("dimDupIn").dispatchEvent(new window.Event("change"));
click("closeSettings");
await settle();

const duplicates = window.document.querySelectorAll("g.hex.duplicate").length;
check("duplicates are greyed", duplicates > 0 && duplicates < hexCount(), `${duplicates}/${hexCount()}`);
// The pointer ignores a grey duplicate, because that note is already on the
// screen.
const { cellAt } = await import(join(root, "dist/view/board.js"));
const boardConfig = {
  model: app.model,
  labels: app.settings.labels,
  jiLimit: app.settings.jiLimit,
  glow: app.settings.glow,
  silenceOutOfScale: app.settings.outOfScale === "silent",
  dimDuplicates: app.settings.dimDuplicates,
  duplicateMode: app.settings.duplicateMode
};
const findCell = (wanted) => {
  for (let r = -8; r <= 8; r++) {
    for (let q = -8; q <= 8; q++) {
      const cell = cellAt(q, r, boardConfig);
      if (cell.duplicate === wanted) return { q, r, ...cell };
    }
  }
  return null;
};
app.board.resetView();
const toScreen = ({ q, r }) => {
  const rect = $("stage").getBoundingClientRect();
  const x = Math.sqrt(3) * 44 * (q + r / 2);
  const y = 1.5 * 44 * r;
  return [rect.left + rect.width / 2 + x, rect.top + rect.height / 2 + y];
};
const dup = findCell(true);
const main = findCell(false);
check("the pointer passes over a greyed duplicate", app.board.stepAt(...toScreen(dup)) === null,
  `${dup.q},${dup.r} plays ${dup.step}`);
check("but still finds the main area", app.board.stepAt(...toScreen(main)) === main.step);

// A computer key on a duplicate is the only method to play that hex.
const dupCodes = app.settings.rows.flat().filter((code) => code && app.stepForCode(code) !== null);
startedFrequencies.length = 0;
press(dupCodes[0]);
check("the computer keyboard still plays", startedFrequencies.length > 0, dupCodes[0]);
release(dupCodes[0]);

const duplicate = window.document.querySelector("g.hex.duplicate");
const dupStep = [...app.board.byStepEntries()].find(([, groups]) => groups.includes(duplicate))?.[0];
startedFrequencies.length = 0;
app.player.press("test-dup", dupStep);
check("a duplicate still sounds and lights when played", startedFrequencies.length > 0 && duplicate.classList.contains("active"));
app.player.release("test-dup");

$("settingsBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
await settle();
$("dimDupIn").checked = false;
$("dimDupIn").dispatchEvent(new window.Event("change"));
click("closeSettings");
await settle();
check("the option turns back off", window.document.querySelectorAll("g.hex.duplicate").length === 0);

// ---------- reallocating the spare copies ----------
// In 24 EDO, Wicki-Hayden has the vectors (4, 10). It reaches every second
// step only. Thus the duplicate bands can play the quarter tones.
change("tuningSel", "edo-24");
const degreesOnBoard = () => new Set([...app.board.byStepEntries()].map(([step]) => ((step % 24) + 24) % 24));
check("the layout skips half the tuning", degreesOnBoard().size === 12,
  `${degreesOnBoard().size} of 24 degrees drawn`);

click("settingsBtn");
await settle();
$("dimDupIn").checked = true;
$("dimDupIn").dispatchEvent(new window.Event("change"));
change("dupModeSel", "fill");
check("the note explains what will happen", /reaches only every second step/.test($("reallocNote").textContent),
  $("reallocNote").textContent);
change("dupModeSel", "fill");
click("closeSettings");
await settle();

check("reallocation fills in the missing notes", degreesOnBoard().size === 24,
  `${degreesOnBoard().size} of 24 degrees drawn`);
const quarterTone = [...app.board.byStepEntries()].find(([step]) => step % 2 !== 0);
check("a quarter tone is on the board", quarterTone !== undefined);
startedFrequencies.length = 0;
app.player.press("test-quarter", quarterTone[0]);
check("and it plays", startedFrequencies.length > 0, `${startedFrequencies[0]?.toFixed(2)} Hz`);
app.player.release("test-quarter");
check("the main area is untouched", app.board.stepAt(0, 0) !== null);

// The computer keyboard uses the same lattice. Thus each key agrees with its
// hex.
const oddKey = ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "Digit1", "Digit2"].find(
  (code) => app.stepForCode(code) % 2 !== 0
);
check("the computer keyboard reaches them too", oddKey !== undefined, `${oddKey} -> ${app.stepForCode(oddKey)}`);

click("settingsBtn");
await settle();
$("dimDupIn").checked = false;
$("dimDupIn").dispatchEvent(new window.Event("change"));
change("dupModeSel", "repeat");
click("closeSettings");
await settle();
change("tuningSel", "edo-31");
click("settingsBtn");
await settle();
change("dupModeSel", "fill");
check("a layout with nothing to fill says so", /already reaches every note/.test($("reallocNote").textContent),
  $("reallocNote").textContent);
change("dupModeSel", "repeat");
click("closeSettings");
await settle();
change("scaleSel", "major");

// ---------- octave bands: more range, same scale ----------
// The range is smallest on the computer keyboard. Measure it there.
const keyReach = () => {
  const steps = new Set();
  for (const row of app.settings.rows) {
    for (const code of row) {
      const step = code ? app.stepForCode(code) : null;
      if (step !== null) steps.add(step);
    }
  }
  return { count: steps.size, span: Math.max(...steps) - Math.min(...steps) };
};
const boardClasses = () => new Set([...app.board.byStepEntries()].map(([s2]) => ((s2 % 12) + 12) % 12));

change("tuningSel", "edo-12"); // The repeat vector of 31 EDO is larger than the key grid.
change("scaleSel", "major");
const plainReach = keyReach();
const plainClasses = new Set([...app.board.byStepEntries()].map(([s2]) => ((s2 % 12) + 12) % 12));

click("settingsBtn");
await settle();
const echoCells = window.document.querySelectorAll("#mapEditor button.cell.echo").length;
check("the editor greys the keys that echo the main area", echoCells > 0, `${echoCells} cells`);
check("and counts them", /\d+ of \d+ mapped keys play notes the main area already carries/.test($("mapSummary").textContent),
  $("mapSummary").textContent);
const echoTitle = window.document.querySelector("#mapEditor button.cell.echo").title;
check("each says why", /already in the main area/.test(echoTitle), echoTitle);

change("dupModeSel", "octave");
check("the note reports the real gain", /now reaches \d+ notes across/.test($("reallocNote").textContent),
  $("reallocNote").textContent);
click("closeSettings");
await settle();

const octaveReach = keyReach();
check("the computer keyboard reaches further",
  octaveReach.span > plainReach.span && octaveReach.count > plainReach.count,
  `${plainReach.count} notes over ${(plainReach.span / 12).toFixed(1)} octaves -> ${octaveReach.count} over ${(octaveReach.span / 12).toFixed(1)}`);
check("no new pitch classes appear", [...boardClasses()].every((d) => plainClasses.has(d)));
check("the scale mask is unchanged",
  [...app.board.byStepEntries()].every(([s2, groups]) => groups.every((g) => g.classList.contains("out") !== app.model.inScale(s2))));
check("nothing is greyed as a duplicate", window.document.querySelectorAll("g.hex.duplicate").length === 0);
click("settingsBtn");
await settle();
check("no key is marked as an echo any more",
  window.document.querySelectorAll("#mapEditor button.cell.echo").length === 0);
check("and the summary agrees", /All \d+ mapped keys play distinct notes/.test($("mapSummary").textContent),
  $("mapSummary").textContent);
click("closeSettings");
await settle();

// Two keys that played the same note are now one period apart.
const mapped = app.settings.rows.flat().filter((code) => code !== null);
const unison = (() => {
  for (let i = 0; i < mapped.length; i++) {
    for (let j = i + 1; j < mapped.length; j++) {
      if (app.stepForCode(mapped[i], "repeat") === app.stepForCode(mapped[j], "repeat")) return [mapped[i], mapped[j]];
    }
  }
  return null;
})();
check("the key grid did have keys in unison", unison !== null, unison?.join(" = "));
const gap = Math.abs(app.stepForCode(unison[0]) - app.stepForCode(unison[1]));
check("and they are now an octave apart", gap === 12, `${unison.join(" vs ")}: ${gap} steps`);

startedFrequencies.length = 0;
press(unison[0]);
const a = startedFrequencies[0];
release(unison[0]);
startedFrequencies.length = 0;
press(unison[1]);
const b = startedFrequencies[0];
release(unison[1]);
check("which is audibly a 2:1", Math.abs(Math.max(a, b) / Math.min(a, b) - 2) < 0.01,
  `${Math.min(a, b).toFixed(1)} Hz and ${Math.max(a, b).toFixed(1)} Hz`);

click("settingsBtn");
await settle();
change("dupModeSel", "repeat");
click("closeSettings");
await settle();
check("back to plain repeats", keyReach().span === plainReach.span);
change("tuningSel", "edo-31");

// ---------- key capture ----------
check("Tab belongs to the browser normally", press("Tab").defaultPrevented === false);
click("captureBtn");
await settle();
check("capture turns on", app.capture.active === true && $("captureBtn").getAttribute("aria-pressed") === "true");
check("the stage shows it is holding the keyboard", $("stage").classList.contains("capturing"));
check("Tab is swallowed while capturing", press("Tab").defaultPrevented === true);
check("browser shortcuts still get through", press("KeyW", { ctrlKey: true }).defaultPrevented === false);

startedFrequencies.length = 0;
press("F1"); // the new function row
check("the function row plays while capturing", startedFrequencies.length > 0);
release("F1");

press("Escape");
await settle();
check("Escape leaves capture", app.capture.active === false);
check("…and the frame goes", $("stage").classList.contains("capturing") === false);

click("captureBtn");
await settle();
click("settingsBtn");
await settle();
check("the dialog takes the keyboard back", app.capture.active === false && app.captureSuspended === true);
click("closeSettings");
await settle();
check("closing the dialog returns capture", app.capture.active === true);
click("captureBtn");
await settle();
check("capture toggles back off", app.capture.active === false);

// ---------- a MIDI keyboard as an extra input ----------
click("settingsBtn");
await settle();
check("MIDI is offered when the browser has it", $("midiConnectBtn").disabled === false);
click("midiConnectBtn");
await settle();
check("the device is listening", /Test Controller/.test($("midiStatus").textContent), $("midiStatus").textContent);

change("midiModeSel", "linear");
click("closeSettings");
await settle();

startedFrequencies.length = 0;
midi(0x90, 60, 100); // Middle C at velocity 100.
check("a MIDI note plays the centre of the grid",
  Math.abs(startedFrequencies[0] - app.model.frequency(app.model.centerStep)) < 0.01,
  `${startedFrequencies[0]?.toFixed(2)} Hz`);
check("and lights its hex", window.document.querySelectorAll("g.hex.active").length > 0);
check("the readout sees it too", $("readout").textContent.length > 0, $("readout").textContent);
midi(0x80, 60, 0);
check("note-off releases it", window.document.querySelectorAll("g.hex.active").length === 0);

midi(0x90, 62, 90);
midi(0x90, 62, 0); // A note-on message with a velocity of 0 is a note-off message.
check("zero-velocity note-on is a note-off", app.synth.activeCount === 0);

check("linear mode gives one step per key", app.stepForMidiNote(61) === app.model.centerStep + 1);
app.settings.midiMode = "pitch";
check("pitch mode follows 12-TET", Math.abs(app.model.frequency(app.stepForMidiNote(69)) - app.settings.aHz) < 1,
  `${app.model.frequency(app.stepForMidiNote(69)).toFixed(2)} Hz for A4`);
app.settings.midiMode = "scale";
app.settings.scale = "major";
app.apply();
const scaleStep = app.stepForMidiNote(61);
check("scale mode walks the mask", app.model.inScale(scaleStep) && scaleStep > app.model.centerStep,
  `${app.model.centerStep} -> ${scaleStep}`);
app.settings.midiMode = "linear";
app.apply();

midi(0xb0, 64, 127); // The sustain pedal goes down.
check("the sustain pedal is heard", app.sustain === true);
midi(0xb0, 64, 0);
check("and released", app.sustain === false);

midi(0x90, 64, 80);
midi(0x90, 67, 80);
midi(0xb0, 123, 0); // The all-notes-off message.
check("all-notes-off clears everything", app.synth.activeCount === 0);

// ---------- shareable links ----------
const hash = window.location.hash;
check("the URL carries the setup", hash.length > 1, `${hash.slice(0, 24)}…`);
const { decodeState } = await import(join(root, "dist/state/share.js"));
const shared = decodeState(hash);
check("the link round-trips the tuning", makeTuning(shared.tuning).id === app.model.tuning.id);
check("the link carries the scale", shared.scale === app.settings.scale && shared.labels === "ratios");
check("a mangled link is ignored", decodeState("#not-base64!!") === null);

// ---------- settings dialog ----------
$("settingsBtn").dispatchEvent(new window.Event("click", { bubbles: true }));
check("dialog opens and takes the keyboard", $("modal").hidden === false && app.modalOpen === true);
check("key map editor renders", window.document.querySelectorAll("#mapEditor button.cell").length === 70,
  `${window.document.querySelectorAll("#mapEditor button.cell").length} cells`);
check("centre-note degrees follow the tuning", $("centerDegSel").options.length === 31);

change("edoIn", "19");
check("a custom EDO applies", makeTuning(app.settings.tuning).size === 19);
check("scale root is re-anchored", app.settings.scaleRoot < 19);

const saved = JSON.parse(window.localStorage.getItem("hexatone-settings-v3"));
check("settings persist", makeTuning(saved.tuning).size === 19 && saved.scale === "major");

// ---------- focus does not get stuck on the controls ----------
$("closeSettings").dispatchEvent(new window.Event("click", { bubbles: true }));
check("dialog releases focus on close", window.document.activeElement === window.document.body,
  window.document.activeElement.id || window.document.activeElement.tagName);

clickChange("tuningSel", "edo-12");
check("mouse edit releases focus", window.document.activeElement !== $("tuningSel"),
  window.document.activeElement.id || window.document.activeElement.tagName);
startedFrequencies.length = 0;
press("KeyH");
check("keyboard still plays right after a setting change", startedFrequencies.length > 0);
release("KeyH");

// A user of the keyboard keeps the focus. A change from a key must not
// remove the focus.
$("scaleSel").focus();
$("scaleSel").dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
$("scaleSel").value = "dorian";
$("scaleSel").dispatchEvent(new window.Event("change", { bubbles: true }));
check("keyboard edit keeps focus", window.document.activeElement === $("scaleSel"),
  window.document.activeElement.id || window.document.activeElement.tagName);

console.log(failures.length ? `\n${failures.length} failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
