/**
 * [INPUT]: 依赖好饭排序/分类状态、Lucide 图标与 shared 选择控件
 * [OUTPUT]: 对外提供 DiscoverControls，以仅保留顶部边界的胶囊工具栏集中呈现排序、分类与刷新动作
 * [POS]: features/discover-filter 的交互边界，不展示说明性或装饰性标签
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ChevronDown, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { DiscoverCategory, DiscoverSort } from '@/entities/discover/model/discover-types';
import { FilterChip } from '@/shared/ui/filter-chip';
import { IconButton } from '@/shared/ui/icon-button';

type DiscoverCategoryFilter = DiscoverCategory | 'all';

interface DiscoverControlsProps {
  categories: readonly DiscoverCategory[];
  sort: DiscoverSort;
  category: DiscoverCategoryFilter;
  onSortChange: (sort: DiscoverSort) => void;
  onCategoryChange: (category: DiscoverCategoryFilter) => void;
  onRefreshClick: () => void;
  refreshing?: boolean;
}

const sortOptions: Array<{ value: DiscoverSort; label: string }> = [
  { value: 'latest', label: '最新' },
  { value: 'popular', label: '热门' },
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
}: DiscoverControlsProps) {
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const categoryOptions: Array<{ value: DiscoverCategoryFilter; label: string }> = [
    { value: 'all', label: '全部' },
    ...categories.map((value) => ({ value, label: value })),
  ];
  const categoryLabel = category === 'all'
    ? '全部分类'
    : categoryOptions.find((option) => option.value === category)?.label ?? '全部分类';

  return (
    <div className="relative z-20 flex items-center gap-1.5 border-t border-line bg-white px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {sortOptions.map((option) => {
          const active = option.value === sort;
          return (
            <button
              key={option.value}
              aria-pressed={active}
              className={`h-9 min-w-0 flex-1 rounded-full px-2 text-xs font-semibold transition-colors ${active ? 'bg-ink text-white' : 'text-muted hover:bg-tint-soft hover:text-ink'}`}
              type="button"
              onClick={() => onSortChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="relative shrink-0">
        <button
          aria-expanded={categoriesExpanded}
          className="inline-flex h-9 max-w-28 items-center gap-1 rounded-full bg-tint-soft px-3 text-xs font-semibold text-ink"
          type="button"
          onClick={() => setCategoriesExpanded((current) => !current)}
        >
          <span className="truncate">{categoryLabel}</span>
          <ChevronDown aria-hidden="true" className={`size-3 shrink-0 transition-transform ${categoriesExpanded ? 'rotate-180' : ''}`} />
        </button>

        {categoriesExpanded ? (
          <div className="absolute right-0 top-11 grid w-48 grid-cols-2 gap-1.5 rounded-[0.875rem] border border-line bg-white p-2 shadow-[0_14px_42px_rgba(0,0,0,0.14)]">
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
                {option.value === 'all' ? '全部分类' : option.label}
              </FilterChip>
            ))}
          </div>
        ) : null}
      </div>

      <div className="shrink-0">
        <IconButton
          icon={<RefreshCw aria-hidden="true" className={refreshing ? 'size-4 animate-spin' : 'size-4'} />}
          label="刷新"
          size="sm"
          variant="ghost"
          onClick={onRefreshClick}
        />
      </div>
    </div>
  );
}
