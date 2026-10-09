import { Pagination } from '@heroui/react/pagination';

interface DataPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  isPending?: boolean;
}

export function DataPagination({ page, pageSize, total, onPageChange, isPending }: DataPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return null;
  const current = Math.min(Math.max(1, page), pages);
  const start = Math.max(1, Math.min(current - 1, pages - 2));
  const visiblePages = Array.from({ length: Math.min(3, pages) }, (_, index) => start + index);
  return (
    <Pagination aria-label="分页" className="w-auto max-w-full flex-row flex-wrap justify-end gap-x-3 gap-y-2" size="sm">
      <Pagination.Summary className="self-center tabular-nums [overflow-wrap:anywhere]">{current.toLocaleString('zh-CN')} / {pages.toLocaleString('zh-CN')}</Pagination.Summary>
      <Pagination.Content className="max-w-full self-center flex-wrap">
        <Pagination.Item>
          <Pagination.Previous aria-label="上一页" isDisabled={isPending || current <= 1} onPress={() => onPageChange(current - 1)}><Pagination.PreviousIcon /></Pagination.Previous>
        </Pagination.Item>
        {pages < 10_000 ? visiblePages.map((value) => <Pagination.Item key={value}><Pagination.Link className="min-w-8 w-auto px-1" aria-label={`第 ${value} 页`} isActive={value === current} isDisabled={isPending} onPress={() => onPageChange(value)}>{value}</Pagination.Link></Pagination.Item>) : null}
        <Pagination.Item>
          <Pagination.Next aria-label="下一页" isDisabled={isPending || current >= pages} onPress={() => onPageChange(current + 1)}><Pagination.NextIcon /></Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );
}
