import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import { Card } from '@/shared/ui/card';

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
  closeLabel = '关闭弹层',
  contentClassName,
  overlayClassName,
  sheetClassName,
  viewportClassName,
  showHandle = true,
  children,
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label={closeLabel}
            className={cn(
              'fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]',
              overlayClassName
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={onClose}
          />
          <motion.div
            aria-modal="true"
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[var(--layout-sheet-max)] px-[var(--space-sheet-x)] pb-[var(--space-tab-bottom)] sm:px-6',
              viewportClassName
            )}
            initial={{ y: '100%', opacity: 0.84 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.84 }}
            role="dialog"
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <Card
              className={cn(
                'max-h-[min(88dvh,56rem)] overflow-hidden rounded-[1.55rem] border-white/70 bg-card-strong p-0 sm:rounded-[2rem]',
                sheetClassName
              )}
            >
              {showHandle ? (
                <div className="flex justify-center pt-2.5 sm:pt-3">
                  <span className="h-1.5 w-10 rounded-pill bg-black/10 sm:w-12" />
                </div>
              ) : null}
              <div
                className={cn(
                  'max-h-[calc(min(88dvh,56rem)-1rem)] overflow-y-auto px-[var(--space-card-padding)] pb-[var(--space-sheet-y)] sm:px-6',
                  showHandle ? 'pt-2.5 sm:pt-3' : 'pt-[var(--space-sheet-y)]',
                  contentClassName
                )}
              >
                {children}
              </div>
            </Card>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
