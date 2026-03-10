import {
  type DiscoverCategory,
  type DiscoverSort,
} from '@/entities/discover/model/discover-types';
import { FilterChip } from '@/shared/ui/filter-chip';
import { SegmentedControl } from '@/shared/ui/segmented-control';

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
    <div className="space-y-3">
      <SegmentedControl
        items={sortOptions}
        size="md"
        value={sort}
        onChange={onSortChange}
      />

      <div className="flex gap-2 overflow-x-auto px-0.5 py-0.5 lg:flex-wrap lg:overflow-visible">
        {categoryOptions.map((option) => {
          return (
            <FilterChip
              key={option.value}
              selected={option.value === category}
              size="md"
              onClick={() => onCategoryChange(option.value)}
            >
              {option.label}
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
}
