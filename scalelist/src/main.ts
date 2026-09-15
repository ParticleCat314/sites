import { CAT_COLORS, DATA, ROOTS, type Scale } from "./data";
import { degreeFormula, intervalPattern, parseNote, prettyNote, transpose } from "./theory";
import { renderStave } from "./notation";
import type { MusicCard } from "./vendor/sheetmusiccard/index";
import { buildKeyboard } from "./keyboard";
import { initThemePicker } from "./themes";
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

let currentRoot = "C";

/** The card currently playing, so starting one scale stops the previous. */
let playingCard: MusicCard | null = null;

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
      buildPage();
    });
    rootsEl.appendChild(btn);
  }
}

function buildCard(scale: Scale, categoryName: string, rootPc: number): HTMLElement {
  const notes = transpose(scale.notes, currentRoot);

  const card = document.createElement("article");
  card.className = "card";
  card.dataset.search = `${scale.name} ${scale.alias} ${categoryName}`.toLowerCase();

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
  addKv("Degrees", degreeFormula(scale.notes));
  addKv("Steps (st)", intervalPattern(scale.notes));
  addKv("Notes", notes.map(prettyNote).join(" "));
  card.appendChild(meta);

  card.appendChild(buildKeyboard(notes.map((n) => parseNote(n).pitchClass), rootPc));

  const musicCard = renderStave(staveWrap, notes, currentRoot, () => {
    playBtn.textContent = "▶ Play";
    if (playingCard === musicCard) playingCard = null;
  });
  playBtn.addEventListener("click", () => {
    if (musicCard.isPlaying) {
      musicCard.stop();
      return;
    }
    playingCard?.stop();
    playingCard = musicCard;
    playBtn.textContent = "◼ Stop";
    void musicCard.play();
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

searchEl.addEventListener("input", applyFilter);
initThemePicker(byId<HTMLElement>("themepick"));
buildRootPicker();
buildPage();
initOffline(byId<HTMLElement>("offline"));
syncThemeColor();
// notation colors are baked into the SVGs at render time, so redraw on theme change
document.addEventListener("themechange", () => {
  buildPage();
  syncThemeColor();
});
