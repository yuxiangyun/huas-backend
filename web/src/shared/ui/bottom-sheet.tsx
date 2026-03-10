import type { PropsWithChildren } from 'react';
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
              'fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[430px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
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
                'max-h-[88dvh] overflow-hidden rounded-[2rem] border-white/70 bg-card-strong p-0',
                sheetClassName
              )}
            >
              {showHandle ? (
                <div className="flex justify-center pt-3">
                  <span className="h-1.5 w-12 rounded-pill bg-black/10" />
                </div>
              ) : null}
              <div
                className={cn(
                  'max-h-[calc(88dvh-1.25rem)] overflow-y-auto px-6 pb-6',
                  showHandle ? 'pt-3' : 'pt-6',
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
