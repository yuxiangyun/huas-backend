/**
 * [INPUT]: 依赖 React 按钮属性、图标节点与共享类名合并能力
 * [OUTPUT]: 对外提供 SocialCountAction，将 Social 互动图标与服务端计数组合为统一按钮
 * [POS]: shared/ui 的无业务互动原语，只负责触控尺寸、数字格式与激活态视觉，不持有点赞或评论语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SocialCountActionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean;
  count: number;
  icon: ReactNode;
}

export function SocialCountAction({
  active = false,
  className,
  count,
  icon,
  type = 'button',
  ...props
}: SocialCountActionProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full px-2 transition-opacity hover:opacity-60 disabled:cursor-not-allowed disabled:opacity-40',
        active && 'text-error',
        className
      )}
      type={type}
      {...props}
    >
      {icon}
      <span className="min-w-3 text-left text-[0.78rem] font-normal tabular-nums text-muted">
        {count.toLocaleString('zh-CN')}
      </span>
    </button>
  );
}
