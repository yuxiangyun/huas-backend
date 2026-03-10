import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';

export interface ImageViewerItem {
  src: string;
  alt: string;
  key?: string;
}

interface ImageViewerProps {
  index: number | null;
  items: readonly ImageViewerItem[];
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function ImageViewer({
  index,
  items,
  onClose,
  onIndexChange,
}: ImageViewerProps) {
  const isOpen = index !== null && items.length > 0;
  const activeIndex = index === null ? 0 : Math.min(Math.max(index, 0), items.length - 1);
  const activeItem = items[activeIndex];

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft' && activeIndex > 0) {
        onIndexChange(activeIndex - 1);
      }

      if (event.key === 'ArrowRight' && activeIndex < items.length - 1) {
        onIndexChange(activeIndex + 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, isOpen, items.length, onClose, onIndexChange]);

  return (
    <AnimatePresence>
      {isOpen && activeItem ? (
        <motion.div
          className="fixed inset-0 z-[90]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            aria-label="关闭图片预览"
            className="absolute inset-0 bg-black/55 backdrop-blur-md"
            type="button"
            onClick={onClose}
          />

          <div className="absolute inset-0 mx-auto flex max-w-[430px] flex-col justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
            <Card className="space-y-4 rounded-[2rem] border-white/15 bg-[#191613]/92 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-pill bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                  {activeIndex + 1} / {items.length}
                </span>
                <Button
                  className="border-white/10 bg-white/12 text-white hover:bg-white/18"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                >
                  关闭
                </Button>
              </div>

              <div className="overflow-hidden rounded-[1.6rem] bg-black/30">
                <img
                  alt={activeItem.alt}
                  className="max-h-[68vh] w-full object-contain"
                  src={activeItem.src}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button
                  className="text-white/85 hover:bg-white/10 hover:text-white disabled:text-white/35"
                  size="sm"
                  type="button"
                  variant="ghost"
                  disabled={activeIndex === 0}
                  onClick={() => onIndexChange(activeIndex - 1)}
                >
                  上一张
                </Button>
                <p className="min-w-0 flex-1 truncate text-center text-sm text-white/72">
                  {activeItem.alt}
                </p>
                <Button
                  className="text-white/85 hover:bg-white/10 hover:text-white disabled:text-white/35"
                  size="sm"
                  type="button"
                  variant="ghost"
                  disabled={activeIndex >= items.length - 1}
                  onClick={() => onIndexChange(activeIndex + 1)}
                >
                  下一张
                </Button>
              </div>

              {items.length > 1 ? (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {items.map((item, itemIndex) => (
                    <button
                      key={item.key ?? `${item.src}-${itemIndex}`}
                      aria-label={`查看第 ${itemIndex + 1} 张图片`}
                      className={itemIndex === activeIndex
                        ? 'overflow-hidden rounded-[1rem] ring-2 ring-white/80'
                        : 'overflow-hidden rounded-[1rem] opacity-70 transition hover:opacity-100'}
                      type="button"
                      onClick={() => onIndexChange(itemIndex)}
                    >
                      <img
                        alt={item.alt}
                        className="h-[4.5rem] w-[3.5rem] object-cover"
                        src={item.src}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
