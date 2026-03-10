import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
  const prefersReducedMotion = useReducedMotion();
  const isMobileViewport =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

  const overlayTransition = prefersReducedMotion
    ? { duration: 0 }
    : {
        duration: isMobileViewport ? 0.14 : 0.18,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  const sheetTransition = prefersReducedMotion
    ? { duration: 0 }
    : {
        duration: isMobileViewport ? 0.18 : 0.24,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  const sheetMotion = prefersReducedMotion
    ? { initial: { y: 0, opacity: 1 }, exit: { y: 0, opacity: 1 } }
    : {
        initial: { y: isMobileViewport ? 20 : 28, opacity: 0 },
        exit: { y: isMobileViewport ? 16 : 22, opacity: 0 },
      };

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
              'fixed inset-0 z-40 bg-black/20 sm:backdrop-blur-[2px] max-sm:bg-black/24',
              overlayClassName
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
            type="button"
            onClick={onClose}
          />
          <motion.div
            aria-modal="true"
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[var(--layout-sheet-max)] transform-gpu px-[var(--space-sheet-x)] pb-[calc(var(--space-tab-bottom)+0.2rem)] sm:px-6',
              viewportClassName
            )}
            initial={sheetMotion.initial}
            animate={{ y: 0, opacity: 1 }}
            exit={sheetMotion.exit}
            role="dialog"
            style={{ willChange: 'transform, opacity' }}
            transition={sheetTransition}
          >
            <Card
              className={cn(
                'max-h-[min(88dvh,56rem)] overflow-hidden rounded-[1.55rem] border-white/80 bg-card-strong p-0 max-sm:bg-white/98 max-sm:shadow-[0_14px_32px_rgba(15,23,42,0.14)] sm:rounded-[2rem]',
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
