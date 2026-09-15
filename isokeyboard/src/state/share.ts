/**
 * The shared links.
 *
 * The URL hash contains the musical settings. These are the tuning, which can
 * include an imported table of cents, the layout, the scale and the labels.
 * The hash does not contain the key mapping or the volume. Those two settings
 * are specific to one machine.
 *
 * A hash in the URL at load replaces the stored settings. Each subsequent
 * change writes the hash again. Thus the address bar always describes the
 * active instrument.
 */

import type { Settings } from "./settings.js";

const SHARED_KEYS = [
  "tuning",
  "aHz",
  "layout",
  "centerRegister",
  "centerDegree",
  "scale",
  "scaleRoot",
  "rootFollowsCenter",
  "mosGenerator",
  "mosNotes",
  "mosMode",
  "outOfScale",
  "dimDuplicates",
  "duplicateMode",
  "labels",
  "jiLimit"
] as const satisfies readonly (keyof Settings)[];

export type SharedSettings = Pick<Settings, (typeof SHARED_KEYS)[number]>;

export function encodeState(settings: Settings): string {
  const shared: Partial<SharedSettings> = {};
  for (const key of SHARED_KEYS) Object.assign(shared, { [key]: settings[key] });
  return toBase64Url(JSON.stringify(shared));
}

export function decodeState(hash: string): Partial<Settings> | null {
  const encoded = hash.replace(/^#/, "").trim();
  if (!encoded) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(encoded));
    return parsed && typeof parsed === "object" ? (parsed as Partial<Settings>) : null;
  } catch {
    return null; // The link has an error. Use the stored settings.
  }
}

export function shareUrl(settings: Settings): string {
  const url = new URL(window.location.href);
  url.hash = encodeState(settings);
  return url.toString();
}

function toBase64Url(text: string): string {
  const binary = String.fromCharCode(...new TextEncoder().encode(text));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
