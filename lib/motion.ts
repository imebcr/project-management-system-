import type { Transition, Variants } from 'framer-motion';

export const pageTransition: Transition = { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] };

export const cardHover = { y: -4, scale: 1.015 };
export const cardSpring: Transition = { type: 'spring' as const, stiffness: 500, damping: 28 };

export const modalSpring: Transition = { type: 'spring' as const, stiffness: 340, damping: 28 };

export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const staggerChildY: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 30 } },
};

export const staggerChildX: Variants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 30 } },
};
