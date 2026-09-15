/** The header bar. It contains the tuning, the layout, the scale, the voice,
 *  the octave, the view and the volume controls. */

import type { App } from "../app.js";
import { LAYOUTS } from "../core/layouts.js";
import { generatorOptions, modeOptions, mosNoteCounts, nearestNoteCount } from "../core/mos.js";
import { MOS_SCALE_ID, SCALES } from "../core/scales.js";
import { formatError, formatRatio, nearestRatio } from "../core/ratios.js";
import { centsAt, degreeNames, perfectFifth } from "../core/tuning.js";
import { findPreset, TUNING_PRESETS } from "../core/tuning-library.js";
import { isKeyLockSupported } from "../input/capture.js";
import { shareUrl } from "../state/share.js";
import { retune, type VoiceId } from "../state/settings.js";
import { el, fillSelect, type OptionSpec } from "./dom.js";

const CUSTOM_VALUE = "custom";
const CURRENT_VALUE = "current";

export function initControls(app: App): void {
  const tuningSel = el<HTMLSelectElement>("tuningSel");
  const layoutSel = el<HTMLSelectElement>("layoutSel");
  const scaleSel = el<HTMLSelectElement>("scaleSel");
  const rootSel = el<HTMLSelectElement>("rootSel");
  const mosGroup = el("mosGroup");
  const mosGenSel = el<HTMLSelectElement>("mosGenSel");
  const mosNotesSel = el<HTMLSelectElement>("mosNotesSel");
  const mosModeSel = el<HTMLSelectElement>("mosModeSel");
  const voiceSel = el<HTMLSelectElement>("voiceSel");
  const volume = el<HTMLInputElement>("vol");
  const octaveTag = el("octTag");
  const octaveLabel = el("octLabel");
  const octaveUp = el<HTMLButtonElement>("octUp");
  const octaveDown = el<HTMLButtonElement>("octDown");
  const zoomLabel = el("zoomLabel");
  const sustainBtn = el<HTMLButtonElement>("sustainBtn");
  const panBtn = el<HTMLButtonElement>("panBtn");
  const boardInfo = el("boardInfo");
  const readout = el("readout");
  const shareBtn = el<HTMLButtonElement>("shareBtn");
  const captureBtn = el<HTMLButtonElement>("captureBtn");
  const board = el<SVGSVGElement>("board");

  fillSelect(
    layoutSel,
    LAYOUTS.map((layout) => ({ value: layout.id, label: layout.name, title: layout.note })),
    app.settings.layout
  );
  fillSelect(
    scaleSel,
    SCALES.map((scale) => ({ value: scale.id, label: scale.name, group: scale.group === "None" ? undefined : scale.group })),
    app.settings.scale
  );

  tuningSel.addEventListener("change", () => {
    if (tuningSel.value === CUSTOM_VALUE) {
      app.openSettings("edoIn");
      app.apply({ persist: false }); // Set the list back to the active tuning.
      return;
    }
    const preset = TUNING_PRESETS.find((entry) => entry.id === tuningSel.value);
    if (!preset) return;
    app.player.releaseAll();
    retune(app.settings, preset.spec);
    app.apply();
  });

  layoutSel.addEventListener("change", () => {
    app.settings.layout = layoutSel.value;
    app.apply();
  });

  scaleSel.addEventListener("change", () => {
    app.settings.scale = scaleSel.value;
    app.apply();
  });

  rootSel.addEventListener("change", () => {
    const degree = Number(rootSel.value);
    // While the root follows the centre, a selection of a root moves the
    // centre note. Thus both controls stay available and always agree.
    if (app.settings.rootFollowsCenter) app.settings.centerDegree = degree;
    else app.settings.scaleRoot = degree;
    app.apply();
  });

  mosGenSel.addEventListener("change", () => {
    app.settings.mosGenerator = Number(mosGenSel.value);
    app.settings.mosNotes = nearestNoteCount(app.model.tuning.size, app.settings.mosGenerator, app.settings.mosNotes);
    app.settings.mosMode = Math.min(app.settings.mosMode, app.settings.mosNotes - 1);
    app.apply();
  });

  mosNotesSel.addEventListener("change", () => {
    app.settings.mosNotes = Number(mosNotesSel.value);
    app.settings.mosMode = Math.min(app.settings.mosMode, app.settings.mosNotes - 1);
    app.apply();
  });

  mosModeSel.addEventListener("change", () => {
    app.settings.mosMode = Number(mosModeSel.value);
    app.apply();
  });

  voiceSel.addEventListener("change", () => {
    app.settings.voice = voiceSel.value as VoiceId;
    app.synth.voice = app.settings.voice;
    // A selection by the user is a good time to start the download.
    if (app.settings.voice === "piano") void app.synth.loadPiano();
    app.apply();
  });

  volume.addEventListener("input", () => {
    app.settings.volume = Number(volume.value);
    app.synth.volume = app.settings.volume;
  });
  // Store the volume one time at the end of the movement, not at each step.
  volume.addEventListener("change", () => app.apply());
  volume.value = String(app.settings.volume);

  octaveUp.addEventListener("click", () => app.setOctaveShift(app.octaveShift + 1));
  octaveDown.addEventListener("click", () => app.setOctaveShift(app.octaveShift - 1));

  sustainBtn.addEventListener("click", () => app.setSustain(!app.sustain));
  panBtn.addEventListener("click", () => {
    app.setPanMode(!app.panMode);
    toggleButton(panBtn, app.panMode);
  });

  el("zoomIn").addEventListener("click", () => zoomFromCenter(app, 1.25));
  el("zoomOut").addEventListener("click", () => zoomFromCenter(app, 0.8));
  el("resetView").addEventListener("click", () => app.board.resetView());
  el("settingsBtn").addEventListener("click", () => app.openSettings());

  captureBtn.addEventListener("click", () => {
    void app.setCapture(!app.capture.active);
  });
  captureBtn.title = isKeyLockSupported()
    ? "Send every key to the instrument (fullscreen; Esc to leave)"
    : "Send every key to the instrument (Esc to leave)";

  shareBtn.addEventListener("click", () => {
    const url = shareUrl(app.settings);
    const done = (message: string): void => {
      shareBtn.textContent = message;
      window.setTimeout(() => (shareBtn.textContent = "Link"), 1600);
    };
    // The address bar always contains the link. The clipboard is an additional
    // convenience.
    if (navigator.clipboard) void navigator.clipboard.writeText(url).then(() => done("Copied"), () => done("See URL"));
    else done("See URL");
  });

  app.player.onHeldChange = (steps) => {
    readout.textContent = describeHeld(app, steps);
  };

  app.board.onZoomChange = (zoom) => {
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  };

  app.synth.piano.onStatusChange = (status) => {
    const option = voiceSel.querySelector<HTMLOptionElement>('option[value="piano"]');
    if (!option) return;
    option.textContent =
      status === "loading" ? "Piano (loading…)" : status === "failed" ? "Piano (offline — synth)" : "Piano";
  };

  releaseFocusAfterPointerEdits(el("controls"));

  app.onChange(() => {
    const { settings, model } = app;
    const { tuning } = model;

    fillSelect(tuningSel, tuningOptions(app), currentTuningValue(app));
    fillSelect(
      rootSel,
      degreeNames(tuning).map((name, degree) => ({ value: String(degree), label: name })),
      String(model.scaleRoot)
    );
    rootSel.title = settings.rootFollowsCenter
      ? "Follows the centre note — picking one moves the centre. Unlink in Settings ▸ Scale."
      : "Independent of the centre note.";
    layoutSel.value = settings.layout;
    scaleSel.value = settings.scale;
    voiceSel.value = settings.voice;
    rootSel.disabled = model.maskedDegrees === null && !settings.rootFollowsCenter;

    const isMos = settings.scale === MOS_SCALE_ID;
    mosGroup.hidden = !isMos;
    if (isMos) {
      fillSelect(
        mosGenSel,
        generatorOptions(tuning).map((option) => ({ value: String(option.steps), label: option.label })),
        String(settings.mosGenerator)
      );
      fillSelect(
        mosNotesSel,
        mosNoteCounts(tuning.size, settings.mosGenerator).map((count) => ({
          value: String(count),
          label: `${count} notes`
        })),
        String(settings.mosNotes)
      );
      fillSelect(
        mosModeSel,
        modeOptions(settings.mosNotes).map((mode) => ({
          value: String(mode),
          label: mode === 0 ? "mode 0 (brightest)" : mode === settings.mosNotes - 1 ? `mode ${mode} (darkest)` : `mode ${mode}`
        })),
        String(settings.mosMode)
      );
    }

    toggleButton(captureBtn, app.capture.active);
    toggleButton(sustainBtn, app.sustain);
    updateOctaveControls(app, { tag: octaveTag, label: octaveLabel, up: octaveUp, down: octaveDown });
    boardInfo.textContent = describe(app);
    board.setAttribute("aria-label", `Hex keyboard. ${describe(app)}`);
  });
}

/**
 * Removes the focus from a control after the user operates it with a pointer.
 *
 * A list or a slider keeps the focus after use. The keyboard handler ignores a
 * key event on a form control. Thus the instrument stays silent until the user
 * selects a different element.
 *
 * The code removes the focus only after an operation with a pointer. A user
 * who moves through the controls with the Tab key must keep the focus.
 */
function releaseFocusAfterPointerEdits(container: HTMLElement): void {
  let fromPointer = false;
  container.addEventListener("pointerdown", () => {
    fromPointer = true;
  });
  container.addEventListener("keydown", () => {
    fromPointer = false;
  });
  container.addEventListener("change", (event) => {
    if (fromPointer) (event.target as HTMLElement).blur();
  });
  // A button gives no change event. A button with the focus receives the space
  // bar, and the sustain pedal then does not operate.
  container.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (fromPointer && target.tagName === "BUTTON") target.blur();
  });
}

interface OctaveControls {
  readonly tag: HTMLElement;
  readonly label: HTMLElement;
  readonly up: HTMLButtonElement;
  readonly down: HTMLButtonElement;
}

/**
 * Updates the octave controls.
 *
 * The audible range of the tuning limits the shift. Thus the code disables an
 * arrow at each limit. Without this the arrow accepts a push but does not
 * move the grid.
 */
function updateOctaveControls(app: App, controls: OctaveControls): void {
  const { min, max } = app.octaveShiftBounds();
  const period = app.model.tuning.octaveBased ? "Octave" : "Period";

  controls.tag.textContent = period;
  controls.label.textContent = app.octaveShift > 0 ? `+${app.octaveShift}` : String(app.octaveShift);
  controls.up.disabled = app.octaveShift >= max;
  controls.down.disabled = app.octaveShift <= min;
  controls.up.title = controls.up.disabled ? `Already at the highest ${period.toLowerCase()}` : `${period} up`;
  controls.down.title = controls.down.disabled ? `Already at the lowest ${period.toLowerCase()}` : `${period} down`;
}

function tuningOptions(app: App): OptionSpec[] {
  const options: OptionSpec[] = TUNING_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.name,
    title: preset.note,
    group: preset.group
  }));
  if (!findPreset(app.model.tuning.id)) {
    options.push({ value: CURRENT_VALUE, label: app.model.tuning.name, title: app.model.tuning.note, group: "Loaded" });
  }
  options.push({ value: CUSTOM_VALUE, label: "Custom…", group: "Loaded" });
  return options;
}

function currentTuningValue(app: App): string {
  return findPreset(app.model.tuning.id)?.id ?? CURRENT_VALUE;
}

function zoomFromCenter(app: App, factor: number): void {
  const rect = el("stage").getBoundingClientRect();
  app.board.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
}

function toggleButton(button: HTMLButtonElement, on: boolean): void {
  button.classList.toggle("on", on);
  button.setAttribute("aria-pressed", String(on));
}

function describe(app: App): string {
  const { tuning, vectors, layout, layoutFallbackFrom } = app.model;
  const fifth = perfectFifth(tuning);
  const scale = app.model.maskedDegrees
    ? `${app.model.scaleLabel} on ${app.model.names[app.model.scaleRoot]} · ${app.model.maskedDegrees.size} of ${tuning.size} notes`
    : `all ${tuning.size} notes`;
  const geometry = `${layout.name}: E +${vectors.east}, NE +${vectors.east + vectors.upLeft}`;
  const stoodIn = layoutFallbackFrom ? ` (${layoutFallbackFrom.name} does not work in this tuning)` : "";
  return `${tuning.name} · fifth ${fifth} steps (${centsAt(tuning, fifth).toFixed(1)}¢) · ${geometry}${stoodIn} · ${scale}`;
}

/**
 * Describes the notes that sound. For two notes or more, the description also
 * gives the intervals above the lowest note. The code names each interval with
 * the nearest just ratio.
 */
function describeHeld(app: App, steps: number[]): string {
  if (steps.length === 0) return "";
  const { model } = app;
  const names = steps.map((step) => `${model.name(step)}${model.register(step)}`);
  if (steps.length === 1) {
    const step = steps[0];
    return `${names[0]} · ${model.frequency(step).toFixed(1)} Hz · ${model.centsFromRoot(step).toFixed(0)}¢ above ${model.names[model.scaleRoot]}`;
  }
  const bass = steps[0];
  const intervals = steps.slice(1).map((step) => {
    const cents = model.cents(step) - model.cents(bass);
    const match = nearestRatio(cents, app.settings.jiLimit);
    return `${formatRatio(match)} ${formatError(match)}`;
  });
  return `${names.join(" + ")} · ${intervals.join(", ")}`;
}
