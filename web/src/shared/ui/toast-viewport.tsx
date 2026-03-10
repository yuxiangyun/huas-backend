import { AnimatePresence, motion } from 'motion/react';
import { useToastStore } from '@/app/state/toast-store';
import { cn } from '@/shared/lib/cn';

const variantClasses = {
  success: 'bg-[#173a2a] text-white',
  error: 'bg-[#7a261b] text-white',
  info: 'bg-ink text-white',
} as const;

export function ToastViewport() {
  const items = useToastStore((state) => state.items);
  const dismissToast = useToastStore((state) => state.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] mx-auto flex max-w-[430px] flex-col gap-3 px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <AnimatePresence>
        {items.map((item) => (
          <motion.button
            key={item.id}
            className={cn(
              'pointer-events-auto w-full rounded-[1.4rem] px-4 py-3 text-left shadow-card',
              variantClasses[item.variant]
            )}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            type="button"
            onClick={() => dismissToast(item.id)}
          >
            <p className="text-sm font-semibold">{item.title}</p>
            {item.message ? (
              <p className="mt-1 text-sm leading-6 opacity-90">{item.message}</p>
            ) : null}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
