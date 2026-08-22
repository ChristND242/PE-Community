'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { marketingMotionEase, marketingMotionTokens } from './marketing-motion-config';

type MarketingRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
};

export function MarketingReveal({
  children,
  className,
  delay = 0,
  distance = marketingMotionTokens.revealDistance,
}: MarketingRevealProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={['marketing-motion-safe', className].filter(Boolean).join(' ')}
      initial={shouldReduceMotion ? false : { opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={marketingMotionTokens.viewport}
      transition={{
        duration: shouldReduceMotion ? 0 : marketingMotionTokens.revealDuration,
        delay: shouldReduceMotion ? 0 : delay,
        ease: marketingMotionEase,
      }}
    >
      {children}
    </motion.div>
  );
}
