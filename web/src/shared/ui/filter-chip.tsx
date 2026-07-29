/**
 * [INPUT]: 依赖 React 原生按钮属性与 shared/lib/cn 的样式合并能力
 * [OUTPUT]: 对外提供 FilterChip，以 aria-pressed 暴露筛选项的选中语义
 * [POS]: shared/ui 的轻量筛选原语，不持有筛选状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  size?: 'sm' | 'md';
}

const sizeClasses = {
  sm: 'h-[var(--control-height-xs)] px-3 text-[0.8rem]',
  md: 'h-[var(--control-height-sm)] px-4 text-sm',
} as const;

export function FilterChip({
  className,
  selected = false,
  size = 'md',
  type = 'button',
  ...props
}: FilterChipProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[0.625rem] border font-medium leading-none whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/45 focus-visible:ring-offset-2 motion-reduce:transition-none',
        sizeClasses[size],
        selected
          ? 'border-ink bg-ink text-white'
          : 'border-line bg-white text-muted hover:bg-tint-soft hover:text-ink active:bg-shell-strong',
        className
      )}
      type={type}
      {...props}
    />
  );
}
