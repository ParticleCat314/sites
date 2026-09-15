/** One-octave mini keyboard with scale members lit in the category color. */

/** pitch class of each black key -> white-key boundary index it sits on */
const BLACK_KEY_ANCHORS: Record<number, number> = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
const WHITE_KEY_PCS = [0, 2, 4, 5, 7, 9, 11];
const WHITE_KEY_LABELS = ["C", "D", "E", "F", "G", "A", "B"];

function keyStateClass(pc: number, rootPc: number, members: Set<number>): string {
  if (pc === rootPc) return " on root";
  if (members.has(pc)) return " on";
  return "";
}

export function buildKeyboard(notePcs: number[], rootPc: number): HTMLDivElement {
  const kb = document.createElement("div");
  kb.className = "kb";
  kb.setAttribute("aria-hidden", "true");
  const members = new Set(notePcs);

  WHITE_KEY_PCS.forEach((pc, i) => {
    const key = document.createElement("div");
    key.className = "wk" + keyStateClass(pc, rootPc, members);
    key.textContent = WHITE_KEY_LABELS[i]!;
    // pitch color hook for themes that color keys by pitch class (Scriabin)
    key.style.setProperty("--pc", `var(--pc${pc})`);
    kb.appendChild(key);
  });

  for (const [pc, boundary] of Object.entries(BLACK_KEY_ANCHORS)) {
    const key = document.createElement("div");
    key.className = "bk" + keyStateClass(Number(pc), rootPc, members);
    key.style.left = `calc(${(boundary / 7) * 100}% - 4.75%)`;
    key.style.setProperty("--pc", `var(--pc${pc})`);
    kb.appendChild(key);
  }
  return kb;
}
