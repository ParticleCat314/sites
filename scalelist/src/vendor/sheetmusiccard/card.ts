import { animateNotes, resolveAnimation } from "./animate";
import { PlaybackEngine } from "./playback";
import { fontsLoaded, renderScore } from "./renderer";
import { normalizeScore, scoreToEvents } from "./score";
import { resolveTheme } from "./themes";
import type { CardOptions, ScoreObject, Theme } from "./types";

/**
 * A themable card that renders a short section of music and can play it
 * back with a sampled piano, highlighting the sounding note.
 *
 * ```ts
 * const card = new MusicCard(document.querySelector("#host")!, {
 *   score: "C4/q, E4, G4, C5/h",
 *   theme: "midnight",
 *   animation: "stagger",
 *   controls: true,
 * });
 * ```
 */
export class MusicCard {
  private host: HTMLElement;
  private options: CardOptions;
  private theme: Theme;
  private score: ScoreObject;
  private engine: PlaybackEngine | null = null;
  private noteElements: SVGElement[] = [];
  private root: HTMLElement | null = null;
  private highlighted: SVGElement | null = null;

  /** Resolves once music fonts are loaded and the staff is drawn. */
  ready: Promise<void>;

  constructor(host: HTMLElement, options: CardOptions) {
    this.host = host;
    this.options = options;
    this.theme = resolveTheme(options.theme);
    this.score = normalizeScore(options.score);
    this.ready = this.render();
  }

  /** Re-render with new options merged over the current ones. */
  update(options: Partial<CardOptions>): Promise<void> {
    this.stop();
    this.options = { ...this.options, ...options };
    this.theme = resolveTheme(this.options.theme);
    this.score = normalizeScore(this.options.score);
    this.ready = this.render();
    return this.ready;
  }

  async play(): Promise<void> {
    await this.ready;
    this.engine ??= new PlaybackEngine(
      scoreToEvents(this.score),
      this.options.playback,
      {
        onNote: (index) => {
          if (this.options.highlightPlayback !== false) this.highlight(index);
          this.options.onNote?.(index);
        },
        onEnd: () => {
          this.clearHighlight();
          this.syncControls(false);
          this.options.onEnd?.();
        },
      }
    );
    this.syncControls(true);
    await this.engine.play();
  }

  stop(): void {
    this.engine?.stop();
  }

  /** Change playback tempo; takes effect from the next play(). */
  setTempo(tempo: number): void {
    this.options = { ...this.options, playback: { ...this.options.playback, tempo } };
    this.engine?.setTempo(tempo);
  }

  /** MIDI notes sustained under the next play(); [] disables the drone. */
  setDrone(drone: number[]): void {
    this.options = { ...this.options, playback: { ...this.options.playback, drone } };
    this.engine?.setDrone(drone);
  }

  get isPlaying(): boolean {
    return this.engine?.isPlaying ?? false;
  }

  /** Manually highlight a note by index (-1 or out of range clears). */
  highlight(index: number): void {
    this.clearHighlight();
    const element = this.noteElements[index];
    if (!element) return;
    this.highlighted = element;
    setNoteColor(element, this.theme.highlightColor);
    if (this.theme.highlightGlow) {
      element.style.filter = `drop-shadow(0 0 4px ${this.theme.highlightGlow})`;
    }
  }

  clearHighlight(): void {
    if (!this.highlighted) return;
    setNoteColor(this.highlighted, "");
    this.highlighted.style.filter = "";
    this.highlighted = null;
  }

  /** Remove the card from the DOM and stop playback. */
  destroy(): void {
    this.stop();
    this.root?.remove();
    this.root = null;
    this.noteElements = [];
  }

  private async render(): Promise<void> {
    await fontsLoaded();
    this.root?.remove();
    this.engine = null;
    this.highlighted = null;

    const theme = this.theme;
    const width = this.options.width ?? 360;
    const scale = this.options.scale ?? 1;

    const root = document.createElement("div");
    root.className = "sheetmusiccard";
    Object.assign(root.style, {
      background: theme.background,
      padding: theme.padding ?? "20px 24px",
      borderRadius: theme.borderRadius ?? "14px",
      boxShadow: theme.shadow ?? "none",
      border: theme.border ?? "none",
      width: `${width}px`,
      boxSizing: "content-box",
      display: "inline-block",
      fontFamily: theme.fontFamily ?? "serif",
    } satisfies Partial<CSSStyleDeclaration>);

    if (this.options.title) {
      const title = document.createElement("div");
      title.textContent = this.options.title;
      Object.assign(title.style, {
        color: theme.textColor,
        fontSize: "15px",
        fontWeight: "600",
        letterSpacing: "0.02em",
        marginBottom: "6px",
      } satisfies Partial<CSSStyleDeclaration>);
      root.appendChild(title);
    }

    const staffHost = document.createElement("div");
    root.appendChild(staffHost);

    const { noteElements } = renderScore(
      staffHost,
      this.score,
      theme,
      width,
      scale
    );
    this.noteElements = noteElements;

    if (this.options.controls) root.appendChild(this.buildControls());

    this.host.appendChild(root);
    this.root = root;

    animateNotes(noteElements, resolveAnimation(this.options.animation));
  }

  private playButton: HTMLButtonElement | null = null;

  private buildControls(): HTMLElement {
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      display: "flex",
      gap: "8px",
      marginTop: "10px",
    } satisfies Partial<CSSStyleDeclaration>);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "▶ Play";
    Object.assign(button.style, {
      font: "inherit",
      fontSize: "13px",
      color: this.theme.textColor,
      background: "transparent",
      border: `1px solid ${this.theme.staveColor}`,
      borderRadius: "999px",
      padding: "4px 14px",
      cursor: "pointer",
    } satisfies Partial<CSSStyleDeclaration>);
    button.addEventListener("click", () => {
      if (this.isPlaying) this.stop();
      else void this.play();
    });
    this.playButton = button;
    bar.appendChild(button);
    return bar;
  }

  private syncControls(playing: boolean): void {
    if (this.playButton) {
      this.playButton.textContent = playing ? "◼ Stop" : "▶ Play";
    }
  }
}

function setNoteColor(group: SVGElement, color: string): void {
  for (const el of group.querySelectorAll<SVGElement>("*")) {
    if (color) {
      if (el.getAttribute("fill") !== "none") el.style.fill = color;
      if (el.getAttribute("stroke") !== "none") el.style.stroke = color;
    } else {
      el.style.fill = "";
      el.style.stroke = "";
    }
  }
}
