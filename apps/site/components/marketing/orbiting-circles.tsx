'use client';

import { Children, type CSSProperties, type ReactNode } from 'react';
import { Cloud, Code2, Database, GitBranch, Server, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

interface OrbitingCirclesProps {
  className?: string;
  children?: ReactNode;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
  iconSize?: number;
  speed?: number;
}

export function OrbitingCircles({
  className,
  children,
  reverse = false,
  duration = 20,
  delay = 0,
  radius = 80,
  path = true,
  iconSize = 32,
  speed = 1,
}: OrbitingCirclesProps) {
  const items = Children.toArray(children);
  const diameter = radius * 2;
  const ringStyle = {
    '--pe-orbit-duration': `${duration / speed}s`,
    '--pe-orbit-delay': `${delay}s`,
    '--pe-orbit-from': '0deg',
    '--pe-orbit-to': reverse ? '-360deg' : '360deg',
    height: diameter,
    marginLeft: -radius,
    marginTop: -radius,
    transform: 'rotate(0deg)',
    width: diameter,
  } as CSSProperties;

  return (
    <div className={cn('pointer-events-none absolute left-1/2 top-1/2', className)}>
      {path ? (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 rounded-full border border-dashed border-emerald-100/[0.13]"
          style={{ height: diameter, marginLeft: -radius, marginTop: -radius, width: diameter }}
        />
      ) : null}
      <div
        className="pe-community-orbit absolute left-1/2 top-1/2"
        style={ringStyle}
      >
        {items.map((item, index) => {
          const angle = (360 / items.length) * index;
          const counterRotation = reverse ? 360 : -360;
          return (
            <span
              key={index}
              className="absolute left-1/2 top-1/2 grid place-items-center"
              style={{
                height: iconSize,
                marginLeft: -(iconSize / 2),
                marginTop: -(iconSize / 2),
                transform: `rotate(${angle}deg) translateX(${radius}px)`,
                width: iconSize,
              }}
            >
              <span
                className="pe-community-orbit grid place-items-center"
                style={{
                  '--pe-orbit-duration': `${duration / speed}s`,
                  '--pe-orbit-delay': `${delay}s`,
                  '--pe-orbit-from': `${-angle}deg`,
                  '--pe-orbit-to': `${-angle + counterRotation}deg`,
                  transform: `rotate(${-angle}deg)`,
                } as CSSProperties}
              >
                {item}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const orbitIconClassName = 'grid h-11 w-11 place-items-center rounded-xl border shadow-lg shadow-black/20 backdrop-blur-sm';

export function OpenSourceDeploymentOrbit() {
  return (
    <div aria-hidden="true" className="pointer-events-none relative mx-auto h-[260px] w-full max-w-[440px] overflow-hidden sm:h-[280px] xl:h-[420px]">
      <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 scale-[0.62] sm:scale-[0.82] xl:scale-100">
        <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-emerald-200/25 bg-emerald-300/[0.12] text-emerald-100 shadow-[0_0_38px_rgba(52,211,153,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Server size={29} />
        </div>

        <OrbitingCircles radius={148} duration={24} iconSize={44}>
          <span className={cn(orbitIconClassName, 'border-cyan-200/20 bg-cyan-300/[0.10] text-cyan-100')}><Cloud size={19} /></span>
          <span className={cn(orbitIconClassName, 'border-violet-200/20 bg-violet-300/[0.10] text-violet-100')}><Database size={19} /></span>
          <span className={cn(orbitIconClassName, 'border-amber-200/20 bg-amber-300/[0.10] text-amber-100')}><GitBranch size={19} /></span>
        </OrbitingCircles>

        <OrbitingCircles reverse radius={88} duration={15} delay={-2} iconSize={40}>
          <span className={cn(orbitIconClassName, 'h-10 w-10 border-emerald-200/20 bg-emerald-300/[0.10] text-emerald-100')}><ShieldCheck size={17} /></span>
          <span className={cn(orbitIconClassName, 'h-10 w-10 border-blue-200/20 bg-blue-300/[0.10] text-blue-100')}><Code2 size={17} /></span>
        </OrbitingCircles>
      </div>

      <style jsx global>{`
        @keyframes pe-community-orbit {
          from {
            transform: rotate(var(--pe-orbit-from));
          }
          to {
            transform: rotate(var(--pe-orbit-to));
          }
        }

        .pe-community-orbit {
          animation: pe-community-orbit var(--pe-orbit-duration) linear infinite;
          animation-delay: var(--pe-orbit-delay);
        }
        @media (prefers-reduced-motion: reduce) {
          .pe-community-orbit {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
