/** The mouse, the touch screen and the pen. This module gives a push, a glide,
 *  a pan with two fingers, a zoom with two fingers and a zoom with the wheel. */

import type { HexBoard } from "../view/board.js";
import type { Player } from "../player.js";

export interface PointerInputOptions {
  readonly stage: HTMLElement;
  readonly board: HexBoard;
  readonly player: Player;
  /** Returns true while the pan tool is on. */
  wantsPan(): boolean;
}

type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; pointerId: number; last: Point }
  | { kind: "pinch"; pointerIds: [number, number]; lastDistance: number; lastCenter: Point }
  | null;

export function attachPointerInput({ stage, board, player, wantsPan }: PointerInputOptions): void {
  const points = new Map<number, Point>();
  /** The pointers that started on a hex. Each one continues to play until the
   *  user releases it. */
  const noteGestures = new Set<number>();
  let gesture: Gesture = null;

  const noteKey = (pointerId: number): string => `p${pointerId}`;

  const pinchState = (ids: [number, number]) => {
    const a = points.get(ids[0])!;
    const b = points.get(ids[1])!;
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    };
  };

  stage.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (event.pointerType === "touch" && points.size === 2) {
      for (const id of noteGestures) player.release(noteKey(id));
      noteGestures.clear();
      const ids = [...points.keys()].slice(0, 2) as [number, number];
      const state = pinchState(ids);
      gesture = { kind: "pinch", pointerIds: ids, lastDistance: state.distance, lastCenter: state.center };
      stage.classList.add("dragging");
      return;
    }

    if (wantsPan() || event.button === 1) {
      gesture = { kind: "pan", pointerId: event.pointerId, last: { x: event.clientX, y: event.clientY } };
      stage.classList.add("dragging");
      return;
    }

    const step = board.stepAt(event.clientX, event.clientY);
    if (step === null) return;
    noteGestures.add(event.pointerId);
    player.press(noteKey(event.pointerId), step);
  });

  stage.addEventListener("pointermove", (event) => {
    if (points.has(event.pointerId)) points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (gesture?.kind === "pinch" && gesture.pointerIds.includes(event.pointerId)) {
      if (!gesture.pointerIds.every((id) => points.has(id))) return;
      const state = pinchState(gesture.pointerIds);
      board.panBy(state.center.x - gesture.lastCenter.x, state.center.y - gesture.lastCenter.y);
      if (gesture.lastDistance > 0 && state.distance > 0) {
        board.zoomAt(state.center.x, state.center.y, state.distance / gesture.lastDistance);
      }
      gesture.lastDistance = state.distance;
      gesture.lastCenter = state.center;
      return;
    }

    if (gesture?.kind === "pan" && gesture.pointerId === event.pointerId) {
      board.panBy(event.clientX - gesture.last.x, event.clientY - gesture.last.y);
      gesture.last = { x: event.clientX, y: event.clientY };
      return;
    }

    if (!noteGestures.has(event.pointerId)) return;
    const key = noteKey(event.pointerId);
    const step = board.stepAt(event.clientX, event.clientY);
    if (step === null) player.release(key); // The pointer is on a gap or on a silent hex.
    else player.slide(key, step);
  });

  const end = (event: PointerEvent): void => {
    points.delete(event.pointerId);
    if (gesture?.kind === "pinch" && gesture.pointerIds.includes(event.pointerId)) gesture = null;
    if (gesture?.kind === "pan" && gesture.pointerId === event.pointerId) gesture = null;
    if (!gesture) stage.classList.remove("dragging");
    player.release(noteKey(event.pointerId));
    noteGestures.delete(event.pointerId);
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  stage.addEventListener("pointerleave", end);

  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      board.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
    },
    { passive: false }
  );
}
