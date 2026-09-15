import type { AnimationOptions, AnimationType } from "./types";

export function resolveAnimation(
  animation?: AnimationType | AnimationOptions
): Required<AnimationOptions> {
  const options: AnimationOptions =
    typeof animation === "string" ? { type: animation } : animation ?? { type: "none" };
  return {
    type: options.type,
    duration: options.duration ?? 600,
    staggerDelay: options.staggerDelay ?? 60,
  };
}

/** Animate note groups in with the Web Animations API (no CSS injection). */
export function animateNotes(
  noteElements: SVGElement[],
  options: Required<AnimationOptions>
): void {
  if (options.type === "none") return;

  const keyframes: Record<AnimationType, Keyframe[]> = {
    none: [],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    stagger: [{ opacity: 0 }, { opacity: 1 }],
    rise: [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
  };

  noteElements.forEach((element, i) => {
    if (typeof element.animate !== "function") return; // no WAAPI (jsdom)
    const delay =
      options.type === "fade" ? 0 : i * options.staggerDelay;
    element.style.opacity = "0";
    const animation = element.animate(keyframes[options.type], {
      duration: options.duration,
      delay,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    });
    animation.onfinish = () => {
      element.style.opacity = "";
    };
  });
}
