import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  VexFlow,
  Voice,
} from "vexflow";
import type { ScoreObject, Theme } from "./types";

export interface RenderResult {
  svg: SVGSVGElement;
  /** SVG group per note, index-aligned with score.notes. */
  noteElements: SVGElement[];
}

const REST_KEYS: Record<string, string[]> = {
  treble: ["b/4"],
  bass: ["d/3"],
  alto: ["c/4"],
  tenor: ["a/3"],
};

let fontsPromise: Promise<void> | undefined;

/**
 * The two faces VexFlow actually draws with by default (Metrics fontFamily is
 * "Bravura,Academico"). `VexFlow.loadFonts()` with no arguments pulls all ~20
 * bundled faces from jsDelivr; naming these two keeps it to one request each
 * and lets them be served from our own origin, which is what makes notation
 * render offline.
 */
const MUSIC_FONTS = ["Bravura", "Academico"];

/** Where the self-hosted copies live, relative to the page. */
const FONT_HOST_URL = "fonts/vexflow/";

/**
 * A self-contained build has no sibling files to fetch, so it publishes the
 * music fonts as data URIs on the window for us to load from instead.
 */
declare global {
  // eslint-disable-next-line no-var
  var __VEXFLOW_FONT_URLS__: Record<string, string> | undefined;
}

/** Resolves when VexFlow's music fonts are usable (never rejects). */
export function fontsLoaded(): Promise<void> {
  fontsPromise ??= (async () => {
    try {
      const inlined = globalThis.__VEXFLOW_FONT_URLS__;
      if (inlined) {
        await Promise.all(
          MUSIC_FONTS.map((name) =>
            inlined[name] ? VexFlow.Font.load(name, inlined[name]) : Promise.resolve()
          )
        );
        return;
      }
      VexFlow.Font.HOST_URL = FONT_HOST_URL;
      await VexFlow.loadFonts(...MUSIC_FONTS);
    } catch {
      // jsdom / older browsers without the FontFace API — draw anyway.
    }
  })();
  return fontsPromise;
}

const SHARP_ORDER = ["f", "c", "g", "d", "a", "e", "b"];
const FLAT_ORDER = ["b", "e", "a", "d", "g", "c", "f"];
const SHARP_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#"];
const FLAT_KEYS = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];

/** Letter -> accidental put in force (for every octave) by a key signature. */
function keySignatureBaseline(keySignature?: string): Map<string, string> {
  const baseline = new Map<string, string>();
  if (!keySignature) return baseline;
  const sharps = SHARP_KEYS.indexOf(keySignature);
  const flats = FLAT_KEYS.indexOf(keySignature);
  if (sharps > 0) SHARP_ORDER.slice(0, sharps).forEach((l) => baseline.set(l, "#"));
  else if (flats > 0) FLAT_ORDER.slice(0, flats).forEach((l) => baseline.set(l, "b"));
  return baseline;
}

/**
 * Which accidental glyph (if any) each key of each note should carry.
 * Accidentals apply for the rest of the measure to their letter+octave, so
 * glyphs already in force are skipped and naturals are inserted to cancel an
 * earlier accidental on the same staff position. A key signature puts its
 * accidentals in force for every octave of the affected letters. An explicit
 * "n" in a key always renders. Rests get an empty list.
 */
export function accidentalGlyphs(
  notes: ScoreObject["notes"],
  keySignature?: string
): (string | null)[][] {
  const baseline = keySignatureBaseline(keySignature);
  const inForce = new Map<string, string>();
  return notes.map((note) => {
    if (note.rest) return [];
    return note.keys.map((key) => {
      const match = /^([a-g])(#{1,2}|b{1,2}|n)?\/(-?\d+)/i.exec(key);
      if (!match) return null;
      const [, letter, accidental = "", octave] = match;
      const slot = `${letter!.toLowerCase()}/${octave}`;
      const wanted = accidental === "n" ? "" : accidental.toLowerCase();
      const current = inForce.get(slot) ?? baseline.get(letter!.toLowerCase()) ?? "";
      if (accidental !== "n" && wanted === current) return null;
      inForce.set(slot, wanted);
      return wanted === "" ? "n" : wanted;
    });
  });
}

export function renderScore(
  host: HTMLDivElement,
  score: ScoreObject,
  theme: Theme,
  width: number,
  scale: number
): RenderResult {
  const clef = score.clef ?? "treble";
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  const context = renderer.getContext();

  const glyphPlan = accidentalGlyphs(score.notes, score.keySignature);
  const staveNotes = score.notes.map((note, noteIndex) => {
    const duration = note.duration + (note.rest ? "r" : "");
    const keys = note.rest ? REST_KEYS[clef] ?? ["b/4"] : note.keys;
    const staveNote = new StaveNote({ keys, duration, clef });

    glyphPlan[noteIndex]!.forEach((glyph, i) => {
      if (glyph) staveNote.addModifier(new Accidental(glyph), i);
    });
    if (note.dotted) Dot.buildAndAttach([staveNote], { all: true });
    staveNote.setStyle({
      fillStyle: theme.noteColor,
      strokeStyle: theme.noteColor,
    });
    staveNote.setLedgerLineStyle({
      strokeStyle: theme.staveColor,
      fillStyle: theme.staveColor,
    });
    return staveNote;
  });

  const beams = Beam.generateBeams(staveNotes);
  beams.forEach((beam) =>
    beam.setStyle({ fillStyle: theme.noteColor, strokeStyle: theme.noteColor })
  );

  const innerWidth = width / scale;
  const stave = new Stave(0, 8, innerWidth - 2);
  stave.addClef(clef);
  if (score.timeSignature) stave.addTimeSignature(score.timeSignature);
  if (score.keySignature) stave.addKeySignature(score.keySignature);
  stave.setStyle({ fillStyle: theme.staveColor, strokeStyle: theme.staveColor });
  // drawWithStyle, not draw: Stave.draw() ignores the style set above, leaving
  // the lines, clef and barlines at the context default (black)
  stave.setContext(context).drawWithStyle();

  const voice = new Voice({ numBeats: 4, beatValue: 4 });
  voice.setStrict(false);
  voice.addTickables(staveNotes);
  new Formatter()
    .joinVoices([voice])
    .format([voice], innerWidth - stave.getNoteStartX() - 24);
  voice.draw(context, stave);
  beams.forEach((beam) => beam.setContext(context).draw());

  const svg = host.querySelector("svg") as SVGSVGElement;
  const contentHeight = 140;
  renderer.resize(width, contentHeight * scale);
  svg.setAttribute("viewBox", `0 0 ${innerWidth} ${contentHeight}`);
  svg.style.display = "block";

  // getSVGElement() relies on document-level id lookup and can return
  // undefined while the card is detached; fall back to DOM order, which
  // matches draw (= score) order.
  const drawnGroups = svg.querySelectorAll<SVGElement>(".vf-stavenote");
  const noteElements = staveNotes.map(
    (note, i) => note.getSVGElement() ?? drawnGroups[i]
  );
  return {
    svg,
    noteElements: noteElements.filter((el): el is SVGElement => !!el),
  };
}
