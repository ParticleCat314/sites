/** A single note (or chord) in the simple JSON score format. */
export interface NoteInput {
  /** Pitches in VexFlow key format, e.g. "c/4", "eb/5". Multiple keys = chord. */
  keys: string[];
  /** VexFlow duration: "w" | "h" | "q" | "8" | "16" | "32". */
  duration: string;
  /** Render (and count) as a rest. */
  rest?: boolean;
  /** Dotted note (duration * 1.5). */
  dotted?: boolean;
}

/** JSON score object. */
export interface ScoreObject {
  notes: NoteInput[];
  clef?: string; // "treble" | "bass" | ...
  timeSignature?: string; // e.g. "4/4"
  keySignature?: string; // e.g. "G"
}

/**
 * Score input: either a VexFlow EasyScore string, e.g. "C4/q, D4, E4/h",
 * or a {@link ScoreObject}.
 */
export type ScoreInput = string | ScoreObject;

/** Visual theme for a card. */
export interface Theme {
  /** Card background (any CSS color/gradient). */
  background: string;
  /** Staff lines, clef, barlines. */
  staveColor: string;
  /** Noteheads, stems, beams, flags. */
  noteColor: string;
  /** Fill/stroke applied to the currently playing note. */
  highlightColor: string;
  /** Soft glow behind the highlighted note (CSS color, "" to disable). */
  highlightGlow?: string;
  /** Title text color. */
  textColor: string;
  /** CSS font-family for the title. */
  fontFamily?: string;
  /** Card padding, CSS length. */
  padding?: string;
  /** Card border radius, CSS length. */
  borderRadius?: string;
  /** Card box-shadow. */
  shadow?: string;
  /** Card border, CSS shorthand. */
  border?: string;
}

export type ThemeName = "paper" | "midnight" | "sepia" | "mint";

/** Entrance animation styles. */
export type AnimationType = "none" | "fade" | "stagger" | "rise";

export interface AnimationOptions {
  type: AnimationType;
  /** Total duration in ms (per-note for staggered types). Default 600. */
  duration?: number;
  /** Delay between successive notes in ms for "stagger" / "rise". Default 60. */
  staggerDelay?: number;
}

export interface PlaybackOptions {
  /** Quarter-note beats per minute. Default 90. */
  tempo?: number;
  /** Loop playback until stop() is called. */
  loop?: boolean;
  /** Master gain 0..1. Default 1. */
  volume?: number;
}

export interface CardOptions {
  score: ScoreInput;
  /** Preset name or full/partial custom theme (merged over "paper"). */
  theme?: ThemeName | Partial<Theme>;
  /** Optional title rendered above the staff. */
  title?: string;
  /** Card width in px. Height follows content. Default 360. */
  width?: number;
  /** Visual scale of the notation. Default 1. */
  scale?: number;
  animation?: AnimationType | AnimationOptions;
  playback?: PlaybackOptions;
  /** Highlight the sounding note during playback. Default true. */
  highlightPlayback?: boolean;
  /** Render built-in play/stop controls. Default false. */
  controls?: boolean;
  /** Called when a note starts sounding (index into the parsed note list). */
  onNote?: (index: number) => void;
  /** Called when playback finishes or is stopped. */
  onEnd?: () => void;
}

/** Internal: one scheduled, renderable note event. */
export interface NoteEvent {
  /** MIDI numbers to sound (empty for rests). */
  midi: number[];
  /** Start time in quarter-note beats from 0. */
  startBeats: number;
  /** Length in quarter-note beats. */
  durationBeats: number;
  rest: boolean;
}
