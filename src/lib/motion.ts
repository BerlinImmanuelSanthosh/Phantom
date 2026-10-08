import type { Variants } from "framer-motion";

export const ease = [0.22, 1, 0.36, 1] as const;

export const spring = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const;

export const page: Variants = {
  // Keep transitions short and compositor-friendly; routed content enters once.
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.16, ease },
  },
};

export const stagger: Variants = {
  animate: { transition: { staggerChildren: 0.025 } },
};

export const item: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
};

export const tap = { scale: 0.97 };
export const lift = { y: -4 };
