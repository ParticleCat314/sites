# Hexatone

An isomorphic hex keyboard in the browser: any tuning you like — equal
divisions, non-octave scales, historical temperaments, gamelan and just gamuts,
imported Scala files, or degrees you nudge by hand — several grid layouts, scale
masking including generated (MOS) scales, just-ratio labelling, sampled piano
and synth voices, a remappable computer-keyboard grid, and shareable links.

TypeScript compiled straight to ES modules with `tsc` — no bundler, no dev
server framework. The browser loads `dist/main.js` as a module.

## Running

```sh
npm install
npm run build      # or: npm run watch
npm run serve      # http://localhost:8080  (any static server works)
```

`file://` will not work: ES modules and the piano samples both need HTTP.

```sh
npm test           # builds, then unit tests + a full jsdom run of the app
npm run check      # type check only
```

## Concepts

**A tuning is a table of cents.** `size` degrees repeating every `periodCents`.
Equal divisions are just the common case (12 TET is 12 degrees of 100¢); the
same type covers Bohlen–Pierce (13 equal divisions of 3/1), the Carlos scales
(equal divisions of 3/2), quarter-comma meantone, 5-limit just intonation, and
anything an imported `.scl` file describes.

**Steps, not semitones.** A pitch is an integer *step*. Step 0 is 0¢ — "C-1" —
in every tuning, so `register = floor(step / size) - 1` always holds and one
code path serves 12 TET, 31 EDO and a just scale alike. Frequency comes from
`frequency(tuning, step, aHz)`; nothing downstream knows about MIDI.

**12-TET ideas travel by ratio, not by arithmetic.** Scales and layout vectors
are written once in familiar terms and mapped into the active tuning through
`stepsForSemitone`, which rounds a *just ratio* into the tuning. That is why the
major scale lands on 0 5 10 13 18 23 28 in 31 EDO (the real meantone diatonic)
rather than on a linear rescaling of 0 2 4 5 7 9 11.

**Names come from the chain of fifths.** Naturals, then sharps, then flats.
Degrees the chain cannot name — the odd quarter tones of 24 EDO, most of 53 —
get ups-and-downs notation (`C↑`, `C↑↑`, `C+3`). Tunings that do not repeat at
the octave number their degrees instead.

**Grid geometry.** Axial coordinates, pointy-top hexes, `r` growing downwards:

```
step(q, r) = centre + east * q - upLeft * r
```

Each layout supplies `east` and `upLeft` *as a function of the tuning*, so a
layout keeps its musical meaning everywhere: Wicki–Hayden's north-east
neighbour is a fifth in 12 TET (7 steps) and a fifth in 31 EDO (18 steps).
Pointer hit-testing inverts the same formula rather than asking the DOM.

**Ratios, not just cents.** `core/ratios.ts` names any interval by the nearest
just ratio inside a chosen odd limit (5-limit knows 5/4 and 6/5, 7-limit adds
7/4, and so on). It drives both the "just ratios" label mode and the live
readout of whatever is being held, so 31 EDO's major third reads
`5/4 +0.8¢` rather than `387¢`.

**The grid repeats itself.** Mapping a two-dimensional lattice onto one
dimension of pitch is many-to-one: whole lines of hexes play the same note,
spaced by the smallest vector that changes nothing — `(upLeft, east) / gcd`,
which is `(5, 2)` for 12 TET Wicki–Hayden. `core/lattice.ts` finds it, and calls
the instance nearest the centre of the grid the *primary* one. "Grey duplicate
keys" dims every other copy and takes it out of the pointer's reach — that note
is already on screen in the main area, so there is nothing to gain by clicking
its echo, and glides stay inside the shape you are reading. The computer keys
that land on those hexes still play, since for them it is the only route to that
note, and the hex lights up when they do.

**Spare bands can be put to work**, two different ways (Settings ▸ Appearance ▸
"Repeated bands play"):

- **An octave higher or lower.** Band `k` is nudged by `k × size`, continuing the
  pitch climb in the one direction where the geometry says it is flat. Every band
  keeps the same fingering and the same pitch classes, so nothing stops being
  diatonic — it just reaches further. On a computer keyboard in 12 TET
  Wicki–Hayden that takes the mapped keys from 40 notes over 3.5 octaves to 52
  over 5.5. The sign matters: the other direction *cancels* the gradient and
  makes the range smaller.
- **The notes the layout skips.** The image of the map is
  `centre + gcd(east, upLeft) · ℤ`, so 24 EDO Wicki–Hayden — vectors `(4, 10)` —
  plays only every second step and can never sound a quarter tone. Where that
  stride exceeds 1, band `k` shifted by `k mod stride` covers exactly what the
  main area cannot. Those notes are outside the scale, so a mask may hide them.

Whether either helps depends on the tuning: a layout only repeats within reach in
some of them (31 EDO Wicki–Hayden's repeat vector is wider than the whole key
grid), so the dialog measures the actual gain and says so. The computer keyboard
is a window onto the same lattice, so its keys follow whichever mode is on and
still match the hexes they sit on.

**The centre note is the tonic.** Moving the centre of the grid transposes the
board, and by default the scale root moves with it — so the mask, the root
highlight, the cents readings and the just-ratio labels all stay measured from
the note under the middle of the keyboard. Picking a root in the header moves
the centre rather than fighting it. Settings ▸ Scale unlinks the two for the
case where you really do want C major on a grid centred on E.

**Two families of scale mask.** Fixed patterns (the modes, harmonic minor,
blues, hirajōshi…) are written in 12-TET semitones and mapped by ratio. MOS
scales are *generated*: stack one interval `n` times and reduce into the period,
keeping only the results with two distinct step sizes. That second family is
what matters outside 12 TET — 22 EDO's porcupine[7] (generator 3\22) has no
12-TET equivalent — and the mode selector rotates the generator chain, so
fifths in 12 EDO give lydian at mode 0, ionian at mode 1, down to locrian.

## Layout of the source

```
src/
  core/        pure music theory, no DOM, no state
    tuning.ts    the Tuning type, cents maths, note names
    tuning-library.ts  the shipped presets; temperaments generated from their fifths
    scala.ts     .scl parsing
    ratios.ts    nearest just ratio within an odd limit
    layouts.ts   grid vectors per layout, derived from the tuning
    lattice.ts   where the grid repeats, and which copy of a note is primary
    scales.ts    fixed scale patterns and their mapping into a tuning
    mos.ts       generated scales: generators, note counts, modes
    colors.ts    hue by position in the chain of fifths
  state/
    settings.ts  the persisted shape + validation, migration, retuning
    share.ts     the musical settings, packed into the URL hash
    model.ts     the derived read-only picture of the instrument
    keymap.ts    physical key codes to grid positions
  audio/
    synth.ts     polyphonic engine, addressed by key name and Hz
    piano.ts     Salamander samples, picked and shifted by frequency
  view/
    board.ts     the SVG hex grid, pan/zoom, incremental rebuild, pooling
  input/
    pointer.ts   press, glide, pinch, pan, wheel
    keyboard.ts  computer keyboard by physical position
    capture.ts   fullscreen key lock, so every key reaches the instrument
    midi.ts      Web MIDI notes, velocity and the sustain pedal
  ui/
    controls.ts       header bar
    settings-modal.ts settings dialog and the key-map editor
    dom.ts            typed element helpers
  player.ts    grid step -> sound + light, and the scale gate
  app.ts       composition root: settings in, model + redraw out
  main.ts      entry point
test/
  theory.test.mjs  unit tests for core/ (node:test, no DOM)
  smoke.mjs        boots the real app in jsdom and drives the controls
```

The data flow is one-way and boring on purpose: UI mutates `app.settings` and
calls `app.apply()`. That rebuilds the derived `Model`, hands it to the board,
persists, and notifies UI modules to resync their widgets. Nothing else writes
to the board or the synth.

## Extending it

**A tuning** — arbitrary equal divisions and periods are editable in the dialog,
any `.scl` file can be imported, and any degree can be nudged in cents (which
turns the tuning into an explicit table of its own). To add a preset, append to
`TUNING_PRESETS` in `core/tuning-library.ts`. Historical temperaments should be
built with `wellTemperament(name, narrowings)`, which states the fifths and
refuses to compile a circle that does not close.

**A scale** — append to `SCALES` in `core/scales.ts` with its 12-TET semitone
offsets. It will work in every tuning automatically.

**A layout** — append to `LAYOUTS` in `core/layouts.ts` and derive `east` /
`upLeft` from the tuning (use `perfectFifth` / `stepsForRatio` rather than
hard-coded step counts).

**A voice** — add the id to `VoiceId` in `state/settings.ts`, a branch in
`Synth.syntheticVoice`, and an `<option>` in `index.html`.

## Notes on behaviour

- **Layouts stand in for each other.** A layout's vectors are derived from the
  tuning, and some derivations are meaningless outside the tuning family they
  came from — Wicki–Hayden's `2 * fifth - size` is -3 in Bohlen–Pierce, a
  keyboard that descends to the right. `usableLayout` falls back to the first
  layout whose axes both rise, and the footer says which one stood in.
- **The board is anchored to the screen.** Chrome around the stage reflows while
  you play — the readout line fills, the header wraps when the MOS controls
  appear — and the view is centred on the stage, so the keyboard would jump.
  `anchorToStage` shifts the view centre by however far the stage moved, keeping
  the same key under the same pixel. The footer also reserves a fixed row for the
  readout, so the commonest case never reflows at all.
- **MIDI input** (Settings ▸ MIDI keyboard) plays alongside the pointer and the
  computer keyboard, with velocity and the sustain pedal. A note number is not a
  pitch in a 31-degree tuning, so three mappings are offered: one key per step,
  nearest 12-TET pitch, or successive scale degrees. Middle C is always the
  centre of the grid. Web MIDI is Chromium-only and needs a permission prompt;
  everything degrades to "no MIDI" rather than failing.
- **A second computer keyboard cannot be separated from the first.** The OS
  merges all HID keyboards into one event stream, `KeyboardEvent` carries no
  device identity, and WebHID refuses to claim keyboard collections so that a
  page cannot build a keylogger. That would need a native helper.
- **Sustain rings like a piano**: about 14 seconds on the sampled voice, scaled
  by pitch — the square root of the pitch ratio, so the ring doubles per octave
  down and the top of the keyboard dies away quickly. Lifting the pedal damps
  everything still sounding, which is why released voices are kept in a `ringing`
  set rather than forgotten.
- **Space is a sustain pedal**: down sustains, up releases, auto-repeat ignored.
  Settings ▸ Keyboard mapping switches it to a latch. Either way the header
  button latches independently, and both drive one piece of state, as does the
  MIDI pedal. There is no hold-to-pan key; panning is the Pan button, two
  fingers, or a middle drag. Losing window focus releases the pedal, so it
  cannot stick down.
- **Key capture** (⌨ Capture, Esc to leave) hands the whole keyboard to the
  instrument in three layers: `navigator.keyboard.lock()` inside fullscreen where
  Chromium offers it, `preventDefault()` on every other key otherwise, and focus
  parked on the board either way. Ctrl and Meta combinations are always let
  through — an instrument that can swallow Cmd+Q has stopped being a web page.
  The settings dialog suspends capture while it is open and restores it on close.
- **The key grid is 5 rows of 14.** The outer columns and the function row
  (Enter, Backslash, Backspace, F1–F12) only reach the instrument while capture
  is on. Mappings saved by older versions keep their positions; empty cells take
  the new defaults.
- **Greyed duplicates are pointer-inert but key-playable.** `stepAt` refuses
  them, `stepForCode` does not. The key-map editor greys the same keys and counts
  them — in 12 TET Wicki–Hayden, 29 of 61 mapped keys play notes the main area
  already carries, which is the case for putting the repeated bands to work.
- **The octave shift moves the grid, not the signal.** It is folded into the
  model's `centerStep`, so a hex's label always describes the note that hex
  sounds, and the audible range clips shifted pitches like any other — rather
  than a hex reading "D4 · 293.7 Hz" while 1174.7 Hz comes out. The same
  arithmetic bounds the control: `octaveShiftRange` stops the shift where the
  centre note would leave the band, and the arrows go dead there.
- **Polyphony is capped** at 24 voices, stolen oldest-first; the player is told,
  so a stolen note stops glowing.
- **Links win over storage.** A URL hash describes the tuning, layout, scale and
  labels; on load it overrides stored settings, and every later change rewrites
  it via `replaceState`. Volume and key mapping stay local to the machine.

## Credits

Piano samples: Salamander Grand Piano (CC-BY), served by the Tone.js project.
