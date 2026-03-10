import { cn } from '@/shared/lib/cn';

interface RatingStripProps {
  disabled?: boolean;
  pendingScore?: number | null;
  value?: number | null;
  onRate?: (score: number) => void;
}

export function RatingStrip({ disabled = false, pendingScore = null, value, onRate }: RatingStripProps) {
  const currentValue = pendingScore ?? value;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">我的评分</p>
        <span className="text-sm text-muted">
          {currentValue ? `已打 ${currentValue} / 5 分` : '还没评分'}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, index) => {
          const score = index + 1;
          const active = currentValue ? score <= currentValue : false;
          return (
            <button
              key={score}
              className={cn(
                'h-11 rounded-[1rem] text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-55',
                active
                  ? 'bg-tint text-white'
                  : 'bg-white/75 text-muted ring-1 ring-line'
              )}
              type="button"
              disabled={disabled}
              onClick={() => onRate?.(score)}
            >
              {score}
            </button>
          );
        })}
      </div>
    </div>
  );
}
