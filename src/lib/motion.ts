import type { Variants } from "framer-motion";

export const ease = [0.22, 1, 0.36, 1] as const;

export const page: Variants = {
  // Enter: fade in + slide up. Runs simultaneously with exit (mode="popLayout").
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease },
  },
  // Exit: quick fade + slight downscale. popLayout makes this absolute so it
  // overlays without pushing the incoming page down.
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};

export const stagger: Variants = {
  animate: { transition: { staggerChildren: 0.04 } },
};

export const item: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease } },
};

export const tap = { scale: 0.97 };
export const lift = { y: -4 };
