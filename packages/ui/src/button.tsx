import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', ...props },
  ref
) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand))] disabled:opacity-50 disabled:pointer-events-none';
  const variants: Record<string, string> = {
    primary: 'bg-[hsl(var(--brand))] text-black hover:opacity-90',
    secondary: 'border border-border bg-bg text-fg hover:bg-card'
  };
  const sizes: Record<string, string> = { sm: 'px-3 py-2 text-sm', md: 'px-4 py-3 text-sm' };
  return <button ref={ref} className={clsx(base, variants[variant], sizes[size], className)} {...props} />;
});

