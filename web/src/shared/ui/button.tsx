import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white shadow-card hover:bg-[#25201b] active:bg-[#100d0a]',
  secondary: 'bg-white/82 text-ink ring-1 ring-line hover:bg-white active:bg-white/85',
  ghost: 'bg-transparent text-muted hover:bg-white/60 hover:text-ink active:bg-white/72',
  subtle: 'bg-white/62 text-ink ring-1 ring-line/80 hover:bg-white/82 active:bg-white',
  danger: 'bg-[#9e2e22] text-white shadow-card hover:bg-[#882519] active:bg-[#722016]',
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
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-pill font-medium leading-none whitespace-nowrap transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tint/30 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.985]',
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
