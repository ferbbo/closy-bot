'use client';

/**
 * Simple Switch toggle component (no Radix dependency)
 * Accessible with keyboard and screen readers
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      defaultChecked = false,
      onCheckedChange,
      disabled = false,
      id,
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    const isChecked = checked ?? internalChecked;

    const toggle = () => {
      if (disabled) return;
      const next = !isChecked;
      setInternalChecked(next);
      onCheckedChange?.(next);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
    };

    return (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          isChecked ? 'bg-blue-600' : 'bg-gray-200',
          className,
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
            isChecked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
