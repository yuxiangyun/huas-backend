/**
 * [INPUT]: 依赖 Radix Dialog 的焦点管理、Portal、全局轻量弹层动效与浏览器对话框语义
 * [OUTPUT]: 对外提供 BottomSheet，以稳定进退场在移动端呈现短任务底部抽屉、桌面端呈现居中对话框
 * [POS]: shared/ui 的模态交互原语，负责遮罩、Esc、焦点锁定与安全区，不承载长表单
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { PropsWithChildren } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/shared/lib/cn';

interface BottomSheetProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
  closeLabel?: string;
  contentClassName?: string;
  overlayClassName?: string;
  sheetClassName?: string;
  viewportClassName?: string;
  showHandle?: boolean;
}

export function BottomSheet({
  open,
  onClose,
  closeLabel = '关闭',
  contentClassName,
  overlayClassName,
  sheetClassName,
  viewportClassName,
  showHandle = true,
  children,
}: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'dialog-overlay fixed inset-0 z-40 bg-black/40',
            overlayClassName
          )}
        />
        <div
          className={cn(
            'pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6',
            viewportClassName
          )}
        >
          <Dialog.Content
            aria-describedby={undefined}
            className={cn(
              'dialog-surface pointer-events-auto max-h-[92dvh] w-full overflow-hidden rounded-t-[1rem] border border-line bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] outline-none sm:max-w-[var(--layout-sheet-max)] sm:rounded-[0.875rem]',
              sheetClassName
            )}
          >
            <Dialog.Title className="sr-only">{closeLabel}</Dialog.Title>
            {showHandle ? (
              <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
                <span className="h-1 w-9 rounded-full bg-black/15" />
              </div>
            ) : null}
            <div
              className={cn(
                'max-h-[calc(92dvh-1rem)] overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:max-h-[calc(88dvh-2rem)] sm:px-5 sm:pb-5 sm:pt-5',
                contentClassName
              )}
            >
              {children}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
