/**
 * [INPUT]: 依赖数字未读值与 cn 样式合并能力
 * [OUTPUT]: 对外提供 UnreadBadge，以紧凑尺寸显示上限化未读数
 * [POS]: shared/ui 的无业务语义状态原语，由导航、会话与消息分段控件复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { cn } from '@/shared/lib/cn';

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null;
  return (
    <span className={cn(
      'inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 py-0.5 text-[0.625rem] font-semibold leading-none text-white tabular-nums',
      className
    )}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
