/**
 * The sampled piano. The samples are the Salamander Grand set, with a CC-BY
 * licence. The Tone.js project supplies them.
 *
 * The code selects a sample and adjusts its pitch by frequency. It does not
 * use the MIDI number. Thus the samples operate with each EDO and with each
 * reference pitch.
 */

const BASE_URL = "https://tonejs.github.io/audio/salamander/";
const SAMPLE_MIDI = [24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102, 108];
const SAMPLE_NAMES = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];

export type PianoStatus = "idle" | "loading" | "ready" | "failed";

export interface PianoPick {
  readonly buffer: AudioBuffer;
  readonly rate: number;
}

function sampleFile(midi: number): string {
  return `${SAMPLE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}.mp3`;
}

function sampleFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class PianoSampler {
  private readonly buffers = new Map<number, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private state: PianoStatus = "idle";

  onStatusChange: ((status: PianoStatus) => void) | null = null;

  get status(): PianoStatus {
    return this.state;
  }

  get usable(): boolean {
    return this.buffers.size > 0;
  }

  /**
   * Gets each sample.
   *
   * The code does not keep the result of an unsuccessful attempt. Thus a user
   * who opened the page with no network can select the piano again after the
   * network becomes available. The second selection starts a new download.
   */
  load(ctx: AudioContext): Promise<void> {
    if (this.loading) return this.loading;
    this.setStatus("loading");
    this.loading = Promise.all(SAMPLE_MIDI.map((midi) => this.loadSample(ctx, midi)))
      .then(() => this.setStatus("ready"))
      .catch(() => {
        // An incomplete download is playable, because each note uses the
        // nearest available sample. Thus an empty set is an unsuccessful
        // download, but an incomplete set is not.
        this.setStatus(this.usable ? "ready" : "failed");
        if (!this.usable) this.loading = null;
      });
    return this.loading;
  }

  private async loadSample(ctx: AudioContext, midi: number): Promise<void> {
    const response = await fetch(BASE_URL + sampleFile(midi));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    this.buffers.set(midi, await ctx.decodeAudioData(await response.arrayBuffer()));
  }

  /** Selects the sample nearest in pitch. Also gives the playback rate that
   *  makes the frequency `freq`. */
  pick(freq: number): PianoPick | null {
    let best: number | null = null;
    let bestDistance = Infinity;
    for (const midi of this.buffers.keys()) {
      const distance = Math.abs(Math.log2(freq / sampleFrequency(midi)));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = midi;
      }
    }
    if (best === null) return null;
    return { buffer: this.buffers.get(best)!, rate: freq / sampleFrequency(best) };
  }

  private setStatus(status: PianoStatus): void {
    this.state = status;
    this.onStatusChange?.(status);
  }
}
