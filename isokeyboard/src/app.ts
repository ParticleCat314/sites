/**
 * The root of the application. It holds the settings, the calculated model and
 * the permanent objects. It applies each of these again after a change of a
 * setting.
 *
 * A user-interface module changes `settings` and then calls `apply()`. No
 * other module changes the settings directly.
 */

import { KeyCapture } from "./input/capture.js";
import { attachKeyboardInput } from "./input/keyboard.js";
import { MidiInput } from "./input/midi.js";
import { attachPointerInput } from "./input/pointer.js";
import { Player } from "./player.js";
import { Synth } from "./audio/synth.js";
import { buildCodeMap, CENTER_COL, CENTER_ROW, type KeyPosition } from "./state/keymap.js";
import { buildModel, octaveShiftRange, type Model, type OctaveShiftRange } from "./state/model.js";
import { nearestStep } from "./core/tuning.js";
import { bandOffset, isEcho } from "./core/lattice.js";
import {
  loadSettings,
  mergeSettings,
  saveSettings,
  type DuplicateMode,
  type Settings
} from "./state/settings.js";
import { decodeState, encodeState } from "./state/share.js";
import { HexBoard } from "./view/board.js";
import { initControls } from "./ui/controls.js";
import { initSettingsModal } from "./ui/settings-modal.js";
import { el } from "./ui/dom.js";

/** The largest octave shift that the control offers. The audible band can
 *  permit a larger shift, but the control does not need it. */
const OCTAVE_SHIFT_CEILING = 6;
const RESIZE_DEBOUNCE_MS = 120;

export class App {
  readonly settings: Settings;
  readonly storageAvailable: boolean;
  readonly synth = new Synth();
  readonly capture = new KeyCapture();
  readonly midi: MidiInput;
  readonly board: HexBoard;
  readonly player: Player;

  model: Model;
  octaveShift = 0;
  sustain = false;
  panMode = false;
  /** True while the settings dialog uses the keyboard. */
  modalOpen = false;
  /** The settings dialog sets this function. The value `focusId` moves a field
   *  into view. */
  openSettings: (focusId?: string) => void = () => {};
  /** True while the settings dialog holds the key capture. */
  captureSuspended = false;

  private codeMap: Map<string, KeyPosition>;
  private readonly stage: HTMLElement;
  private readonly listeners: Array<(app: App) => void> = [];

  constructor() {
    const loaded = loadSettings();
    this.settings = loaded.settings;
    this.storageAvailable = loaded.storageAvailable;
    // A shared link describes the instrument. It replaces the settings that
    // this browser holds in storage.
    const shared = decodeState(window.location.hash);
    if (shared) mergeSettings(this.settings, shared);
    this.model = buildModel(this.settings);
    this.codeMap = buildCodeMap(this.settings.rows);

    this.stage = el("stage");
    this.board = new HexBoard(el<SVGSVGElement>("board"), this.stage);
    this.midi = new MidiInput({
      onNoteOn: (note, velocity) => {
        const step = this.stepForMidiNote(note);
        if (step !== null) this.player.press(midiKey(note), step, this.midiGain(velocity));
      },
      onNoteOff: (note) => this.player.release(midiKey(note)),
      onSustain: (down) => this.setSustain(down),
      onAllNotesOff: () => this.player.releaseAll()
    });

    this.player = new Player(this.synth, this.board, () => ({
      model: this.model,
      silenceOutOfScale: this.settings.outOfScale === "silent"
    }));
  }

  start(): void {
    this.synth.volume = this.settings.volume;
    this.synth.voice = this.settings.voice;

    attachPointerInput({
      stage: this.stage,
      board: this.board,
      player: this.player,
      wantsPan: () => this.panMode
    });

    attachKeyboardInput({
      player: this.player,
      isBusy: () => this.modalOpen,
      isCapturing: () => this.capture.active,
      stepForCode: (code) => this.stepForCode(code),
      onSustainKey: (down) => this.sustainKey(down),
      onEscape: () => void this.setCapture(false)
    });

    this.capture.attach({
      element: this.stage,
      onExternalExit: () => void this.setCapture(false)
    });

    initControls(this);
    initSettingsModal(this);

    let resizeTimer: number | undefined;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => this.board.refresh(), RESIZE_DEBOUNCE_MS);
    });

    this.apply({ persist: false });
    if (this.settings.midiAutoConnect) void this.midi.connect();
  }

  /** Adds a listener. The code calls each listener after each `apply()`. The
   *  user interface uses this to update its controls. */
  onChange(listener: (app: App) => void): void {
    this.listeners.push(listener);
  }

  /** Builds the model again from the settings. Draws the board again. Stores
   *  the settings. Calls the listeners. */
  apply(options: { persist?: boolean } = {}): void {
    // A change of tuning changes the permitted range of the shift. Thus the
    // code limits the shift before it builds the model. A tuning with fewer
    // degrees must not keep a shift that it cannot play.
    this.octaveShift = this.clampShift(this.octaveShift);
    this.model = buildModel(this.settings, this.octaveShift);
    this.codeMap = buildCodeMap(this.settings.rows);
    this.board.setConfig({
      model: this.model,
      labels: this.settings.labels,
      jiLimit: this.settings.jiLimit,
      glow: this.settings.glow,
      silenceOutOfScale: this.settings.outOfScale === "silent",
      dimDuplicates: this.settings.dimDuplicates,
      duplicateMode: this.settings.duplicateMode
    });
    if (options.persist !== false) {
      saveSettings(this.settings);
      this.writeHash();
    }
    for (const listener of this.listeners) listener(this);
  }

  /**
   * Moves the complete grid by a number of periods.
   *
   * The keys below the fingers of the user change pitch. Thus the code
   * releases each held key first and then builds the board again. The shift is
   * part of the model. It is not a correction on the path to the synth.
   */
  setOctaveShift(shift: number): void {
    const clamped = this.clampShift(shift);
    if (clamped === this.octaveShift) return;
    this.octaveShift = clamped;
    this.player.releaseAll();
    // The shift applies to this session only. It is not a setting, thus the
    // code does not store it.
    this.apply({ persist: false });
  }

  /** Gives the permitted range of the shift in this tuning. */
  octaveShiftBounds(): OctaveShiftRange {
    return octaveShiftRange(this.settings, OCTAVE_SHIFT_CEILING);
  }

  private clampShift(shift: number): number {
    const { min, max } = this.octaveShiftBounds();
    return Math.max(min, Math.min(max, shift));
  }

  /** Takes the keyboard, or releases it. The settings dialog needs the
   *  keyboard for text entry. */
  async setCapture(on: boolean): Promise<void> {
    if (on === this.capture.active) return;
    if (on) await this.capture.enter();
    else await this.capture.exit();
    this.stage.classList.toggle("capturing", this.capture.active);
    for (const listener of this.listeners) listener(this);
  }

  /**
   * Operates the sustain from the space bar. In the default mode the space bar
   * is a pedal: down starts the sustain and up ends it. In the toggle mode the
   * code uses the down event only, and the sustain latches.
   */
  private sustainKey(down: boolean): void {
    if (this.settings.sustainMode === "toggle") {
      if (down) this.setSustain(!this.sustain);
      return;
    }
    this.setSustain(down);
  }

  setSustain(on: boolean): void {
    if (on === this.sustain) return;
    this.sustain = on;
    this.synth.sustain = on;
    for (const listener of this.listeners) listener(this);
  }

  setPanMode(on: boolean): void {
    this.panMode = on;
    this.updatePanCursor();
  }

  /**
   * Gives the step that a MIDI note number plays.
   *
   * Middle C, note 60, is always the centre of the grid. The three modes give
   * different steps for the notes on each side of it. A tuning of 31 degrees
   * has no single correct method.
   */
  stepForMidiNote(note: number): number | null {
    const offset = note - 60;
    const { model } = this;

    if (this.settings.midiMode === "pitch") {
      // Find the 12-TET pitch of the note. Then find the nearest step in this
      // tuning.
      const step = nearestStep(model.tuning, 6900 + (note - 69) * 100);
      return inRange(model, step) ? step : null;
    }

    if (this.settings.midiMode === "scale" && model.maskedDegrees) {
      let step = model.centerStep;
      let remaining = Math.abs(offset);
      const direction = Math.sign(offset);
      // Move away from the centre to the nth degree that the mask permits.
      for (let guard = 0; remaining > 0 && guard < 4096; guard++) {
        step += direction;
        if (!inRange(model, step)) return null;
        if (model.inScale(step)) remaining--;
      }
      return remaining === 0 && inRange(model, step) ? step : null;
    }

    const step = model.centerStep + offset;
    return inRange(model, step) ? step : null;
  }

  private midiGain(velocity: number): number {
    if (!this.settings.midiVelocity) return 1;
    // The result has a minimum value. Thus a light touch continues to sound.
    return 0.25 + 0.75 * (velocity / 127);
  }

  /** Measures the notes that the mapped keys reach in a given mode. In some
   *  tunings the layout does not repeat within the area of the key grid. The
   *  user needs this measurement to compare the modes. */
  keyboardReach(mode: DuplicateMode): { count: number; span: number; periods: number } {
    const steps = new Set<number>();
    for (const [code] of this.codeMap) {
      const step = this.stepForCode(code, mode);
      if (step !== null) steps.add(step);
    }
    if (steps.size === 0) return { count: 0, span: 0, periods: 0 };
    const span = Math.max(...steps) - Math.min(...steps);
    return { count: steps.size, span, periods: span / this.model.tuning.size };
  }

  /**
   * Gives the grid step that a physical key plays. Gives null if the mapping
   * does not contain the key.
   *
   * The key grid is a view of the same lattice as the board. The column gives
   * q and the row gives -r. Thus the band offsets also apply to the key grid,
   * and a key plays the note that the hex in that position shows.
   */
  stepForCode(code: string, mode: DuplicateMode = this.settings.duplicateMode): number | null {
    const position = this.codeMap.get(code);
    if (!position) return null;
    const { east, upLeft } = this.model.vectors;
    const { q, r } = keyCoords(position.col, position.row);
    const offset = bandOffset(q, r, east, upLeft, this.model.tuning.size, mode);
    return this.model.centerStep + east * q - upLeft * r + offset;
  }

  /**
   * Gives the note that the key at this position in the mapping grid plays. It
   * also reports if the main area plays that note.
   *
   * The editor makes such a key grey. Without the grey colour the user cannot
   * see a difference between that key and the other keys.
   *
   * This function reports on the mapping. The `dimDuplicates` setting of the
   * board does not change the result.
   */
  keyCell(col: number, row: number): { step: number; duplicate: boolean } {
    const { east, upLeft } = this.model.vectors;
    const { size } = this.model.tuning;
    const { q, r } = keyCoords(col, row);
    const mode = this.settings.duplicateMode;
    return {
      step: this.model.centerStep + east * q - upLeft * r + bandOffset(q, r, east, upLeft, size, mode),
      duplicate: isEcho(q, r, east, upLeft, size, mode)
    };
  }

  /** Writes the current settings into the address bar. The code replaces the
   *  history entry. It does not add a new entry. */
  private writeHash(): void {
    const hash = `#${encodeState(this.settings)}`;
    if (window.location.hash === hash) return;
    window.history.replaceState(null, "", hash);
  }

  private updatePanCursor(): void {
    this.stage.classList.toggle("panning", this.panMode);
  }
}

function midiKey(note: number): string {
  return `midi${note}`;
}

function inRange(model: Model, step: number): boolean {
  return step >= model.minStep && step <= model.maxStep;
}

/** Changes a mapping-grid position into lattice coordinates. The column gives
 *  q and the row gives -r. */
function keyCoords(col: number, row: number): { q: number; r: number } {
  return { q: col - CENTER_COL, r: -(row - CENTER_ROW) };
}
