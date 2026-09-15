/**
 * The MIDI keyboards. These are an additional input with the pointer and the
 * computer keyboard.
 *
 * The code reads the note-on messages, the note-off messages and the sustain
 * pedal only. This is sufficient for a controller to play the grid.
 *
 * MIDI access needs an action by the user and a permission message. At this
 * time, Chromium browsers supply it. Thus each path in this module gives the
 * "no MIDI" condition instead of an error.
 *
 * A note number is not a pitch. The caller selects the step, because a tuning
 * of 31 degrees has no single correct method.
 */

export type MidiStatus = "unsupported" | "idle" | "requesting" | "ready" | "denied";

export interface MidiHandlers {
  onNoteOn(note: number, velocity: number, channel: number): void;
  onNoteOff(note: number, channel: number): void;
  onSustain(down: boolean): void;
  onAllNotesOff(): void;
}

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const CC_SUSTAIN = 64;
const CC_ALL_NOTES_OFF = 123;

export class MidiInput {
  onStatusChange: ((status: MidiStatus, devices: string[]) => void) | null = null;

  private access: MIDIAccess | null = null;
  private statusValue: MidiStatus;
  /** The number of inputs at the last connection. The code compares this count
   *  to find a device that the user disconnected. */
  private boundCount = 0;

  constructor(private readonly handlers: MidiHandlers) {
    this.statusValue = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator ? "idle" : "unsupported";
  }

  get status(): MidiStatus {
    return this.statusValue;
  }

  get devices(): string[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((input) => input.name ?? "Unnamed device");
  }

  get supported(): boolean {
    return this.statusValue !== "unsupported";
  }

  async connect(): Promise<void> {
    if (!this.supported || this.statusValue === "requesting") return;
    this.setStatus("requesting");
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      this.setStatus("denied");
      return;
    }
    // A user connects and disconnects a controller frequently. Thus the code
    // connects to the inputs again after each change of the list.
    this.access.onstatechange = () => {
      this.bindInputs();
      this.setStatus("ready");
    };
    this.bindInputs();
    this.setStatus("ready");
  }

  private bindInputs(): void {
    if (!this.access) return;
    const previousCount = this.boundCount;
    this.boundCount = this.access.inputs.size;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event) => this.handle(event);
    }
    // A device that the user disconnects during a chord sends no note-off
    // messages. Its notes then continue to sound. The code cannot identify the
    // notes of that device. Thus it releases all notes.
    if (this.boundCount < previousCount) this.handlers.onAllNotesOff();
  }

  private handle(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 2) return;
    const command = data[0] & 0xf0;
    const channel = data[0] & 0x0f;

    if (command === NOTE_ON) {
      const velocity = data[2] ?? 0;
      // A note-on message with a velocity of 0 is the usual note-off message.
      if (velocity === 0) this.handlers.onNoteOff(data[1], channel);
      else this.handlers.onNoteOn(data[1], velocity, channel);
      return;
    }
    if (command === NOTE_OFF) {
      this.handlers.onNoteOff(data[1], channel);
      return;
    }
    if (command === CONTROL_CHANGE) {
      if (data[1] === CC_SUSTAIN) this.handlers.onSustain((data[2] ?? 0) >= 64);
      else if (data[1] === CC_ALL_NOTES_OFF) this.handlers.onAllNotesOff();
    }
  }

  private setStatus(status: MidiStatus): void {
    this.statusValue = status;
    this.onStatusChange?.(status, this.devices);
  }
}

export function describeMidiStatus(status: MidiStatus, devices: string[]): string {
  switch (status) {
    case "unsupported":
      return "This browser has no Web MIDI — try Chrome, Edge or Opera.";
    case "idle":
      return "Not connected.";
    case "requesting":
      return "Asking for permission…";
    case "denied":
      return "Permission refused. Allow MIDI for this site and try again.";
    case "ready":
      return devices.length === 0 ? "Connected — no devices found yet. Plug one in." : `Listening to ${devices.join(", ")}.`;
  }
}
