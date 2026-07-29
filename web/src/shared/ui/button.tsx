/**
 * [INPUT]: 依赖 React 原生按钮属性与 shared/lib/cn 的样式合并能力
 * [OUTPUT]: 对外提供 Button 组件与 ButtonProps，统一按钮语义、尺寸与焦点状态
 * [POS]: shared/ui 的基础动作原语，被页面与业务组件共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-black/85 active:bg-black',
  secondary: 'border border-line bg-white text-ink shadow-card hover:bg-tint-soft active:bg-shell-strong',
  ghost: 'bg-transparent text-muted hover:bg-tint-soft hover:text-ink active:bg-shell-strong',
  subtle: 'bg-tint-soft text-ink hover:bg-shell-strong active:bg-[#dededf]',
  danger: 'bg-error text-white hover:bg-[#b91c1c] active:bg-[#991b1b]',
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
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-[0.625rem] font-medium leading-none whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/45 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
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
