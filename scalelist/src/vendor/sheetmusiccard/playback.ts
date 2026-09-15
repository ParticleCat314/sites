import { SplendidGrandPiano } from "smplr";
import type { NoteEvent, PlaybackOptions } from "./types";

export interface PlaybackCallbacks {
  onNote?: (index: number) => void;
  onEnd?: () => void;
}

let sharedContext: AudioContext | undefined;
let sharedPiano: SplendidGrandPiano | undefined;
let pianoReady: Promise<unknown> | undefined;

/**
 * The sampler ships five velocity layers (~20 MB). We always play at one
 * dynamic, so only the mezzo-forte layer is loaded: ~4 MB, which is the
 * difference between usable and unusable on a phone, and small enough for the
 * service worker to keep for offline playback.
 */
const VELOCITY_RANGE: [number, number] = [85, 100];
const PLAY_VELOCITY = 96;
const ALL_MIDI = Array.from({ length: 128 }, (_, i) => i);

/**
 * A self-contained build embeds the samples in the page and exposes them here,
 * keyed by file name ("MF C4.m4a"), base64-encoded. When present the sampler
 * reads from it instead of the network.
 */
declare global {
  // eslint-disable-next-line no-var
  var __PIANO_SAMPLES__: Record<string, string> | undefined;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** smplr Storage backed by the embedded samples; misses report 404. */
function embeddedStorage(samples: Record<string, string>) {
  return {
    fetch: async (url: string) => {
      const name = decodeURIComponent(url.split("/").pop() ?? "");
      const base64 = samples[name];
      const empty = new ArrayBuffer(0);
      return {
        status: base64 ? 200 : 404,
        arrayBuffer: async () => (base64 ? base64ToArrayBuffer(base64) : empty),
        json: async () => ({}),
        text: async () => "",
      };
    },
  };
}

function pianoOptions() {
  const samples = globalThis.__PIANO_SAMPLES__;
  return {
    notesToLoad: { notes: ALL_MIDI, velocityRange: VELOCITY_RANGE },
    ...(samples
      ? { storage: embeddedStorage(samples), formats: ["m4a"] }
      : {}),
  };
}

/** Piano + AudioContext are shared across all cards on the page. */
async function getPiano(): Promise<{
  piano: SplendidGrandPiano;
  context: AudioContext;
}> {
  if (!sharedContext) sharedContext = new AudioContext();
  if (!sharedPiano) {
    sharedPiano = new SplendidGrandPiano(sharedContext, pianoOptions());
    pianoReady = sharedPiano.load;
  }
  await pianoReady;
  if (sharedContext.state === "suspended") await sharedContext.resume();
  return { piano: sharedPiano, context: sharedContext };
}

/**
 * Fetch and decode the samples without playing anything. The AudioContext
 * stays suspended, so this needs no user gesture; it exists so the app can
 * warm the sampler (and, behind a service worker, store it for offline use)
 * before the first Play.
 */
export async function preloadPiano(): Promise<void> {
  if (!sharedContext) sharedContext = new AudioContext();
  if (!sharedPiano) {
    sharedPiano = new SplendidGrandPiano(sharedContext, pianoOptions());
    pianoReady = sharedPiano.load;
  }
  await pianoReady;
}

export class PlaybackEngine {
  private events: NoteEvent[] = [];
  private options: Required<PlaybackOptions>;
  private callbacks: PlaybackCallbacks;
  private rafId: number | null = null;
  private startTime = 0;
  private playing = false;
  private stopScheduled: (() => void) | null = null;

  constructor(
    events: NoteEvent[],
    options: PlaybackOptions = {},
    callbacks: PlaybackCallbacks = {}
  ) {
    this.events = events;
    this.options = {
      tempo: options.tempo ?? 90,
      loop: options.loop ?? false,
      volume: options.volume ?? 1,
    };
    this.callbacks = callbacks;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setTempo(tempo: number): void {
    this.options.tempo = tempo;
  }

  async play(): Promise<void> {
    if (this.playing) return;
    const { piano, context } = await getPiano();
    if (this.playing) return; // double-start guard across the await
    this.playing = true;

    const secondsPerBeat = 60 / this.options.tempo;
    const start = context.currentTime + 0.1;
    this.startTime = start;

    piano.output.volume = Math.round(100 * this.options.volume);

    const stops: Array<() => void> = [];
    for (const event of this.events) {
      for (const midi of event.midi) {
        const stop = piano.start({
          note: midi,
          time: start + event.startBeats * secondsPerBeat,
          duration: event.durationBeats * secondsPerBeat * 0.95,
          // volume rides the gain node, not the layer choice: velocity has to
          // stay inside the one loaded layer or no region matches and the note
          // is silent
          velocity: PLAY_VELOCITY,
        });
        stops.push(stop as unknown as () => void);
      }
    }
    this.stopScheduled = () => stops.forEach((stop) => stop());

    const last = this.events[this.events.length - 1];
    const totalBeats = last ? last.startBeats + last.durationBeats : 0;
    const endTime = start + totalBeats * secondsPerBeat;

    let lastIndex = -1;
    const tick = () => {
      if (!this.playing) return;
      const now = context.currentTime;
      if (now >= endTime) {
        this.finish();
        if (this.options.loop) void this.play();
        return;
      }
      const beat = (now - this.startTime) / secondsPerBeat;
      const index = this.indexAtBeat(beat);
      if (index !== lastIndex && index >= 0) {
        lastIndex = index;
        this.callbacks.onNote?.(index);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (!this.playing) return;
    this.stopScheduled?.();
    this.finish();
  }

  private finish(): void {
    this.playing = false;
    this.stopScheduled = null;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.callbacks.onEnd?.();
  }

  private indexAtBeat(beat: number): number {
    if (beat < 0) return -1;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (beat >= this.events[i]!.startBeats) return i;
    }
    return -1;
  }
}
