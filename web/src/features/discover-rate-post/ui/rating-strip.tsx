/**
 * [INPUT]: 依赖 Lucide 星标图标与调用方评分状态
 * [OUTPUT]: 对外提供 RatingStrip，以五个可访问按钮提交 1–5 分评分
 * [POS]: features/discover-rate-post 的评分输入原语，不展示默认教学文案
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Star } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface RatingStripProps {
  disabled?: boolean;
  pendingScore?: number | null;
  value?: number | null;
  onRate?: (score: number) => void;
}

export function RatingStrip({ disabled = false, pendingScore = null, value, onRate }: RatingStripProps) {
  const currentValue = pendingScore ?? value ?? 0;

  return (
    <div className="flex items-center gap-1" aria-label="评分">
      {Array.from({ length: 5 }, (_, index) => {
        const score = index + 1;
        const selected = score <= currentValue;
        return (
          <button
            key={score}
            aria-label={`${score} 分`}
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-[0.5rem] transition-colors hover:bg-tint-soft disabled:pointer-events-none disabled:opacity-45',
              selected ? 'text-ink' : 'text-[#a3a3a3]'
            )}
            disabled={disabled}
            type="button"
            onClick={() => onRate?.(score)}
          >
            <Star aria-hidden="true" className="size-5" fill={selected ? 'currentColor' : 'none'} />
          </button>
        );
      })}
    </div>
  );
}
