import { MusicCard, type Theme } from "./vendor/sheetmusiccard/index";
import { LETTERS, parseNote, type NoteName } from "./theory";

interface VexKey {
  /** VexFlow key string, e.g. "eb/4". */
  key: string;
  accidental: string;
  letter: string;
}

/** Assign octaves starting at octave 4 on the root; bump when the letter wraps. */
function vexKeys(notes: NoteName[], root: NoteName): VexKey[] {
  const rootParsed = parseNote(root);
  let octave = 4;
  let prevLetterIndex = -1;
  const keys: VexKey[] = [];
  for (const note of notes) {
    const p = parseNote(note);
    const letterIndex = LETTERS.indexOf(p.letter as typeof LETTERS[number]);
    if (prevLetterIndex >= 0 && letterIndex < prevLetterIndex) octave++;
    prevLetterIndex = letterIndex;
    keys.push({
      key: `${(p.letter + p.accidental).toLowerCase()}/${octave}`,
      accidental: p.accidental,
      letter: p.letter,
    });
  }
  // closing tonic an octave up
  const rootLetterIndex = LETTERS.indexOf(rootParsed.letter as typeof LETTERS[number]);
  if (rootLetterIndex <= prevLetterIndex) octave++;
  keys.push({
    key: `${(rootParsed.letter + rootParsed.accidental).toLowerCase()}/${octave}`,
    accidental: rootParsed.accidental,
    letter: rootParsed.letter,
  });
  return keys;
}

/**
 * Card theme derived from the active CSS theme variables, so the notation
 * always matches the page palette. The surrounding .stavewrap supplies the
 * frame; the card itself stays transparent and flat.
 */
function cardTheme(): Partial<Theme> {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const focus = v("--focus");
  return {
    background: "transparent",
    staveColor: v("--ink-dim"),
    noteColor: v("--ink"),
    highlightColor: focus,
    highlightGlow: `color-mix(in srgb, ${focus} 45%, transparent)`,
    textColor: v("--ink"),
    padding: "0",
    borderRadius: "0",
    shadow: "none",
    border: "none",
  };
}

/**
 * Scriabin theme: recolor each note group by its pitch class (--pc0..--pc11).
 * Colors go on SVG attributes so the playback highlight (inline styles) still
 * wins while active and reveals the pitch color again when cleared.
 */
function applyPitchColors(container: HTMLElement, pitchClasses: number[]): void {
  const css = getComputedStyle(document.documentElement);
  const groups = container.querySelectorAll<SVGElement>(".vf-stavenote");
  groups.forEach((group, i) => {
    const pc = pitchClasses[i];
    if (pc === undefined) return;
    const color = css.getPropertyValue(`--pc${pc}`).trim();
    if (!color) return;
    for (const el of group.querySelectorAll<SVGElement>("*")) {
      // ledger lines are stroke-only paths sitting directly in the note
      // group; leave them at the stave color like the staff lines
      if (el.parentElement === (group as Element) && el.getAttribute("fill") === "none") continue;
      if (el.getAttribute("fill") !== "none") el.setAttribute("fill", color);
      if (el.getAttribute("stroke") !== "none") el.setAttribute("stroke", color);
    }
  });
}

/** ~0.3 s per quarter note, matching the app's original playback pacing. */
const TEMPO_BPM = 200;

/**
 * Render one ascending pass of the scale as quarter notes on a treble stave,
 * playable through the card's sampled piano with note highlighting.
 */
export function renderStave(
  container: HTMLElement,
  notes: NoteName[],
  root: NoteName,
  onEnd?: () => void,
): MusicCard {
  const keys = vexKeys(notes, root);
  const width = Math.max(360, 60 + keys.length * 46);

  const card = new MusicCard(container, {
    score: { notes: keys.map((k) => ({ keys: [k.key], duration: "q" })), clef: "treble" },
    theme: cardTheme(),
    width,
    playback: { tempo: TEMPO_BPM },
    onEnd,
  });

  // scale down instead of overflowing on narrow screens
  void card.ready.then(() => {
    const rootEl = container.querySelector<HTMLElement>(".sheetmusiccard");
    const svg = container.querySelector("svg");
    if (!rootEl || !svg) return;
    rootEl.style.display = "block";
    rootEl.style.width = "auto";
    rootEl.style.maxWidth = `${width}px`;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "100%";
    svg.style.height = "auto";

    if (document.documentElement.dataset.theme === "scriabin") {
      const pitchClasses = [...notes, root].map((n) => parseNote(n).pitchClass);
      applyPitchColors(container, pitchClasses);
    }
  });

  return card;
}
