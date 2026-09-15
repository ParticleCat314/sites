/**
 * The key capture. This gives the complete keyboard to the instrument.
 *
 * The code uses three levels. It selects the first level that is available.
 *
 * 1. The function `navigator.keyboard.lock()` in the fullscreen mode captures
 *    the keys that the browser usually keeps. These are Escape, Tab, F11 and,
 *    in some builds, Ctrl+W. Chromium supplies this function, and only on
 *    HTTPS or on localhost.
 * 2. If that function is not available, `preventDefault()` on each key stops
 *    the quick-find function, the caret browsing, the focus movement and most
 *    function keys.
 * 3. In both conditions the focus moves to the board. Thus no form control
 *    receives a key event.
 *
 * The code always lets a Ctrl combination or a Meta combination through. A web
 * page must not stop Cmd+Q or Ctrl+W.
 */

interface KeyboardLock {
  lock(codes?: string[]): Promise<void>;
  unlock(): void;
}

function keyboardLock(): KeyboardLock | null {
  const api = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  return api && typeof api.lock === "function" ? api : null;
}

export function isKeyLockSupported(): boolean {
  return keyboardLock() !== null;
}

export interface CaptureTarget {
  /** The code moves the focus to this element at entry. Thus a form control
   *  cannot keep the keyboard. */
  readonly element: HTMLElement;
  /** The code calls this function when the browser leaves the fullscreen mode.
   *  The capture must then also stop. */
  onExternalExit(): void;
}

export class KeyCapture {
  private activeValue = false;
  private target: CaptureTarget | null = null;

  get active(): boolean {
    return this.activeValue;
  }

  attach(target: CaptureTarget): void {
    this.target = target;
    document.addEventListener("fullscreenchange", () => {
      // The F11 key and the Escape key of the browser end the fullscreen mode
      // and the key lock. Thus the capture mode must also end. If not, the
      // control shows an incorrect state.
      if (this.activeValue && !document.fullscreenElement) target.onExternalExit();
    });
  }

  async enter(): Promise<void> {
    this.activeValue = true;
    (document.activeElement as HTMLElement | null)?.blur();
    this.target?.element.focus({ preventScroll: true });
    try {
      if (keyboardLock() && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      await keyboardLock()?.lock();
    } catch {
      // The browser refused the fullscreen mode, or it has no lock function.
      // Level 2 of the capture continues to operate.
    }
  }

  async exit(): Promise<void> {
    this.activeValue = false;
    keyboardLock()?.unlock();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* The fullscreen mode already stopped. */
    }
  }
}
