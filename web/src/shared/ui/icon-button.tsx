/**
 * [INPUT]: 依赖 Button 视觉协议、图标节点与可访问名称
 * [OUTPUT]: 对外提供 IconButton 及其属性类型，强制纯图标动作具备 aria-label
 * [POS]: shared/ui 的可访问性适配原语，不重新实现按钮样式与状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@/shared/ui/button';

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconOnly'> {
  icon: ReactNode;
  label: string;
}

export function IconButton({
  icon,
  label,
  size = 'sm',
  type = 'button',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      iconOnly
      size={size}
      type={type}
      variant={variant}
      {...props}
    >
      {icon}
    </Button>
  );
}
