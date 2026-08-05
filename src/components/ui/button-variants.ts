import { cva } from 'class-variance-authority';

// Split out from button.tsx: this is pure styling logic with no client-only
// dependency, but button.tsx is 'use client' (the <button> element needs
// forwardRef/event handling) — and Next.js's RSC boundary means a function
// exported from a 'use client' module can't be called from a Server
// Component at all, even a plain string-returning one. Landing page CTAs
// are <Link>s styled to look like buttons and are rendered from Server
// Components, so this needs to live outside that boundary.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--accent)] text-white hover:opacity-90',
        yes: 'bg-[var(--yes)] text-white hover:opacity-90',
        no: 'bg-[var(--no)] text-white hover:opacity-90',
        outline: 'border border-[var(--line)] bg-transparent text-[var(--ink)] hover:bg-[var(--surface-2)]',
        ghost: 'bg-transparent text-[var(--ink-soft)] hover:bg-[var(--surface-2)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
