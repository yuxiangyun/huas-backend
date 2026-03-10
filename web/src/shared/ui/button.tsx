import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white shadow-card hover:bg-black active:bg-[#05070a] max-sm:shadow-none',
  secondary: 'bg-white/84 text-ink ring-1 ring-line hover:bg-white active:bg-[#f3f4f6] max-sm:bg-white/94',
  ghost: 'bg-transparent text-muted hover:bg-white/60 hover:text-ink active:bg-white/72',
  subtle: 'bg-white/72 text-ink ring-1 ring-line hover:bg-white active:bg-[#f4f5f6] max-sm:bg-white/90',
  danger: 'bg-error text-white shadow-card hover:bg-[#7c2828] active:bg-[#672020] max-sm:shadow-none',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-[var(--control-height-xs)] px-3 text-[0.78rem]',
  sm: 'h-[var(--control-height-sm)] px-4 text-sm',
  md: 'h-[var(--control-height-md)] px-[1.125rem] text-sm',
  lg: 'h-[var(--control-height-lg)] px-5 text-sm sm:text-base',
};

const iconOnlyClasses: Record<ButtonSize, string> = {
  xs: 'w-[var(--control-height-xs)] px-0',
  sm: 'w-[var(--control-height-sm)] px-0',
  md: 'w-[var(--control-height-md)] px-0',
  lg: 'w-[var(--control-height-lg)] px-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconOnly?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconOnly = false,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-pill font-medium leading-none whitespace-nowrap transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none',
        variantClasses[variant],
        sizeClasses[size],
        iconOnly && iconOnlyClasses[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  );
}
