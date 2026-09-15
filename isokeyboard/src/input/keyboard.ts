/**
 * The computer keyboard. The code reads each key as a physical position, with
 * the `KeyboardEvent.code` value. Thus the default rows are in the same
 * positions on QWERTY, QWERTZ, AZERTY, Dvorak and Colemak keyboards.
 */

import type { Player } from "../player.js";

export interface KeyboardInputOptions {
  readonly player: Player;
  /** Returns true if a different part of the app uses the keyboard. The
   *  settings dialog is one example. */
  isBusy(): boolean;
  /** Returns true in the capture mode. The code then stops each key that the
   *  browser uses. */
  isCapturing(): boolean;
  /** Gives the grid step for a physical key. Gives null if the mapping does
   *  not contain the key. */
  stepForCode(code: string): number | null;
  /** Reports a down event or an up event on the space bar. The app selects the
   *  hold mode or the toggle mode. */
  onSustainKey(down: boolean): void;
  /** Reports the Escape key during the capture mode. This ends the mode. */
  onEscape(): void;
}

export function attachKeyboardInput(options: KeyboardInputOptions): void {
  const { player, isBusy, isCapturing, stepForCode, onSustainKey, onEscape } = options;
  const noteKey = (code: string): string => `k${code}`;

  const isTyping = (event: KeyboardEvent): boolean => {
    const tag = (event.target as HTMLElement | null)?.tagName;
    return tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA";
  };

  window.addEventListener("keydown", (event) => {
    if (isBusy() || isTyping(event)) return;
    // Always let the browser shortcuts through, in each mode.
    if (event.ctrlKey || event.metaKey) return;
    const capturing = isCapturing();
    if (event.altKey && !capturing) return;

    if (capturing && event.code === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) onSustainKey(true);
      return;
    }

    // In the capture mode the code stops Tab, the quick-find function, the
    // function keys and each other key. Thus the user can map each key.
    if (capturing) event.preventDefault();
    if (event.repeat) return;

    const step = stepForCode(event.code);
    if (step === null) return;
    event.preventDefault();
    player.press(noteKey(event.code), step);
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      // The code applies the conditions to the pedal only. A space character
      // in a settings field did not operate the pedal. Thus it must not end a
      // sustain that is latched on.
      if (!isBusy() && !isTyping(event)) onSustainKey(false);
      return;
    }
    // The code always releases a note. If the focus moves while a key is down,
    // the key gives no up event, and the note continues to sound.
    player.release(noteKey(event.code));
  });

  // The user can move to a different window while keys are down. Without this
  // listener the notes continue to sound and the pedal stays down.
  window.addEventListener("blur", () => {
    player.releaseAll();
    onSustainKey(false);
  });
}
