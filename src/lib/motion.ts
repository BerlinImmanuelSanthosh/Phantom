import type { Variants } from "framer-motion";

export const ease = [0.22, 1, 0.36, 1] as const;

export const page: Variants = {
  initial: { opacity: 0, y: 12, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease } },
  exit: { opacity: 0, y: -8, filter: "blur(6px)", transition: { duration: 0.25, ease } },
};

export const stagger: Variants = {
  animate: { transition: { staggerChildren: 0.06 } },
};

export const item: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
};

export const tap = { scale: 0.97 };
export const lift = { y: -4 };
