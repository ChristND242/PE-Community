'use client';

import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';

export function MarketingScrollProgress() {
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progressScale = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  if (shouldReduceMotion) return null;

  return (
    <motion.div
      aria-hidden="true"
      data-marketing-scroll-progress
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-px origin-left bg-emerald-300/80"
      style={{ scaleX: progressScale }}
    />
  );
}
