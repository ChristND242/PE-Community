'use client';

import { LoaderCircle, type LucideIcon } from 'lucide-react';

import { Button } from '../ui';
import { cn } from '../../lib/utils';
import { ButtonGroup } from './button-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

export type GroupedButtonAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  ariaLabel?: string;
};

export type GroupedButtonProps = {
  actions: GroupedButtonAction[];
  className?: string;
  size?: 'sm' | 'default';
};

export function GroupedButton({ actions, className, size = 'default' }: GroupedButtonProps) {
  return (
    <TooltipProvider delayDuration={250}>
      <ButtonGroup className={className}>
        {actions.map((action, index) => {
          const Icon = action.icon;
          const disabled = Boolean(action.disabled || action.loading);
          return (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  onClick={action.onClick}
                  disabled={disabled}
                  aria-label={action.ariaLabel ?? action.label}
                  className={cn(
                    'relative rounded-none bg-transparent p-0 text-white/70 shadow-none hover:bg-white/[0.07] hover:text-white focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/55 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                    size === 'sm' ? 'h-9 w-9' : 'h-10 w-10',
                    index > 0 && 'border-l border-white/10',
                    index === 0 && 'rounded-l-[11px]',
                    index === actions.length - 1 && 'rounded-r-[11px]',
                    action.destructive && 'text-rose-200 hover:bg-rose-300/10 hover:text-rose-100',
                  )}
                >
                  {action.loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{action.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </ButtonGroup>
    </TooltipProvider>
  );
}
