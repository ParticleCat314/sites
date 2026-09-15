import type { NoteName } from "./theory";

export interface Scale {
  name: string;
  /** English Wikipedia article slug (part after /wiki/), when a good one exists. */
  wiki?: string;
  /** Common alternative names, "·"-separated. */
  alias: string;
  /** Canonical spelling with tonic C; transposed at render time. */
  notes: NoteName[];
  desc: string;
}

export interface Category {
  cat: string;
  note?: string;
  scales: Scale[];
}

export const DATA: Category[] = [
  {
    cat: "Major, minor and their variants",
    note: "The core tonal scales of Western harmony.",
    scales: [
      { name: "Major", wiki: "Major_scale", alias: "Ionian", notes: ["C", "D", "E", "F", "G", "A", "B"], desc: "The reference diatonic scale. All degree formulas on this page are relative to it." },
      { name: "Natural minor", wiki: "Minor_scale", alias: "Aeolian", notes: ["C", "D", "Eb", "F", "G", "Ab", "Bb"], desc: "The relative-minor form of the diatonic scale, with no raised leading tone." },
      { name: "Harmonic minor", wiki: "Minor_scale#Harmonic_minor_scale", alias: "", notes: ["C", "D", "Eb", "F", "G", "Ab", "B"], desc: "Natural minor with a raised 7th. Creates the augmented-second gap between ♭6 and 7." },
      { name: "Melodic minor (ascending)", wiki: "Jazz_minor_scale", alias: "Jazz minor", notes: ["C", "D", "Eb", "F", "G", "A", "B"], desc: "Minor with raised 6th and 7th. Jazz treats it the same in both directions." },
      { name: "Harmonic major", wiki: "Harmonic_major_scale", alias: "", notes: ["C", "D", "E", "F", "G", "Ab", "B"], desc: "Major with a lowered 6th. The mirror twin of harmonic minor." },
      { name: "Double harmonic major", wiki: "Double_harmonic_scale", alias: "Byzantine · Gypsy major · Arabic Hijaz-Kar", notes: ["C", "Db", "E", "F", "G", "Ab", "B"], desc: "Two augmented seconds: ♭2–3 and ♭6–7. Strongly associated with Middle-Eastern and Balkan music." },
    ],
  },

  {
    cat: "Modes of the major scale",
    note: "The seven rotations of the diatonic scale, each rebuilt on the chosen tonic.",
    scales: [
      { name: "Ionian", wiki: "Ionian_mode", alias: "Major", notes: ["C", "D", "E", "F", "G", "A", "B"], desc: "Mode I. Identical to the major scale." },
      { name: "Dorian", wiki: "Dorian_mode", alias: "", notes: ["C", "D", "Eb", "F", "G", "A", "Bb"], desc: "Mode II. Minor with a raised 6th. Common in jazz, folk and modal rock." },
      { name: "Phrygian", wiki: "Phrygian_mode", alias: "", notes: ["C", "Db", "Eb", "F", "G", "Ab", "Bb"], desc: "Mode III. Minor with a lowered 2nd. Dark, Spanish-flamenco color." },
      { name: "Lydian", wiki: "Lydian_mode", alias: "", notes: ["C", "D", "E", "F#", "G", "A", "B"], desc: "Mode IV. Major with a raised 4th. Bright, floating quality." },
      { name: "Mixolydian", wiki: "Mixolydian_mode", alias: "", notes: ["C", "D", "E", "F", "G", "A", "Bb"], desc: "Mode V. Major with a lowered 7th. The dominant-chord scale." },
      { name: "Aeolian", wiki: "Aeolian_mode", alias: "Natural minor", notes: ["C", "D", "Eb", "F", "G", "Ab", "Bb"], desc: "Mode VI. Identical to natural minor." },
      { name: "Locrian", wiki: "Locrian_mode", alias: "", notes: ["C", "Db", "Eb", "F", "Gb", "Ab", "Bb"], desc: "Mode VII. Diminished tonic triad; the only diatonic mode without a perfect 5th." },
    ],
  },

  {
    cat: "Modes of melodic minor",
    note: "Rotations of the jazz-minor scale. Central to modern jazz vocabulary.",
    scales: [
      { name: "Dorian ♭2", wiki: "Jazz_minor_scale", alias: "Phrygian ♮6 · Javanese", notes: ["C", "Db", "Eb", "F", "G", "A", "Bb"], desc: "Mode II. Phrygian color with a major 6th." },
      { name: "Lydian augmented", wiki: "Lydian_augmented_scale", alias: "Lydian ♯5", notes: ["C", "D", "E", "F#", "G#", "A", "B"], desc: "Mode III. Scale of choice over maj7♯5 chords." },
      { name: "Lydian dominant", wiki: "Acoustic_scale", alias: "Acoustic · Overtone · Lydian ♭7", notes: ["C", "D", "E", "F#", "G", "A", "Bb"], desc: "Mode IV. Fits dominant 7♯11 chords; approximates the natural overtone series." },
      { name: "Mixolydian ♭6", wiki: "Aeolian_dominant_scale", alias: "Melodic major · Aeolian dominant", notes: ["C", "D", "E", "F", "G", "Ab", "Bb"], desc: "Mode V. Dominant sound with a minor 6th." },
      { name: "Locrian ♮2", wiki: "Half-diminished_scale", alias: "Half-diminished scale · Aeolian ♭5", notes: ["C", "D", "Eb", "F", "Gb", "Ab", "Bb"], desc: "Mode VI. Standard choice over m7♭5 chords." },
      { name: "Altered", wiki: "Altered_scale", alias: "Super-Locrian · Diminished whole-tone", notes: ["C", "Db", "Eb", "Fb", "Gb", "Ab", "Bb"], desc: "Mode VII. Every non-essential dominant tension lowered or raised: ♭9, ♯9, ♭5, ♯5." },
    ],
  },

  {
    cat: "Modes of harmonic minor",
    scales: [
      { name: "Locrian ♮6", alias: "", notes: ["C", "Db", "Eb", "F", "Gb", "A", "Bb"], desc: "Mode II. Locrian with a major 6th." },
      { name: "Ionian ♯5", alias: "Augmented major", notes: ["C", "D", "E", "F", "G#", "A", "B"], desc: "Mode III. Major with an augmented 5th; fits maj7♯5." },
      { name: "Dorian ♯4", wiki: "Ukrainian_Dorian_scale", alias: "Ukrainian Dorian · Romanian minor", notes: ["C", "D", "Eb", "F#", "G", "A", "Bb"], desc: "Mode IV. Dorian with a raised 4th. Klezmer and Eastern-European folk color." },
      { name: "Phrygian dominant", wiki: "Phrygian_dominant_scale", alias: "Spanish Phrygian · Freygish · Hijaz", notes: ["C", "Db", "E", "F", "G", "Ab", "Bb"], desc: "Mode V. The V-chord scale of harmonic minor. Flamenco, klezmer, Middle-Eastern music." },
      { name: "Lydian ♯2", alias: "", notes: ["C", "D#", "E", "F#", "G", "A", "B"], desc: "Mode VI. Lydian with a raised 2nd." },
      { name: "Ultralocrian", alias: "Super-Locrian 𝄫7 · Altered diminished", notes: ["C", "Db", "Eb", "Fb", "Gb", "Ab", "Bbb"], desc: "Mode VII. Maximally lowered; contains a diminished 7th." },
    ],
  },

  {
    cat: "Modes of harmonic major",
    scales: [
      { name: "Dorian ♭5", wiki: "Harmonic_major_scale", alias: "", notes: ["C", "D", "Eb", "F", "Gb", "A", "Bb"], desc: "Mode II. Dorian with a diminished 5th." },
      { name: "Phrygian ♭4", wiki: "Harmonic_major_scale", alias: "", notes: ["C", "Db", "Eb", "Fb", "G", "Ab", "Bb"], desc: "Mode III. Phrygian with a diminished 4th." },
      { name: "Lydian ♭3", wiki: "Harmonic_major_scale", alias: "Lydian minor · Melodic minor ♯4", notes: ["C", "D", "Eb", "F#", "G", "A", "B"], desc: "Mode IV. Lydian brightness over a minor 3rd." },
      { name: "Mixolydian ♭2", wiki: "Harmonic_major_scale", alias: "", notes: ["C", "Db", "E", "F", "G", "A", "Bb"], desc: "Mode V. Dominant scale with a flat 9th but natural 13th." },
      { name: "Lydian augmented ♯2", wiki: "Harmonic_major_scale", alias: "", notes: ["C", "D#", "E", "F#", "G#", "A", "B"], desc: "Mode VI. Both 2nd and 5th raised over a Lydian frame." },
      { name: "Locrian 𝄫7", wiki: "Harmonic_major_scale", alias: "", notes: ["C", "Db", "Eb", "F", "Gb", "Ab", "Bbb"], desc: "Mode VII. Locrian with a diminished 7th." },
    ],
  },

  {
    cat: "Pentatonic scales",
    note: "Five-note scales. The first five are the rotations of the major pentatonic.",
    scales: [
      { name: "Major pentatonic", wiki: "Pentatonic_scale#Major_pentatonic_scale", alias: "", notes: ["C", "D", "E", "G", "A"], desc: "Major scale without the two half-step tones (4 and 7). Ubiquitous worldwide." },
      { name: "Suspended pentatonic", wiki: "Pentatonic_scale", alias: "Egyptian", notes: ["C", "D", "F", "G", "Bb"], desc: "Mode II of major pentatonic. No 3rd; open, ambiguous quality." },
      { name: "Blues minor pentatonic", wiki: "Pentatonic_scale", alias: "Man Gong", notes: ["C", "Eb", "F", "Ab", "Bb"], desc: "Mode III of major pentatonic." },
      { name: "Blues major pentatonic", wiki: "Yo_scale", alias: "Ritusen · Yo", notes: ["C", "D", "F", "G", "A"], desc: "Mode IV of major pentatonic. Also the Japanese Yo scale." },
      { name: "Minor pentatonic", wiki: "Pentatonic_scale#Minor_pentatonic_scale", alias: "", notes: ["C", "Eb", "F", "G", "Bb"], desc: "Mode V of major pentatonic. The foundation of blues and rock lead playing." },
      { name: "Hirajoshi", wiki: "Hirajoshi_scale", alias: "", notes: ["C", "D", "Eb", "G", "Ab"], desc: "Japanese koto tuning. Semitone pairs give it a stark, austere sound." },
      { name: "In scale", wiki: "In_scale", alias: "Sakura", notes: ["C", "Db", "F", "G", "Ab"], desc: "Japanese scale with flat 2nd and flat 6th." },
      { name: "Insen", wiki: "Insen_scale", alias: "", notes: ["C", "Db", "F", "G", "Bb"], desc: "Variant of the In scale with ♭7 instead of ♭6." },
      { name: "Iwato", wiki: "Iwato_scale", alias: "", notes: ["C", "Db", "F", "Gb", "Bb"], desc: "Japanese scale; a rotation of Hirajoshi with two tritones from the root region." },
      { name: "Pelog (approximation)", wiki: "Pelog", alias: "", notes: ["C", "Db", "Eb", "G", "Ab"], desc: "Rough 12-tone approximation of the Javanese pelog tuning, which is not equal-tempered." },
      { name: "Kumoi", alias: "Kumoijoshi", notes: ["C", "D", "Eb", "G", "A"], desc: "Japanese koto scale; Hirajoshi's dark 2–♭3 pair but with a major 6th on top." },
      { name: "Dominant pentatonic", wiki: "Pentatonic_scale", alias: "", notes: ["C", "D", "E", "G", "Bb"], desc: "Major pentatonic with ♭7 replacing 6. Compact scale for dominant 7th chords." },
    ],
  },

  {
    cat: "Blues scales",
    scales: [
      { name: "Minor blues", wiki: "Blues_scale", alias: "The blues scale", notes: ["C", "Eb", "F", "Gb", "G", "Bb"], desc: "Minor pentatonic plus the ♭5 \"blue note\"." },
      { name: "Major blues", wiki: "Blues_scale", alias: "", notes: ["C", "D", "Eb", "E", "G", "A"], desc: "Major pentatonic plus the ♭3 blue note against the natural 3rd." },
      { name: "Blues heptatonic", wiki: "Blues_scale", alias: "", notes: ["C", "D", "Eb", "F", "Gb", "A", "Bb"], desc: "Seven-note blues form (Benward & Saker): Dorian shape with ♭5 in place of the 5th." },
      { name: "Blues nonatonic", wiki: "Blues_scale", alias: "Composite blues", notes: ["C", "D", "Eb", "E", "F", "G", "A", "Bb", "B"], desc: "Nine-note composite of the major and minor blues vocabularies (Benward & Saker)." },
    ],
  },

  {
    cat: "Symmetric scales",
    note: "Scales that repeat the same interval cell, so they have limited transpositions.",
    scales: [
      { name: "Chromatic", wiki: "Chromatic_scale", alias: "", notes: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"], desc: "All twelve semitones. One transposition only." },
      { name: "Whole tone", wiki: "Whole-tone_scale", alias: "Messiaen mode 1", notes: ["C", "D", "E", "F#", "G#", "A#"], desc: "Six whole steps. Two transpositions. Augmented-chord and Debussy color." },
      { name: "Diminished (whole–half)", wiki: "Octatonic_scale", alias: "Octatonic", notes: ["C", "D", "Eb", "F", "Gb", "Ab", "A", "B"], desc: "Alternating whole and half steps. Fits fully diminished 7th chords. Three transpositions." },
      { name: "Diminished (half–whole)", wiki: "Octatonic_scale", alias: "Dominant diminished · Octatonic", notes: ["C", "Db", "Eb", "E", "F#", "G", "A", "Bb"], desc: "The other rotation. Standard scale over 13♭9 dominant chords." },
      { name: "Augmented", wiki: "Hexatonic_scale", alias: "Hexatonic", notes: ["C", "D#", "E", "G", "Ab", "B"], desc: "Alternating minor 3rd and half step. Two interlocked augmented triads." },
      { name: "Tritone scale", wiki: "Tritone_scale", alias: "Petrushka chord scale", notes: ["C", "Db", "E", "Gb", "G", "Bb"], desc: "Two major triads a tritone apart. Fits 7♭5♭9 dominants." },
      { name: "Two-semitone tritone scale", wiki: "Two-semitone_tritone_scale", alias: "", notes: ["C", "Db", "D", "F#", "G", "Ab"], desc: "Chromatic cluster mirrored at the tritone." },
    ],
  },

  {
    cat: "Bebop scales",
    note: "Eight-note jazz scales. The added chromatic passing tone keeps chord tones on the beat.",
    scales: [
      { name: "Bebop dominant", wiki: "Bebop_scale", alias: "", notes: ["C", "D", "E", "F", "G", "A", "Bb", "B"], desc: "Mixolydian plus a passing major 7th." },
      { name: "Bebop major", wiki: "Bebop_scale", alias: "", notes: ["C", "D", "E", "F", "G", "G#", "A", "B"], desc: "Major plus a passing ♯5 between 5 and 6." },
      { name: "Bebop Dorian", wiki: "Bebop_scale", alias: "Bebop minor", notes: ["C", "D", "Eb", "E", "F", "G", "A", "Bb"], desc: "Dorian plus a passing major 3rd." },
      { name: "Bebop harmonic minor", wiki: "Bebop_scale", alias: "Bebop natural minor", notes: ["C", "D", "Eb", "F", "G", "Ab", "Bb", "B"], desc: "Natural minor plus the raised leading tone as passing note." },
      { name: "Bebop melodic minor", wiki: "Bebop_scale", alias: "", notes: ["C", "D", "Eb", "F", "G", "G#", "A", "B"], desc: "Melodic minor plus a passing ♯5 between 5 and 6, matching the bebop-major device." },
    ],
  },

  {
    cat: "Exotic and world scales",
    scales: [
      { name: "Hungarian minor", wiki: "Hungarian_minor_scale", alias: "Gypsy minor · Double harmonic minor", notes: ["C", "D", "Eb", "F#", "G", "Ab", "B"], desc: "Harmonic minor with a raised 4th. Two augmented seconds." },
      { name: "Hungarian major", wiki: "Hungarian_major_scale", alias: "", notes: ["C", "D#", "E", "F#", "G", "A", "Bb"], desc: "Lydian dominant with a raised 2nd." },
      { name: "Neapolitan major", wiki: "Neapolitan_scale", alias: "", notes: ["C", "Db", "Eb", "F", "G", "A", "B"], desc: "Melodic minor with a lowered 2nd." },
      { name: "Neapolitan minor", wiki: "Neapolitan_scale", alias: "", notes: ["C", "Db", "Eb", "F", "G", "Ab", "B"], desc: "Harmonic minor with a lowered 2nd." },
      { name: "Enigmatic", wiki: "Enigmatic_scale", alias: "Verdi scale", notes: ["C", "Db", "E", "F#", "G#", "A#", "B"], desc: "Devised for Verdi's Ave Maria. Flat 2nd, then whole tones, then a chromatic top." },
      { name: "Persian", wiki: "Persian_scale", alias: "", notes: ["C", "Db", "E", "F", "Gb", "Ab", "B"], desc: "Double harmonic major with a lowered 5th." },
      { name: "Arabian", wiki: "Major_Locrian_scale", alias: "Major Locrian", notes: ["C", "D", "E", "F", "Gb", "Ab", "Bb"], desc: "Major tetrachord below, Locrian above the ♭5." },
      { name: "Prometheus", wiki: "Prometheus_scale", alias: "Mystic chord scale", notes: ["C", "D", "E", "F#", "A", "Bb"], desc: "Scriabin's mystic-chord collection laid out as a scale." },
      { name: "Prometheus Neapolitan", wiki: "Prometheus_scale", alias: "", notes: ["C", "Db", "E", "F#", "A", "Bb"], desc: "Prometheus with a lowered 2nd." },
      { name: "Spanish 8-tone", alias: "Espla scale", notes: ["C", "Db", "Eb", "E", "F", "Gb", "Ab", "Bb"], desc: "Phrygian with both 3rds and both 5th qualities available." },
      { name: "Istrian", wiki: "Istrian_scale", alias: "", notes: ["C", "Db", "Eb", "Fb", "Gb", "G"], desc: "Croatian/Istrian folk mode; narrow steps resolving to a perfect 5th." },
      { name: "Marva", wiki: "Marva_(thaat)", alias: "Marva thaat", notes: ["C", "Db", "E", "F#", "G", "A", "B"], desc: "Hindustani parent scale: Lydian with a lowered 2nd." },
      { name: "Purvi", wiki: "Purvi_(thaat)", alias: "Purvi thaat", notes: ["C", "Db", "E", "F#", "G", "Ab", "B"], desc: "Hindustani parent scale: double harmonic major with a raised 4th." },
      { name: "Todi", wiki: "Todi_(thaat)", alias: "Todi thaat", notes: ["C", "Db", "Eb", "F#", "G", "Ab", "B"], desc: "Hindustani parent scale: Hungarian minor with a lowered 2nd." },
      { name: "Algerian", wiki: "Algerian_scale", alias: "", notes: ["C", "D", "Eb", "F", "Gb", "G", "Ab", "B"], desc: "Eight-note North-African-flavored scale: harmonic minor with an added ♭5 passing tone." },
    ],
  },

  {
    cat: "Messiaen modes of limited transposition",
    note: "Modes 1 and 2 are the whole-tone and octatonic scales above. Modes 3–7 follow.",
    scales: [
      { name: "Messiaen mode 3", wiki: "Modes_of_limited_transposition", alias: "", notes: ["C", "D", "Eb", "E", "F#", "G", "Ab", "Bb", "B"], desc: "Repeating cell tone–semitone–semitone. Four transpositions." },
      { name: "Messiaen mode 4", wiki: "Modes_of_limited_transposition", alias: "", notes: ["C", "Db", "D", "F", "F#", "G", "Ab", "B"], desc: "Cell semitone–semitone–minor 3rd–semitone. Six transpositions." },
      { name: "Messiaen mode 5", wiki: "Modes_of_limited_transposition", alias: "", notes: ["C", "Db", "F", "F#", "G", "B"], desc: "Cell semitone–major 3rd–semitone. Six transpositions." },
      { name: "Messiaen mode 6", wiki: "Modes_of_limited_transposition", alias: "", notes: ["C", "D", "E", "F", "F#", "G#", "A#", "B"], desc: "Cell tone–tone–semitone–semitone. Six transpositions." },
      { name: "Messiaen mode 7", wiki: "Modes_of_limited_transposition", alias: "", notes: ["C", "Db", "D", "Eb", "F", "F#", "G", "Ab", "A", "B"], desc: "Ten notes; the densest of the modes. Six transpositions." },
    ],
  },
];

/** One accent hue per category, in page order. */
/** Category accents resolve through per-theme CSS variables (see styles.css),
    so dark themes swap the deep ramp for a pastel one. */
export const CAT_COLORS = [
  "var(--cat1)", "var(--cat2)", "var(--cat3)", "var(--cat4)", "var(--cat5)",
  "var(--cat6)", "var(--cat7)", "var(--cat8)", "var(--cat9)", "var(--cat10)",
  "var(--cat11)",
];

/** Selectable tonics. */
export const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
