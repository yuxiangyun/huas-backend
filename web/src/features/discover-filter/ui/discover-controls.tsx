import { useState } from 'react';
import { Add20Filled } from '@fluentui/react-icons/svg/add';
import { Apps20Filled } from '@fluentui/react-icons/svg/apps';
import { ArrowClockwise20Filled } from '@fluentui/react-icons/svg/arrow-clockwise';
import { ChevronDown20Filled } from '@fluentui/react-icons/svg/chevron-down';
import {
  type DiscoverCategory,
  type DiscoverSort,
} from '@/entities/discover/model/discover-types';
import { Button } from '@/shared/ui/button';
import { FilterChip } from '@/shared/ui/filter-chip';
import { IconButton } from '@/shared/ui/icon-button';
import { SegmentedControl } from '@/shared/ui/segmented-control';

type DiscoverCategoryFilter = DiscoverCategory | 'all';

interface DiscoverControlsProps {
  categories: readonly DiscoverCategory[];
  sort: DiscoverSort;
  category: DiscoverCategoryFilter;
  onSortChange: (sort: DiscoverSort) => void;
  onCategoryChange: (category: DiscoverCategoryFilter) => void;
  onRefreshClick: () => void;
  refreshing?: boolean;
  onComposeClick: () => void;
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
  onRefreshClick,
  refreshing = false,
  onComposeClick,
}: DiscoverControlsProps) {
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const categoryOptions: Array<{ value: DiscoverCategoryFilter; label: string }> = [
    { value: 'all', label: '全部' },
    ...categories.map((currentCategory) => ({
      value: currentCategory,
      label: currentCategory,
    })),
  ];
  const currentCategoryLabel = categoryOptions.find((option) => option.value === category)?.label || '全部';
  const hasActiveCategory = category !== 'all';
  const categoryButtonLabel = currentCategoryLabel === '全部' ? '分类' : currentCategoryLabel;

  const composeTrigger = (
    <IconButton
      className="bg-white/84 text-ink ring-1 ring-line shadow-none hover:bg-white active:bg-[#f4f5f6]"
      icon={<Add20Filled aria-hidden="true" className="size-4" />}
      label="发布好饭"
      size="sm"
      variant="secondary"
      onClick={onComposeClick}
    />
  );

  const refreshTrigger = (
    <IconButton
      className="bg-white/72 text-ink ring-1 ring-line shadow-none hover:bg-white active:bg-[#f4f5f6]"
      icon={<ArrowClockwise20Filled aria-hidden="true" className={refreshing ? 'size-4 animate-spin' : 'size-4'} />}
      label={refreshing ? '正在刷新' : '刷新列表'}
      size="sm"
      variant="subtle"
      onClick={onRefreshClick}
    />
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 px-0.5 pb-0.5 sm:flex-row sm:items-center sm:overflow-x-auto sm:scrollbar-hidden">
        <SegmentedControl
          className="w-full sm:min-w-0 sm:flex-1"
          items={sortOptions}
          layout="fill"
          size="sm"
          value={sort}
          onChange={onSortChange}
        />
        <div className="flex items-center gap-2 sm:shrink-0">
          <Button
            aria-expanded={categoriesExpanded}
            className="min-w-0 flex-1 justify-between gap-1.5 px-3.5 sm:min-w-[5.5rem] sm:flex-none"
            size="sm"
            type="button"
            variant={categoriesExpanded || hasActiveCategory ? 'secondary' : 'subtle'}
            onClick={() => setCategoriesExpanded((current) => !current)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Apps20Filled aria-hidden="true" className="size-4 shrink-0 text-muted" />
              <span className="truncate whitespace-nowrap">{categoryButtonLabel}</span>
            </span>
            <ChevronDown20Filled
              aria-hidden="true"
              className={categoriesExpanded ? 'size-4 shrink-0 rotate-180 text-muted transition' : 'size-4 shrink-0 text-muted transition'}
            />
          </Button>
          {refreshTrigger}
          {composeTrigger}
        </div>
      </div>

      <div className="space-y-2 px-0.5 py-0.5">
        {categoriesExpanded ? (
          <div className="glass-panel flex flex-wrap gap-2 rounded-[1.35rem] p-2.5">
            {categoryOptions.map((option) => {
              return (
                <FilterChip
                  key={option.value}
                  selected={option.value === category}
                  size="sm"
                  onClick={() => {
                    onCategoryChange(option.value);
                    setCategoriesExpanded(false);
                  }}
                >
                  {option.label}
                </FilterChip>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
