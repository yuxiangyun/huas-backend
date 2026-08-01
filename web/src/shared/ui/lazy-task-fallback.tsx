/**
 * [INPUT]: 依赖调用方提供的任务标签与全局弹层层级约定
 * [OUTPUT]: 对外提供 LazyTaskFallback，在路由分块下载期间立即显示轻量弹层外壳
 * [POS]: shared/ui 的异步交互占位原语，消除弱网首次点击发布、详情或聊天时的空响应窗口
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

interface LazyTaskFallbackProps {
  label: string;
}

export function LazyTaskFallback({ label }: LazyTaskFallbackProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="status" aria-label={`${label}加载中`}>
      <div className="w-full rounded-t-[1rem] border border-line bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:max-w-[var(--layout-sheet-max)] sm:rounded-[0.875rem] sm:p-5">
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-black/15 sm:hidden" />
        <div className="space-y-4" aria-hidden="true">
          <div className="h-6 w-32 animate-pulse rounded bg-shell-strong" />
          <div className="h-24 animate-pulse rounded-[0.75rem] bg-shell-strong" />
          <div className="h-10 animate-pulse rounded-[0.75rem] bg-shell-strong" />
        </div>
        <span className="sr-only">{label}加载中</span>
      </div>
    </div>
  );
}
