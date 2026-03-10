import {
  type DiscoverCategory,
  type DiscoverSort,
} from '@/entities/discover/model/discover-types';
import { cn } from '@/shared/lib/cn';

type DiscoverCategoryFilter = DiscoverCategory | 'all';

interface DiscoverControlsProps {
  categories: readonly DiscoverCategory[];
  sort: DiscoverSort;
  category: DiscoverCategoryFilter;
  onSortChange: (sort: DiscoverSort) => void;
  onCategoryChange: (category: DiscoverCategoryFilter) => void;
}

const sortOptions: Array<{ value: DiscoverSort; label: string }> = [
  { value: 'latest', label: '最新' },
  { value: 'score', label: '高分' },
  { value: 'recommended', label: '推荐' },
];

export function DiscoverControls({
  categories,
  sort,
  category,
  onSortChange,
  onCategoryChange,
}: DiscoverControlsProps) {
  const categoryOptions: Array<{ value: DiscoverCategoryFilter; label: string }> = [
    { value: 'all', label: '全部' },
    ...categories.map((currentCategory) => ({
      value: currentCategory,
      label: currentCategory,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="glass-panel flex items-center gap-2 rounded-[1.7rem] p-1.5">
        {sortOptions.map((option) => {
          const isActive = option.value === sort;
          return (
            <button
              key={option.value}
              className={cn(
                'h-11 flex-1 rounded-pill text-sm font-medium transition',
                isActive
                  ? 'bg-ink text-white shadow-card'
                  : 'text-muted hover:bg-white/60 hover:text-ink'
              )}
              type="button"
              onClick={() => onSortChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categoryOptions.map((option) => {
          const isActive = option.value === category;
          return (
            <button
              key={option.value}
              className={cn(
                'shrink-0 rounded-pill px-4 py-2 text-sm transition',
                isActive
                  ? 'bg-tint text-white shadow-card'
                  : 'bg-white/75 text-muted ring-1 ring-line hover:bg-white hover:text-ink'
              )}
              type="button"
              onClick={() => onCategoryChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
