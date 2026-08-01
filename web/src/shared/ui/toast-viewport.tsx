/**
 * [INPUT]: 依赖全局 toast store、轻量 CSS 生命周期动效与 shared/lib/cn 样式合并
 * [OUTPUT]: 对外提供 ToastViewport，以不阻塞首屏的反馈动效呈现明确动作结果并支持手动关闭
 * [POS]: shared/ui 的全局短反馈视口，不引入重型动画运行时，不自行生成默认提示或业务文案
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useToastStore } from '@/app/state/toast-store';
import { cn } from '@/shared/lib/cn';

const variantClasses = {
  success: 'bg-ink text-white',
  error: 'bg-error text-white',
  info: 'bg-ink text-white',
} as const;

export function ToastViewport() {
  const items = useToastStore((state) => state.items);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80]">
      <div className="mx-auto flex w-full max-w-[var(--layout-shell-max)] justify-center px-[var(--space-shell-x)] pt-[var(--space-shell-top)] sm:px-6 lg:justify-end">
        <div className="flex w-full max-w-[24rem] flex-col gap-2">
          {items.map((item) => (
            <button
              key={item.id}
              className={cn(
                'toast-item pointer-events-auto w-full rounded-[0.75rem] px-4 py-3 text-left shadow-[0_8px_24px_rgba(0,0,0,0.12)]',
                variantClasses[item.variant]
              )}
              type="button"
              onClick={() => dismissToast(item.id)}
            >
              <p className="text-sm font-semibold">{item.title}</p>
              {item.message ? (
                <p className="mt-1 text-sm leading-6 opacity-90">{item.message}</p>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
