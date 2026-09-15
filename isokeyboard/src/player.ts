/**
 * Changes a held key into sound and light.
 *
 * The inputs identify a position on the board with a grid step. A grid step is
 * the note that sounds. The function `buildModel` applies the octave shift to
 * the grid. The code does not apply the shift on the path to the synth. Thus
 * the illuminated hex, its label and the pitch always agree.
 */

import type { Synth } from "./audio/synth.js";
import type { HexBoard } from "./view/board.js";
import type { Model } from "./state/model.js";

export interface PlayerContext {
  readonly model: Model;
  /** True if a key outside the scale must stay silent. False if that key must
   *  sound at a lower level. */
  readonly silenceOutOfScale: boolean;
}

const OUT_OF_SCALE_GAIN = 0.45;

export class Player {
  private readonly held = new Map<string, number>();

  /** The code calls this after each change of the held steps. The interval
   *  display uses it. */
  onHeldChange: ((steps: number[]) => void) | null = null;

  constructor(
    private readonly synth: Synth,
    private readonly board: HexBoard,
    private readonly context: () => PlayerContext
  ) {
    // A voice that the synth stopped is already silent. Remove the record of
    // the note and the light.
    synth.onVoiceEnded = (key) => this.release(key);
  }

  press(key: string, gridStep: number, gain = 1): void {
    if (this.held.has(key)) return;
    const { model, silenceOutOfScale } = this.context();
    const inScale = model.inScale(gridStep);
    if (!inScale && silenceOutOfScale) return;

    this.held.set(key, gridStep);
    this.synth.noteOn(key, model.frequency(gridStep), gain * (inScale ? 1 : OUT_OF_SCALE_GAIN));
    this.board.light(gridStep, true);
    this.onHeldChange?.(this.heldSteps());
  }

  release(key: string): void {
    const gridStep = this.held.get(key);
    if (gridStep === undefined) return;
    this.held.delete(key);
    this.synth.noteOff(key);
    if (![...this.held.values()].includes(gridStep)) this.board.light(gridStep, false);
    this.onHeldChange?.(this.heldSteps());
  }

  /** Moves a held key to a different hex. The user does not hear a break. */
  slide(key: string, gridStep: number): void {
    if (this.held.get(key) === gridStep) return;
    this.release(key);
    this.press(key, gridStep);
  }

  releaseAll(): void {
    for (const key of [...this.held.keys()]) this.release(key);
  }

  isHeld(key: string): boolean {
    return this.held.has(key);
  }

  /** Lists the held grid steps from low to high. The list has no duplicates. */
  heldSteps(): number[] {
    return [...new Set(this.held.values())].sort((a, b) => a - b);
  }
}
