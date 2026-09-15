/**
 * The polyphonic voice engine.
 *
 * The caller identifies each note with a string key and a frequency in Hz.
 * There is one key for each pointer and for each computer key. This module has
 * no data about the tunings, the MIDI numbers or the grid.
 */

import { PianoSampler } from "./piano.js";
import type { VoiceId } from "../state/settings.js";

interface Voice {
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  release: number;
  releaseSustained: number;
}

const SYNTH_RELEASE = 0.28;
const SYNTH_RELEASE_SUSTAINED = 6;

/**
 * The time that a note sounds while the sustain is on, before the pitch
 * adjustment below.
 *
 * On a piano the dampers move up and the string decays without a force. This
 * takes much more time than a usual synthesizer release.
 */
const PIANO_RELEASE_SUSTAINED = 14;
const PIANO_SYNTH_RELEASE_SUSTAINED = 10;

/**
 * Adjusts the release time for the pitch.
 *
 * A long string sounds for more time than a short string. The bass strings of
 * a piano sound for almost one minute. The top octave decays in two seconds.
 *
 * The code multiplies the time by the square root of the pitch ratio. The time
 * then doubles for each octave down. This is a sufficiently accurate model of
 * a real instrument.
 */
export function sustainedRelease(base: number, freq: number): number {
  const scale = Math.sqrt(440 / Math.max(freq, 1));
  return base * Math.min(2.5, Math.max(0.45, scale));
}

/** The largest number of voices. Above this number the code stops the oldest
 *  voice. A fast glide with the sustain on can start many voices, and the
 *  sound then becomes unclear. */
const MAX_VOICES = 24;
const STEAL_RELEASE = 0.05;
/** The release time when the user lifts the pedal. The code then damps each
 *  voice that continues to sound. */
const PEDAL_LIFT_RELEASE = 0.3;

/** The end value of a release ramp. The user cannot hear this level. The value
 *  is not 0, because an exponential ramp cannot end at 0. */
const SILENCE = 0.0008;
/**
 * The lowest start value of a release ramp.
 *
 * An exponential ramp from 0 has no defined result. A synthetic voice that the
 * user releases during its attack of four milliseconds is still at 0.
 */
const RAMP_FLOOR = 0.0001;

/** The time between the end of a ramp and the stop of the sources. The ramp
 *  then always completes. */
const SOURCE_STOP_PADDING = 0.05;
/** The equivalent time for a voice that the code stops. That voice ends
 *  quickly, thus the code frees its sources sooner. */
const STEAL_STOP_PADDING = 0.02;

export class Synth {
  readonly piano = new PianoSampler();

  /** The code calls this when a voice ends without a release from the caller.
   *  At present this occurs only when the code stops the oldest voice. */
  onVoiceEnded: ((key: string) => void) | null = null;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echoSend: GainNode | null = null;
  private readonly voices = new Map<string, Voice>();
  /** The voices that the caller released and that continue to sound. A lift of
   *  the pedal must make these voices silent. */
  private readonly ringing = new Set<Voice>();

  private volumeValue = 0.7;
  private voiceValue: VoiceId = "piano";
  private sustainValue = false;

  set volume(value: number) {
    this.volumeValue = value;
    if (this.master) this.master.gain.value = value * 0.5;
  }

  set voice(value: VoiceId) {
    this.voiceValue = value;
  }

  set sustain(value: boolean) {
    const lifted = this.sustainValue && !value;
    this.sustainValue = value;
    if (lifted) this.damp();
  }

  get activeCount(): number {
    return this.voices.size;
  }

  /** Counts the voices that continue to sound after the release of their key. */
  get ringingCount(): number {
    return this.ringing.size;
  }

  /** Makes the audio graph at the first call. The caller can call this
   *  function at each user action. */
  ensureContext(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.volumeValue * 0.5;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 6;
    master.connect(compressor).connect(ctx.destination);
    this.master = master;

    // The echo path.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.29;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1600;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    const send = ctx.createGain();
    send.gain.value = 1;
    send.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    damp.connect(wet).connect(master);
    this.echoSend = send;

    return ctx;
  }

  loadPiano(): Promise<void> {
    return this.piano.load(this.ensureContext());
  }

  noteOn(key: string, freq: number, gain = 1): void {
    if (this.voices.has(key)) return;
    const ctx = this.ensureContext();
    while (this.voices.size >= MAX_VOICES) this.steal();
    // The code gets the samples at the first note. It does not get them at the
    // page load. An AudioContext before an action by the user causes an
    // autoplay warning. Also, a user who does not select the piano does not
    // download the samples.
    if (this.voiceValue === "piano" && this.piano.status === "idle") void this.loadPiano();
    const voice =
      this.voiceValue === "piano" && this.piano.usable
        ? this.sampledVoice(ctx, freq, gain)
        : this.syntheticVoice(ctx, freq, gain);
    if (voice) this.voices.set(key, voice);
  }

  noteOff(key: string): void {
    const voice = this.voices.get(key);
    if (!voice || !this.ctx) return;
    this.voices.delete(key);
    const release = this.sustainValue ? voice.releaseSustained : voice.release;
    this.fadeOut(voice, release);

    // The code must keep a record of each long release. If not, a lift of the
    // pedal cannot stop the note, and the note sounds to its end.
    this.ringing.add(voice);
    window.setTimeout(() => this.ringing.delete(voice), (release + 0.1) * 1000);
  }

  allOff(): void {
    for (const key of [...this.voices.keys()]) this.noteOff(key);
    this.damp();
  }

  /** Damps each voice that continues to sound. */
  private damp(): void {
    for (const voice of this.ringing) this.fadeOut(voice, PEDAL_LIFT_RELEASE);
    this.ringing.clear();
  }

  /** Ends the oldest voice quickly. A Map gives its keys in the order of
   *  insertion, thus the first key is the oldest voice. */
  private steal(): void {
    const oldest = this.voices.keys().next();
    if (oldest.done) return;
    const key = oldest.value;
    const voice = this.voices.get(key)!;
    this.voices.delete(key);
    this.fadeOut(voice, STEAL_RELEASE, STEAL_STOP_PADDING);
    this.onVoiceEnded?.(key);
  }

  /**
   * Decreases the level of a voice to silence. Stops its sources after the
   * ramp completes.
   *
   * The code applies a minimum to the start value. An exponential ramp from 0
   * has no defined result, and a voice that the user releases during its
   * attack is still at 0.
   */
  private fadeOut(voice: Voice, release: number, padding = SOURCE_STOP_PADDING): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const { gain } = voice.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(gain.value, RAMP_FLOOR), now);
    gain.exponentialRampToValueAtTime(SILENCE, now + release);
    for (const source of voice.sources) source.stop(now + release + padding);
  }

  private sampledVoice(ctx: AudioContext, freq: number, gain: number): Voice | null {
    const pick = this.piano.pick(freq);
    if (!pick) return null;
    const source = ctx.createBufferSource();
    source.buffer = pick.buffer;
    source.playbackRate.value = pick.rate;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0.9 * gain, ctx.currentTime);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    source.connect(level);
    level.connect(this.master!);
    level.connect(send).connect(this.echoSend!);
    source.start(ctx.currentTime);
    return {
      sources: [source],
      gain: level,
      release: 0.22, // The dampers stop the string quickly.
      releaseSustained: sustainedRelease(PIANO_RELEASE_SUSTAINED, freq)
    };
  }

  private syntheticVoice(ctx: AudioContext, freq: number, gain: number): Voice {
    const now = ctx.currentTime;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0, now);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.8;

    const sources: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, frequency: number, detune: number, amount: number): void => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = frequency;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = amount;
      o.connect(g).connect(filter);
      o.start(now);
      sources.push(o);
    };

    let peak = 0.32 * gain;
    let struck = false;

    switch (this.voiceValue) {
      case "piano": // The code uses this while the samples load, or with no network.
        osc("sine", freq, 0, 1);
        osc("sine", freq * 2, 3, 0.35);
        osc("sine", freq * 3, -4, 0.16);
        osc("triangle", freq, 0, 0.2);
        filter.frequency.setValueAtTime(Math.min(freq * 8, 7000), now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 300), now + 1.2);
        peak = 0.4 * gain;
        struck = true;
        break;
      case "warm":
        osc("sawtooth", freq, -7, 0.5);
        osc("sawtooth", freq, 7, 0.5);
        filter.frequency.setValueAtTime(Math.min(freq * 6, 4500), now);
        filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 3, 2400), now + 0.5);
        break;
      case "glass":
        osc("triangle", freq, 0, 0.7);
        osc("sine", freq * 2, 4, 0.35);
        filter.frequency.value = 8000;
        peak = 0.38 * gain;
        break;
      case "pure":
        osc("sine", freq, 0, 1);
        filter.frequency.value = 9000;
        peak = 0.42 * gain;
        break;
    }

    filter.connect(level);
    level.connect(this.master!);
    level.connect(this.echoSend!);

    if (struck) {
      level.gain.linearRampToValueAtTime(peak, now + 0.004);
      level.gain.exponentialRampToValueAtTime(peak * 0.25, now + 0.9);
      // The decay must be longer than the maximum sustain time. If not, the
      // note stops before the user lifts the pedal.
      level.gain.exponentialRampToValueAtTime(0.002, now + 18);
      return {
        sources,
        gain: level,
        release: 0.25,
        releaseSustained: sustainedRelease(PIANO_SYNTH_RELEASE_SUSTAINED, freq)
      };
    }
    level.gain.linearRampToValueAtTime(peak, now + 0.008);
    level.gain.exponentialRampToValueAtTime(peak * 0.6, now + 0.35);
    return {
      sources,
      gain: level,
      release: SYNTH_RELEASE,
      releaseSustained: sustainedRelease(SYNTH_RELEASE_SUSTAINED, freq)
    };
  }
}
