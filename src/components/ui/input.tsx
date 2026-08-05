import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]',
        'placeholder:text-[var(--faint)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
