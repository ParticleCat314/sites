import { MusicCard } from "./card";
import type { CardOptions, ScoreInput } from "./types";

/**
 * `<music-card>` custom element wrapper around {@link MusicCard}.
 *
 * ```html
 * <music-card
 *   notes="C4/q, E4, G4, C5/h"
 *   theme="midnight"
 *   tempo="100"
 *   animation="stagger"
 *   card-title="C major arpeggio"
 *   controls
 * ></music-card>
 * ```
 *
 * For JSON scores or full options, set the `score` / `options` properties.
 */
export class MusicCardElement extends HTMLElement {
  static observedAttributes = [
    "notes",
    "theme",
    "tempo",
    "animation",
    "card-title",
    "controls",
    "width",
    "scale",
  ];

  private card: MusicCard | null = null;
  private scoreProperty: ScoreInput | null = null;
  private extraOptions: Partial<CardOptions> = {};

  /** JSON score (takes precedence over the `notes` attribute). */
  set score(value: ScoreInput | null) {
    this.scoreProperty = value;
    this.rebuild();
  }

  /** Extra CardOptions merged over attribute-derived ones. */
  set options(value: Partial<CardOptions>) {
    this.extraOptions = value;
    this.rebuild();
  }

  get api(): MusicCard | null {
    return this.card;
  }

  connectedCallback(): void {
    this.rebuild();
  }

  disconnectedCallback(): void {
    this.card?.destroy();
    this.card = null;
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.rebuild();
  }

  play(): Promise<void> | undefined {
    return this.card?.play();
  }

  stop(): void {
    this.card?.stop();
  }

  private rebuild(): void {
    this.card?.destroy();
    this.card = null;

    const score = this.scoreProperty ?? this.getAttribute("notes");
    if (!score) return;

    const tempo = Number(this.getAttribute("tempo"));
    const width = Number(this.getAttribute("width"));
    const scale = Number(this.getAttribute("scale"));

    const options: CardOptions = {
      score,
      theme: (this.getAttribute("theme") as CardOptions["theme"]) ?? undefined,
      title: this.getAttribute("card-title") ?? undefined,
      animation:
        (this.getAttribute("animation") as CardOptions["animation"]) ??
        undefined,
      controls: this.hasAttribute("controls"),
      ...(tempo ? { playback: { tempo } } : {}),
      ...(width ? { width } : {}),
      ...(scale ? { scale } : {}),
      ...this.extraOptions,
    };
    this.card = new MusicCard(this, options);
  }
}

/** Register `<music-card>` (safe to call more than once). */
export function defineMusicCardElement(tag = "music-card"): void {
  if (!customElements.get(tag)) {
    customElements.define(tag, MusicCardElement);
  }
}
