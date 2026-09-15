/**
 * Offline support: registers the service worker (which precaches the app
 * shell) and offers a control that pulls the piano samples down so playback
 * works without a network too. The samples are ~4 MB on another origin, so
 * they are never fetched behind the user's back — they arrive either on the
 * first Play or when this button is pressed.
 */

import { preloadPiano } from "./vendor/sheetmusiccard/index";

/** Samples in the MF velocity layer; used to tell "stored" from "partial". */
const EXPECTED_SAMPLES = 62;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** Ask the service worker how many sample files it already holds. */
function cachedSampleCount(): Promise<number> {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(0);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(0), 1500);
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type !== "sample-count") return;
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve((event.data as { count: number }).count);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    worker.postMessage("sample-count");
  });
}

/**
 * Registering is unconditional. Even the self-contained build needs a worker:
 * inlining removes the document's subresources, but the document itself is
 * still an ordinary network request, and with no worker to answer it an
 * offline launch is just a failed navigation.
 */
function registerWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  const register = () => {
    void navigator.serviceWorker.register("sw.js").catch(() => {
      // file:// or an insecure origin — the app still works online
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}

export function initOffline(container: HTMLElement): void {
  registerWorker();

  // the self-contained build carries its samples, so there is nothing to fetch
  if (globalThis.__PIANO_SAMPLES__) {
    const note = document.createElement("p");
    note.className = "offline";
    note.textContent = "This page is self-contained — scales, notation and piano all work offline.";
    container.appendChild(note);
    return;
  }

  if (!("serviceWorker" in navigator)) return;

  const status = document.createElement("p");
  status.className = "offline";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "linkbtn";
  button.textContent = "Save piano for offline use (~4 MB)";

  const text = document.createElement("span");
  text.className = "offline-note";

  const setStored = () => {
    button.remove();
    text.textContent = "Piano samples stored — playback works offline.";
  };

  button.addEventListener("click", () => {
    button.disabled = true;
    button.textContent = "Downloading piano…";
    void preloadPiano().then(
      () => setStored(),
      () => {
        button.disabled = false;
        button.textContent = "Download failed — retry";
      }
    );
  });

  status.append(text, button);
  container.appendChild(status);

  void navigator.serviceWorker.ready.then(async () => {
    if ((await cachedSampleCount()) >= EXPECTED_SAMPLES) {
      setStored();
      return;
    }
    text.textContent = isStandalone()
      ? "Pages and notation are stored offline. "
      : "Add to your home screen to use it offline. Pages and notation are already stored. ";
  });
}

/** Keep the browser chrome color in step with the active theme. */
export function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
  if (paper) meta.content = paper;
}
