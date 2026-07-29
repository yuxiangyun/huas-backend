/**
 * [INPUT]: 依赖好饭排序/分类状态、Lucide 图标与 shared 选择控件
 * [OUTPUT]: 对外提供 DiscoverControls，集中呈现排序、分类、刷新与发布动作
 * [POS]: features/discover-filter 的交互边界，不展示说明性或装饰性标签
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ChevronDown, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { DiscoverCategory, DiscoverSort } from '@/entities/discover/model/discover-types';
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
    ...categories.map((value) => ({ value, label: value })),
  ];
  const categoryLabel = categoryOptions.find((option) => option.value === category)?.label ?? '全部';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SegmentedControl className="min-w-0 flex-1" items={sortOptions} layout="fill" size="sm" value={sort} onChange={onSortChange} />
        <IconButton
          icon={<RefreshCw aria-hidden="true" className={refreshing ? 'size-4 animate-spin' : 'size-4'} />}
          label="刷新"
          size="sm"
          variant="secondary"
          onClick={onRefreshClick}
        />
        <IconButton
          icon={<Plus aria-hidden="true" className="size-4" />}
          label="发布推荐"
          size="sm"
          variant="primary"
          onClick={onComposeClick}
        />
      </div>

      <Button
        aria-expanded={categoriesExpanded}
        className="max-w-full"
        size="xs"
        type="button"
        variant="ghost"
        onClick={() => setCategoriesExpanded((current) => !current)}
      >
        {category === 'all' ? '分类' : categoryLabel}
        <ChevronDown aria-hidden="true" className={categoriesExpanded ? 'size-3.5 rotate-180' : 'size-3.5'} />
      </Button>

      {categoriesExpanded ? (
        <div className="flex flex-wrap gap-2 rounded-[0.75rem] border border-line bg-white p-2">
          {categoryOptions.map((option) => (
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
          ))}
        </div>
      ) : null}
    </div>
  );
}
