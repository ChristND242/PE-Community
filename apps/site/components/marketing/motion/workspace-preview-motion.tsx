'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import { marketingMotionEase, marketingMotionTokens } from './marketing-motion-config';

export function WorkspacePreviewMotion({ children }: { children: ReactNode }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: previewRef,
    offset: ['start end', 'end start'],
  });
  const depthY = useTransform(scrollYProgress, [0, 0.5, 1], [18, 0, -18]);
  const depthScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.986, 1, 0.992]);
  const depthOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.82, 1, 0.92]);

  return (
    <motion.div
      className="marketing-motion-safe"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 28, scale: 0.975 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={marketingMotionTokens.viewport}
      transition={{
        duration: shouldReduceMotion ? 0 : marketingMotionTokens.revealDuration,
        ease: marketingMotionEase,
      }}
    >
      <motion.div
        ref={previewRef}
        className="max-md:!translate-y-0 max-md:!scale-100 max-md:!opacity-100"
        style={shouldReduceMotion
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: depthOpacity, y: depthY, scale: depthScale }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
