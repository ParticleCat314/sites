import { CAT_COLORS, DATA, ROOTS, type Scale } from "./data";
import {
  degreeFormula, diatonicChords, intervalPattern, midiSequence, parseNote,
  pitchClassMask, prettyNote, rotateMask, transpose,
} from "./theory";
import { renderStave } from "./notation";
import { playChord, type MusicCard } from "./vendor/sheetmusiccard/index";
import { buildKeyboard } from "./keyboard";
import { defaultThemeId, initThemePicker } from "./themes";
import { initOffline, syncThemeColor } from "./offline";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const main = byId<HTMLElement>("main");
const chipRow = byId<HTMLElement>("chiprow");
const rootsEl = byId<HTMLElement>("roots");
const tonicName = byId<HTMLElement>("tonicName");
const searchEl = byId<HTMLInputElement>("search");
const noResult = byId<HTMLElement>("noresult");

const params = new URLSearchParams(location.search);
let currentRoot = ROOTS.includes(params.get("root") ?? "") ? params.get("root")! : "C";
searchEl.value = params.get("q") ?? "";

/** Playback settings, adjustable from the settings panel. */
let tempo = 200;
let descend = false;
let drone = false;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface ScaleRef {
  scale: Scale;
  slug: string;
  /** Pitch classes of the canonical C spelling, as a 12-bit mask. */
  mask: number;
}

const scaleRefs = new Map<Scale, ScaleRef>();
const ALL_SCALES: ScaleRef[] = DATA.flatMap((c) =>
  c.scales.map((scale) => {
    const ref = { scale, slug: slugify(scale.name), mask: pitchClassMask(scale.notes) };
    scaleRefs.set(scale, ref);
    return ref;
  })
);

/** Other scales sharing this card's exact pitch-class set. */
function relatedScales(ref: ScaleRef, rootPc: number): { ref: ScaleRef; root: string }[] {
  const target = rotateMask(ref.mask, rootPc);
  const out: { ref: ScaleRef; root: string }[] = [];
  for (const other of ALL_SCALES) {
    if (other === ref) continue;
    for (let k = 0; k < 12; k++) {
      if (rotateMask(other.mask, k) === target) out.push({ ref: other, root: ROOTS[k]! });
    }
  }
  return out;
}

/** The card currently playing, so starting one scale stops the previous. */
let playingCard: MusicCard | null = null;

/** Root, theme and search live in the URL so views are shareable. */
function syncUrl(): void {
  const p = new URLSearchParams();
  if (currentRoot !== "C") p.set("root", currentRoot);
  const theme = document.documentElement.dataset.theme;
  if (theme && theme !== defaultThemeId()) p.set("theme", theme);
  const q = searchEl.value.trim();
  if (q) p.set("q", q);
  const query = p.toString();
  history.replaceState(null, "", (query ? `?${query}` : location.pathname) + location.hash);
}

function buildRootPicker(): void {
  for (const root of ROOTS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = prettyNote(root);
    btn.setAttribute("aria-pressed", root === currentRoot ? "true" : "false");
    btn.addEventListener("click", () => {
      if (root === currentRoot) return;
      currentRoot = root;
      rootsEl.querySelectorAll("button").forEach((b) =>
        b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      syncUrl();
      buildPage();
    });
    rootsEl.appendChild(btn);
  }
}

/**
 * Staves are expensive (80 VexFlow renders), so each card only draws its
 * notation when it approaches the viewport. Pressing Play forces the draw.
 */
const staveRenderers = new WeakMap<Element, () => void>();
const staveObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) staveRenderers.get(entry.target)?.();
    }
  },
  { rootMargin: "600px 0px" }
);

function buildCard(scale: Scale, categoryName: string, rootPc: number): HTMLElement {
  const notes = transpose(scale.notes, currentRoot);
  const ref = scaleRefs.get(scale)!;

  const card = document.createElement("article");
  card.className = "card";
  card.id = `s-${ref.slug}`;
  const degrees = degreeFormula(scale.notes);
  card.dataset.search = [
    scale.name,
    scale.alias,
    categoryName,
    notes.join(" "),
    notes.map(prettyNote).join(" "),
    degrees,
    degrees.replace(/♯/g, "#").replace(/♭/g, "b"),
  ].join(" ").toLowerCase();

  const head = document.createElement("div");
  head.className = "head";
  const title = document.createElement("h3");
  if (scale.wiki) {
    const link = document.createElement("a");
    link.href = `https://en.wikipedia.org/wiki/${scale.wiki}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = scale.name;
    link.title = `${scale.name} on Wikipedia`;
    title.appendChild(link);
  } else {
    title.textContent = scale.name;
  }
  head.appendChild(title);

  const anchor = document.createElement("button");
  anchor.type = "button";
  anchor.className = "anchor";
  anchor.textContent = "#";
  anchor.title = "Copy link to this scale";
  anchor.setAttribute("aria-label", `Copy link to ${scale.name}`);
  anchor.addEventListener("click", () => {
    history.replaceState(null, "", `${location.pathname}${location.search}#${ref.slug}`);
    void navigator.clipboard?.writeText(location.href).then(() => {
      anchor.textContent = "✓";
      window.setTimeout(() => { anchor.textContent = "#"; }, 1200);
    });
  });
  head.appendChild(anchor);

  if (scale.alias) {
    const alias = document.createElement("span");
    alias.className = "alias";
    alias.textContent = scale.alias;
    head.appendChild(alias);
  }
  const badge = document.createElement("span");
  badge.className = "nbadge";
  badge.textContent = `${scale.notes.length} notes`;
  head.appendChild(badge);
  card.appendChild(head);

  if (scale.desc) {
    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = scale.desc;
    card.appendChild(desc);
  }

  const staveWrap = document.createElement("div");
  staveWrap.className = "stavewrap";
  staveWrap.style.minHeight = "140px";
  card.appendChild(staveWrap);

  const meta = document.createElement("div");
  meta.className = "meta";

  const playBtn = document.createElement("button");
  playBtn.className = "playbtn";
  playBtn.textContent = "▶ Play";
  playBtn.setAttribute("aria-label", `Play ${scale.name} scale on ${prettyNote(currentRoot)}`);
  meta.appendChild(playBtn);

  const addKv = (label: string, value: string) => {
    const kv = document.createElement("span");
    kv.className = "kv";
    const b = document.createElement("b");
    b.textContent = value;
    kv.append(label + " ", b);
    meta.appendChild(kv);
  };
  addKv("Degrees", degrees);
  addKv("Steps (st)", intervalPattern(scale.notes));
  addKv("Notes", notes.map(prettyNote).join(" "));
  card.appendChild(meta);

  const chords = diatonicChords(scale.notes, notes);
  if (chords) {
    const row = document.createElement("div");
    row.className = "chords";
    const lab = document.createElement("span");
    lab.className = "lbl";
    lab.textContent = "Chords";
    row.appendChild(lab);
    for (const chord of chords) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chordchip";
      chip.title = `${chord.notes.map(prettyNote).join(" ")} — click to play`;
      const deg = document.createElement("span");
      deg.className = "cdeg";
      deg.textContent = chord.roman;
      const sym = document.createElement("span");
      sym.className = "csym";
      sym.textContent = chord.symbol;
      chip.append(deg, sym);
      chip.addEventListener("click", () => void playChord(chord.midis));
      row.appendChild(chip);
    }
    card.appendChild(row);
  }

  card.appendChild(buildKeyboard(notes.map((n) => parseNote(n).pitchClass), rootPc));

  const related = relatedScales(ref, rootPc);
  if (related.length) {
    const rel = document.createElement("p");
    rel.className = "related";
    rel.append("Same notes as ");
    const shown = related.slice(0, 6);
    shown.forEach((r, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "linklike";
      b.textContent = `${prettyNote(r.root)} ${r.ref.scale.name}`;
      b.addEventListener("click", () => gotoScale(r.ref.slug, r.root));
      rel.appendChild(b);
      if (i < shown.length - 1) rel.append(" · ");
    });
    if (related.length > shown.length) rel.append(` +${related.length - shown.length} more`);
    card.appendChild(rel);
  }

  let musicCard: MusicCard | null = null;
  const ensureStave = (): MusicCard => {
    if (!musicCard) {
      staveObserver.unobserve(staveWrap);
      musicCard = renderStave(staveWrap, notes, currentRoot, {
        descend,
        onEnd: () => {
          playBtn.textContent = "▶ Play";
          if (playingCard === musicCard) playingCard = null;
        },
      });
    }
    return musicCard;
  };
  staveRenderers.set(staveWrap, ensureStave);
  staveObserver.observe(staveWrap);

  playBtn.addEventListener("click", () => {
    const mc = ensureStave();
    if (mc.isPlaying) {
      mc.stop();
      return;
    }
    playingCard?.stop();
    playingCard = mc;
    mc.setTempo(tempo);
    mc.setDrone(drone ? [midiSequence(notes)[0]! - 12] : []);
    playBtn.textContent = "◼ Stop";
    void mc.play();
  });

  return card;
}

/** Category indices the user has collapsed; survives root/theme rebuilds. */
const collapsedCats = new Set<number>();
/**
 * Sections whose next `toggle` event came from code, not the user. Needed
 * because `toggle` fires asynchronously, so a simple flag would already be
 * reset by the time the listener runs.
 */
const programmaticToggles = new Set<HTMLDetailsElement>();

function setOpen(section: HTMLDetailsElement, open: boolean): void {
  if (section.open === open) return;
  programmaticToggles.add(section);
  section.open = open;
}

function buildPage(): void {
  playingCard?.stop();
  playingCard = null;
  staveObserver.disconnect();
  main.textContent = "";
  chipRow.textContent = "";
  tonicName.textContent = prettyNote(currentRoot);
  document.title = `Scale Compendium — Tonic ${prettyNote(currentRoot)}`;
  const rootPc = parseNote(currentRoot).pitchClass;

  DATA.forEach((category, i) => {
    const accent = CAT_COLORS[i % CAT_COLORS.length]!;
    const section = document.createElement("details");
    section.className = "cat";
    section.id = `cat${i}`;
    section.open = !collapsedCats.has(i);
    section.style.setProperty("--acc", accent);

    const summary = document.createElement("summary");
    const h2 = document.createElement("h2");
    h2.textContent = category.cat + " ";
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(category.scales.length);
    h2.appendChild(count);
    summary.appendChild(h2);
    section.appendChild(summary);

    // remember only user-driven toggles, not the ones applyFilter makes
    section.addEventListener("toggle", () => {
      if (programmaticToggles.delete(section)) return;
      if (section.open) collapsedCats.delete(i);
      else collapsedCats.add(i);
    });

    if (category.note) {
      const note = document.createElement("p");
      note.className = "catnote";
      note.textContent = category.note;
      section.appendChild(note);
    }

    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = category.cat;
    chip.style.setProperty("--acc", accent);
    chip.addEventListener("click", () => {
      setOpen(section, true);
      collapsedCats.delete(i);
      section.scrollIntoView({ block: "start" });
    });
    chipRow.appendChild(chip);

    for (const scale of category.scales) {
      section.appendChild(buildCard(scale, category.cat, rootPc));
    }
    main.appendChild(section);
  });

  applyFilter();
}

function applyFilter(): void {
  const query = searchEl.value.trim().toLowerCase();
  let visibleTotal = 0;
  document.querySelectorAll<HTMLDetailsElement>("details.cat").forEach((section, i) => {
    let visibleInSection = 0;
    section.querySelectorAll<HTMLElement>(".card").forEach((card) => {
      const show = !query || (card.dataset.search ?? "").includes(query);
      card.classList.toggle("hidden", !show);
      if (show) {
        visibleInSection++;
        visibleTotal++;
      }
    });
    section.classList.toggle("hidden", visibleInSection === 0);
    // while searching, expand sections with matches; afterwards restore the
    // user's own collapsed/expanded choices
    setOpen(section, query ? visibleInSection > 0 : !collapsedCats.has(i));
  });
  noResult.style.display = visibleTotal ? "none" : "block";
}

/** Expand the section containing a scale card and scroll to it. */
function revealScale(slug: string): void {
  const card = document.getElementById(`s-${slug}`);
  if (!card) return;
  const section = card.closest<HTMLDetailsElement>("details.cat");
  if (section) {
    setOpen(section, true);
    collapsedCats.delete(Number(section.id.slice(3)));
  }
  card.scrollIntoView({ block: "start" });
}

function gotoScale(slug: string, root: string): void {
  if (root !== currentRoot) {
    currentRoot = root;
    rootsEl.querySelectorAll("button").forEach((b, i) =>
      b.setAttribute("aria-pressed", ROOTS[i] === root ? "true" : "false"));
    syncUrl();
    buildPage();
  }
  revealScale(slug);
}

function initSettings(): void {
  const btn = byId<HTMLButtonElement>("settingsbtn");
  const panel = byId<HTMLElement>("settingspanel");
  const tempoEl = byId<HTMLInputElement>("tempo");
  const tempoVal = byId<HTMLElement>("tempoval");
  const descendEl = byId<HTMLInputElement>("descend");
  const droneEl = byId<HTMLInputElement>("drone");

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => setOpen(Boolean(panel.hidden)));
  document.addEventListener("click", (event) => {
    if (panel.hidden) return;
    const target = event.target as Node;
    if (!panel.contains(target) && !btn.contains(target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      btn.focus();
    }
  });

  tempoEl.addEventListener("input", () => {
    tempo = Number(tempoEl.value);
    tempoVal.textContent = tempoEl.value;
  });
  descendEl.addEventListener("change", () => {
    descend = descendEl.checked;
    buildPage();
  });
  // drone is playback-only, so no rebuild; it applies from the next Play
  droneEl.addEventListener("change", () => {
    drone = droneEl.checked;
  });
}

searchEl.addEventListener("input", () => {
  applyFilter();
  syncUrl();
});
initSettings();
initThemePicker(byId<HTMLElement>("themepick"), params.get("theme"));
buildRootPicker();
buildPage();
if (location.hash) revealScale(location.hash.slice(1));
initOffline(byId<HTMLElement>("offline"));
syncThemeColor();
// notation colors are baked into the SVGs at render time, so redraw on theme change
document.addEventListener("themechange", () => {
  buildPage();
  syncThemeColor();
  syncUrl();
});
