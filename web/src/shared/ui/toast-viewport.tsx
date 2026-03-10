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
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80]">
      <div className="mx-auto flex w-full max-w-[var(--layout-shell-max)] justify-center px-[var(--space-shell-x)] pt-[var(--space-shell-top)] sm:px-6 lg:justify-end">
        <div className="flex w-full max-w-[32rem] flex-col gap-3">
          <AnimatePresence>
            {items.map((item) => (
              <motion.button
                key={item.id}
                className={cn(
                  'pointer-events-auto w-full rounded-[1.15rem] px-4 py-3 text-left shadow-card sm:rounded-[1.4rem]',
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
      </div>
    </div>
  );
}
