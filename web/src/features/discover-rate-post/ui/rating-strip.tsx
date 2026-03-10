import { FilterChip } from '@/shared/ui/filter-chip';

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
          return (
            <FilterChip
              key={score}
              className="w-full justify-center rounded-[1rem] disabled:cursor-not-allowed disabled:opacity-55"
              selected={currentValue ? score <= currentValue : false}
              size="sm"
              disabled={disabled}
              onClick={() => onRate?.(score)}
            >
              {score}
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}
