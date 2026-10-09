import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';

interface DataStateProps {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: boolean;
  emptyText?: string;
}

export function DataState({ loading, error, onRetry, empty, emptyText = '暂无数据' }: DataStateProps) {
  if (loading) return <div className="grid min-h-36 place-items-center" role="status" aria-label="加载中"><Spinner /></div>;
  if (error) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-3" role="alert">
        <p className="max-w-full text-center text-sm text-danger [overflow-wrap:anywhere]">{error instanceof Error ? error.message : '加载失败'}</p>
        {onRetry ? <Button size="sm" variant="secondary" onPress={onRetry}>重试</Button> : null}
      </div>
    );
  }
  return empty ? <p className="py-12 text-center text-sm text-muted">{emptyText}</p> : null;
}
