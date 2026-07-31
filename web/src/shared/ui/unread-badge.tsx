/**
 * [INPUT]: 依赖数字未读值与 cn 样式合并能力
 * [OUTPUT]: 对外提供 UnreadBadge，以固定高度的单数字圆形或多数字胶囊显示上限化未读数
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
      'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-[5px] text-[10px] font-semibold leading-none text-white tabular-nums',
      className
    )}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
