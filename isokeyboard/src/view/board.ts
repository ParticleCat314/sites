/**
 * The hex grid. This is an unlimited isomorphic board in one SVG element.
 *
 * The DOM contains the hexes inside the visible area only. That area has a
 * margin. A pan or a zoom adds and removes the hexes at the edges. The code
 * does not draw the complete board again.
 *
 * The code keeps each removed hex in a pool and uses it again. It does not
 * make a new element.
 *
 * A change of the contents of a hex, such as the tuning, the layout, the scale
 * or the labels, changes the epoch string. The code then removes each hex and
 * builds the board again.
 */

import { hexPalette, hueForDegree } from "../core/colors.js";
import { bandOffset, isEcho } from "../core/lattice.js";
import { formatError, formatRatio, nearestRatio } from "../core/ratios.js";
import type { Model } from "../state/model.js";
import type { DuplicateMode, LabelMode } from "../state/settings.js";

const NS = "http://www.w3.org/2000/svg";

/** The distance from the centre of a hex to a vertex, in world units. */
const HEX_RADIUS = 44;
const COL_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const ROW_HEIGHT = 1.5 * HEX_RADIUS;

const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.6;
const REGEN_DELAY_MS = 90;
const POOL_LIMIT = 400;

export interface BoardConfig {
  readonly model: Model;
  readonly labels: LabelMode;
  /** The odd limit for the `ratios` label mode. */
  readonly jiLimit: number;
  readonly glow: number;
  /** True if a hex outside the scale must not accept the pointer. */
  readonly silenceOutOfScale: boolean;
  /** True if each copy of a note outside the main area must be grey. */
  readonly dimDuplicates: boolean;
  /** The notes that the repeated bands play. */
  readonly duplicateMode: DuplicateMode;
}

interface HexRecord {
  readonly group: SVGGElement;
  readonly step: number;
}

export class HexBoard {
  onZoomChange: ((zoom: number) => void) | null = null;

  private config: BoardConfig | null = null;
  private epoch = "";
  private glowKey = "";

  private readonly byCoord = new Map<string, HexRecord>();
  private readonly byStep = new Map<number, SVGGElement[]>();
  private readonly lit = new Set<number>();
  private readonly pool: SVGGElement[] = [];

  private cx = 0;
  private cy = 0;
  private zoomValue = 1;
  private regenTimer: number | null = null;
  /** The position of the stage on the screen at the last build. The code uses
   *  this to compensate for a change of the page layout. */
  private lastStageCenter: { x: number; y: number } | null = null;

  constructor(private readonly svg: SVGSVGElement, private readonly stage: HTMLElement) {}

  get zoom(): number {
    return this.zoomValue;
  }

  setConfig(config: BoardConfig): void {
    this.config = config;
    this.build();
  }

  /** Draws the board again. The code calls this after a change of the window
   *  size. */
  refresh(): void {
    this.build();
  }

  scheduleRefresh(): void {
    if (this.regenTimer !== null) clearTimeout(this.regenTimer);
    this.regenTimer = window.setTimeout(() => this.build(), REGEN_DELAY_MS);
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.cx -= dxScreen / this.zoomValue;
    this.cy -= dyScreen / this.zoomValue;
    this.updateViewBox();
    this.scheduleRefresh();
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoomValue * factor));
    if (next === this.zoomValue) return;
    const before = this.screenToWorld(screenX, screenY);
    this.zoomValue = next;
    const after = this.screenToWorld(screenX, screenY);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.updateViewBox();
    this.scheduleRefresh();
  }

  resetView(): void {
    this.build(); // Set the anchor first. If not, the anchor cancels the reset.
    this.cx = 0;
    this.cy = 0;
    this.zoomValue = 1;
    this.updateViewBox();
    this.build();
  }

  /**
   * Gives the grid step below a point on the screen.
   *
   * The code calculates the step from the coordinates. It does not examine the
   * DOM. Thus the function is fast during a glide. It also operates above a
   * hex that has `pointer-events: none` because the scale mask made it silent.
   */
  stepAt(clientX: number, clientY: number): number | null {
    const config = this.config;
    if (!config) return null;
    const world = this.screenToWorld(clientX, clientY);
    const rFractional = world.y / ROW_HEIGHT;
    const qFractional = world.x / COL_WIDTH - rFractional / 2;
    const { q, r } = axialRound(qFractional, rFractional);

    const { step, duplicate } = cellAt(q, r, config);
    if (step < config.model.minStep || step > config.model.maxStep) return null;
    // A grey duplicate plays the same note as a hex that is already on the
    // screen. Thus the pointer does not need it. A computer key on that hex
    // continues to play, because the key has no other path to the note.
    if (duplicate) return null;
    if (config.silenceOutOfScale && !config.model.inScale(step)) return null;
    return step;
  }

  /** Gives a read-only view of the hexes for each step. The tests use this. */
  byStepEntries(): IterableIterator<[number, SVGGElement[]]> {
    return this.byStep.entries();
  }

  light(step: number, on: boolean): void {
    if (on) this.lit.add(step);
    else this.lit.delete(step);
    this.paint(step, on);
  }

  private paint(step: number, on: boolean): void {
    const groups = this.byStep.get(step);
    const config = this.config;
    if (!groups || !config) return;
    const inScale = config.model.inScale(step);
    for (const group of groups) {
      const palette = hexPalette(config.model.tuning, config.model.degree(step), {
        inScale,
        duplicate: group.classList.contains("duplicate")
      });
      const polygon = group.querySelector("polygon");
      const halo = group.querySelector<SVGCircleElement>(".halo");
      if (!polygon) continue;
      if (on) {
        group.classList.add("active");
        polygon.setAttribute("fill", palette.hotFill);
        polygon.setAttribute("stroke", palette.hotStroke);
        polygon.setAttribute("stroke-opacity", "1");
        if (halo) {
          halo.style.transition = "opacity 0.04s"; // Appear quickly. The CSS controls the decay.
          halo.style.opacity = String(Math.min(1, 0.9 * config.glow));
        }
      } else {
        group.classList.remove("active");
        polygon.setAttribute("fill", palette.fill);
        polygon.setAttribute("stroke", palette.stroke);
        polygon.setAttribute("stroke-opacity", palette.strokeOpacity);
        if (halo) {
          halo.style.transition = "";
          halo.style.opacity = "0";
        }
      }
    }
  }

  private build(): void {
    const config = this.config;
    if (!config) return;
    this.anchorToStage();
    this.updateViewBox();

    const detail = this.labelDetail();
    const epoch = [
      config.model.key,
      config.labels,
      config.jiLimit,
      detail,
      config.silenceOutOfScale,
      config.dimDuplicates,
      config.duplicateMode
    ].join("|");
    if (epoch !== this.epoch) {
      for (const record of this.byCoord.values()) this.recycle(record.group);
      this.svg.replaceChildren();
      this.byCoord.clear();
      this.byStep.clear();
      this.glowKey = "";
      this.epoch = epoch;
    }
    this.ensureGlowDefs(config.model);

    const width = this.stage.clientWidth / this.zoomValue;
    const height = this.stage.clientHeight / this.zoomValue;
    const x0 = this.cx - width / 2 - COL_WIDTH;
    const x1 = this.cx + width / 2 + COL_WIDTH;
    const y0 = this.cy - height / 2 - ROW_HEIGHT;
    const y1 = this.cy + height / 2 + ROW_HEIGHT;

    const needed = new Set<string>();
    const rMin = Math.floor(y0 / ROW_HEIGHT);
    const rMax = Math.ceil(y1 / ROW_HEIGHT);
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor(x0 / COL_WIDTH - r / 2) - 1;
      const qMax = Math.ceil(x1 / COL_WIDTH - r / 2) + 1;
      for (let q = qMin; q <= qMax; q++) {
        const x = COL_WIDTH * (q + r / 2);
        const y = ROW_HEIGHT * r;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;

        const { step, duplicate } = cellAt(q, r, config);
        if (step < config.model.minStep || step > config.model.maxStep) continue;

        const coord = `${q},${r}`;
        needed.add(coord);
        if (!this.byCoord.has(coord)) this.addHex(coord, x, y, step, detail, config, duplicate);
      }
    }

    for (const [coord, record] of this.byCoord) {
      if (needed.has(coord)) continue;
      this.recycle(record.group);
      const groups = this.byStep.get(record.step);
      if (groups) {
        const index = groups.indexOf(record.group);
        if (index !== -1) groups.splice(index, 1);
        if (groups.length === 0) this.byStep.delete(record.step);
      }
      this.byCoord.delete(coord);
    }

    for (const step of this.lit) this.paint(step, true);
  }

  /**
   * Compensates for a movement of the stage.
   *
   * The size of the stage changes when the page layout changes. Two examples
   * are the display line, which fills while the user holds notes, and the
   * header, which becomes two lines when the MOS controls appear.
   *
   * The view is at the centre of the stage. Without this function the board
   * moves on the screen. The code moves the centre of the view by the same
   * distance as the stage. Thus each hex stays below the same pixel.
   */
  private anchorToStage(): void {
    const rect = this.stage.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return; // The browser has not laid out the page.
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    if (this.lastStageCenter) {
      this.cx += (center.x - this.lastStageCenter.x) / this.zoomValue;
      this.cy += (center.y - this.lastStageCenter.y) / this.zoomValue;
    }
    this.lastStageCenter = center;
  }

  private recycle(group: SVGGElement): void {
    group.remove();
    if (this.pool.length < POOL_LIMIT) this.pool.push(group);
  }

  private addHex(
    coord: string,
    x: number,
    y: number,
    step: number,
    detail: number,
    config: BoardConfig,
    duplicate: boolean
  ): void {
    const group = this.pool.pop() ?? document.createElementNS(NS, "g");
    this.renderHex(group, x, y, step, detail, config, duplicate);
    this.svg.appendChild(group);
    this.byCoord.set(coord, { group, step });
    const groups = this.byStep.get(step);
    if (groups) groups.push(group);
    else this.byStep.set(step, [group]);
  }

  /** Puts one hex into a new `<g>` element or into an element from the pool. */
  private renderHex(
    group: SVGGElement,
    x: number,
    y: number,
    step: number,
    detail: number,
    config: BoardConfig,
    duplicate: boolean
  ): void {
    const { model } = config;
    const degree = model.degree(step);
    const inScale = model.inScale(step);
    const palette = hexPalette(model.tuning, degree, { inScale, duplicate });

    group.replaceChildren();
    group.removeAttribute("style");
    group.setAttribute("class", "hex");
    group.classList.toggle("root", degree === model.scaleRoot);
    group.classList.toggle("out", !inScale);
    group.classList.toggle("muted", !inScale && config.silenceOutOfScale);
    group.classList.toggle("duplicate", duplicate);

    const halo = document.createElementNS(NS, "circle");
    halo.setAttribute("class", "halo");
    halo.setAttribute("cx", String(x));
    halo.setAttribute("cy", String(y));
    halo.setAttribute("r", (HEX_RADIUS * 1.65).toFixed(1));
    halo.setAttribute("fill", `url(#glow-${degree})`);
    group.appendChild(halo);

    const points: string[] = [];
    for (let corner = 0; corner < 6; corner++) {
      const angle = (Math.PI / 180) * (60 * corner + 30);
      const px = x + (HEX_RADIUS - 2.5) * Math.cos(angle);
      const py = y + (HEX_RADIUS - 2.5) * Math.sin(angle);
      points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    }
    const polygon = document.createElementNS(NS, "polygon");
    polygon.setAttribute("points", points.join(" "));
    polygon.setAttribute("fill", palette.fill);
    polygon.setAttribute("stroke", palette.stroke);
    polygon.setAttribute("stroke-width", "1.4");
    polygon.setAttribute("stroke-opacity", palette.strokeOpacity);
    group.appendChild(polygon);

    if (detail < 1) return;
    const { main, sub } = this.labelFor(step, config);
    if (!main) return;

    const showSub = detail === 2 && sub !== null;
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(showSub ? y - 4 : y + 4));
    text.setAttribute("font-size", String(main.length > 4 ? 8 : main.length > 3 ? 9 : main.length > 2 ? 10 : 12));
    text.textContent = main;
    group.appendChild(text);

    if (showSub) {
      const subText = document.createElementNS(NS, "text");
      subText.setAttribute("x", String(x));
      subText.setAttribute("y", String(y + 12));
      subText.setAttribute("font-size", "9");
      subText.setAttribute("opacity", "0.55");
      subText.textContent = sub;
      group.appendChild(subText);
    }
  }

  private labelFor(step: number, config: BoardConfig): { main: string; sub: string | null } {
    const { model } = config;
    switch (config.labels) {
      case "names":
        return { main: model.name(step), sub: String(model.register(step)) };
      case "degrees":
        return { main: String(model.degree(step)), sub: String(model.register(step)) };
      case "cents":
        return { main: model.centsFromRoot(step).toFixed(0), sub: null };
      case "ratios": {
        const match = nearestRatio(model.centsFromRoot(step), config.jiLimit);
        return { main: formatRatio(match), sub: formatError(match) };
      }
      case "hz": {
        const hz = model.frequency(step);
        return { main: hz >= 1000 ? hz.toFixed(0) : hz.toFixed(1), sub: null };
      }
      case "off":
        return { main: "", sub: null };
    }
  }

  /** Gives the quantity of text for the current zoom. A value of 0 gives no
   *  text, 1 gives the name only, and 2 gives the name and the register. Below
   *  a zoom of 60% the text is too small to read. */
  private labelDetail(): number {
    if (!this.config || this.config.labels === "off") return 0;
    if (this.zoomValue < 0.6) return 0;
    if (this.zoomValue < 0.85) return 1;
    return 2;
  }

  /**
   * Makes one radial gradient for each degree.
   *
   * The glow is a gradient fill. It is not a blur filter. Thus the processing
   * time does not increase when the user zooms the board.
   */
  private ensureGlowDefs(model: Model): void {
    if (this.glowKey === model.tuning.id) return;
    this.svg.querySelector("defs")?.remove();
    const defs = document.createElementNS(NS, "defs");
    for (let degree = 0; degree < model.tuning.size; degree++) {
      const hue = hueForDegree(model.tuning, degree);
      const gradient = document.createElementNS(NS, "radialGradient");
      gradient.setAttribute("id", `glow-${degree}`);
      for (const [offset, lightness, opacity] of [
        [0, 62, 0.85],
        [0.4, 60, 0.32],
        [1, 60, 0]
      ] as const) {
        const stop = document.createElementNS(NS, "stop");
        stop.setAttribute("offset", String(offset));
        stop.setAttribute("stop-color", `hsl(${hue}, 95%, ${lightness}%)`);
        stop.setAttribute("stop-opacity", String(opacity));
        gradient.appendChild(stop);
      }
      defs.appendChild(gradient);
    }
    this.svg.prepend(defs);
    this.glowKey = model.tuning.id;
  }

  private updateViewBox(): void {
    const width = this.stage.clientWidth / this.zoomValue;
    const height = this.stage.clientHeight / this.zoomValue;
    this.svg.setAttribute(
      "viewBox",
      `${(this.cx - width / 2).toFixed(1)} ${(this.cy - height / 2).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`
    );
    this.onZoomChange?.(this.zoomValue);
  }

  private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.stage.getBoundingClientRect();
    return {
      x: this.cx + (screenX - rect.left - rect.width / 2) / this.zoomValue,
      y: this.cy + (screenY - rect.top - rect.height / 2) / this.zoomValue
    };
  }
}

/**
 * Gives the note that one grid coordinate plays. It also reports if the hex is
 * a spare copy.
 *
 * A hex is a duplicate only if it plays the same note as the main area. In the
 * `octave` mode a band plays a different pitch. In the `fill` mode a band
 * plays a note that no other hex reaches. Thus the code does not make a hex in
 * those two modes grey.
 */
export function cellAt(q: number, r: number, config: BoardConfig): { step: number; duplicate: boolean } {
  const { east, upLeft } = config.model.vectors;
  const { size } = config.model.tuning;
  const base = config.model.centerStep + east * q - upLeft * r;
  return {
    step: base + bandOffset(q, r, east, upLeft, size, config.duplicateMode),
    duplicate: config.dimDuplicates && isEcho(q, r, east, upLeft, size, config.duplicateMode)
  };
}

/** Rounds fractional axial coordinates to a hex. This is the standard cube
 *  rounding method. */
function axialRound(qFractional: number, rFractional: number): { q: number; r: number } {
  const sFractional = -qFractional - rFractional;
  let q = Math.round(qFractional);
  let r = Math.round(rFractional);
  const s = Math.round(sFractional);

  const dq = Math.abs(q - qFractional);
  const dr = Math.abs(r - rFractional);
  const ds = Math.abs(s - sFractional);

  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
