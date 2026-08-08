/**
 * [INPUT]: 依赖 Radix Dialog 的焦点与 Portal 能力、React 组合内容和 shared 轻量弹层样式规范
 * [OUTPUT]: 对外提供 TaskDialog，为编辑任务提供边界与进退场统一、可替换头部的居中弹窗或移动全屏容器，并支持不可误关模式
 * [POS]: shared/ui 的表单与裁切任务原语，与只承载短操作的 BottomSheet 形成明确边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { PropsWithChildren, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/cn';

interface TaskDialogProps extends PropsWithChildren {
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  header?: ReactNode;
  className?: string;
  containerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  headerClassName?: string;
  closeLabel?: string;
  dismissible?: boolean;
  presentation?: 'fullscreen' | 'modal';
}

export function TaskDialog({
  open,
  title,
  onClose,
  footer,
  header,
  className,
  containerClassName,
  contentClassName,
  footerClassName,
  headerClassName,
  closeLabel = '取消',
  dismissible = true,
  presentation = 'fullscreen',
  children,
}: TaskDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-black/40" />
        <div className={cn(
          'pointer-events-none fixed inset-0 z-50 flex justify-center',
          presentation === 'modal'
            ? 'items-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] sm:p-6'
            : 'items-stretch sm:items-center sm:p-6',
          containerClassName
        )}>
          <Dialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              if (!dismissible) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!dismissible) event.preventDefault();
            }}
            className={cn(
              'dialog-surface pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden bg-white outline-none',
              presentation === 'modal'
                ? 'max-h-[min(88dvh,48rem)] max-w-[46rem] rounded-[0.875rem] border border-line shadow-[0_20px_60px_rgba(0,0,0,0.18)]'
                : 'sm:max-h-[min(90dvh,52rem)] sm:max-w-[46rem] sm:rounded-[0.875rem] sm:border sm:border-line sm:shadow-[0_20px_60px_rgba(0,0,0,0.18)]',
              className
            )}
          >
            <header className={cn(
              'flex shrink-0 justify-between border-b border-line',
              presentation === 'modal'
                ? 'h-14 items-center px-4 sm:px-5'
                : 'h-[calc(3.5rem+env(safe-area-inset-top))] items-end px-4 pb-3 pt-[env(safe-area-inset-top)] sm:h-14 sm:items-center sm:px-5 sm:pb-0 sm:pt-0',
              headerClassName
            )}>
              {header ? (
                <>
                  <Dialog.Title className="sr-only">{title}</Dialog.Title>
                  {header}
                </>
              ) : (
                <>
                  <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
                  <Button size="xs" type="button" variant="ghost" onClick={onClose}>
                    {closeLabel}
                  </Button>
                </>
              )}
            </header>
            <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5', contentClassName)}>
              {children}
            </div>
            {footer ? (
              <footer className={cn(
                'shrink-0 border-t border-line bg-white px-4 pt-3 sm:px-5 sm:pb-4',
                presentation === 'modal' ? 'pb-4' : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
                footerClassName
              )}>
                {footer}
              </footer>
            ) : null}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
