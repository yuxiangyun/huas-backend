/**
 * [INPUT]: 依赖 motion 动效、Lucide 图标、图片集合与键盘导航动作
 * [OUTPUT]: 对外提供 ImageViewer，以全屏查看器呈现媒体并支持键盘、缩略图和前后切换
 * [POS]: shared/ui 的媒体查看原语，不展示文件名或业务说明
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';
import { IconButton } from '@/shared/ui/icon-button';

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
  const prefersReducedMotion = useReducedMotion();
  const isMobileViewport =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

  const overlayTransition = prefersReducedMotion
    ? { duration: 0 }
    : {
        duration: isMobileViewport ? 0.14 : 0.18,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  const panelTransition = prefersReducedMotion
    ? { duration: 0 }
    : {
        duration: isMobileViewport ? 0.18 : 0.24,
        ease: [0.22, 1, 0.36, 1] as const,
      };

  const panelMotion = prefersReducedMotion
    ? { initial: { y: 0, opacity: 1 }, exit: { y: 0, opacity: 1 } }
    : {
        initial: { y: isMobileViewport ? 14 : 18, opacity: 0 },
        exit: { y: isMobileViewport ? 10 : 14, opacity: 0 },
      };

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

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
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeIndex, isOpen, items.length, onClose, onIndexChange]);

  return (
    <AnimatePresence>
      {isOpen && activeItem ? (
        <div className="fixed inset-0 z-[90]">
          <motion.button
            aria-label="关闭图片预览"
            className="absolute inset-0 bg-black/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
            type="button"
            onClick={onClose}
          />

          <motion.div
            className="absolute inset-0 mx-auto flex w-full max-w-[72rem] transform-gpu flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6"
            initial={panelMotion.initial}
            animate={{ y: 0, opacity: 1 }}
            exit={panelMotion.exit}
            style={{ willChange: 'transform, opacity' }}
            transition={panelTransition}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 text-white">
              <div className="flex h-10 shrink-0 items-center justify-between gap-3">
                <span className="text-xs font-medium text-white/70">
                  {activeIndex + 1} / {items.length}
                </span>
                <IconButton
                  className="text-white hover:bg-white/10 hover:text-white"
                  icon={<X aria-hidden="true" className="size-5" />}
                  label="关闭图片预览"
                  size="sm"
                  variant="secondary"
                  onClick={onClose}
                />
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                <img
                  alt={activeItem.alt}
                  className="max-h-full max-w-full object-contain"
                  src={activeItem.src}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <IconButton
                  className="text-white hover:bg-white/10 hover:text-white disabled:text-white/30"
                  disabled={activeIndex === 0}
                  icon={<ChevronLeft aria-hidden="true" className="size-5" />}
                  label="上一张"
                  onClick={() => onIndexChange(activeIndex - 1)}
                />
                <IconButton
                  className="text-white hover:bg-white/10 hover:text-white disabled:text-white/30"
                  disabled={activeIndex >= items.length - 1}
                  icon={<ChevronRight aria-hidden="true" className="size-5" />}
                  label="下一张"
                  onClick={() => onIndexChange(activeIndex + 1)}
                />
              </div>

              {items.length > 1 ? (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {items.map((item, itemIndex) => (
                    <button
                      key={item.key ?? `${item.src}-${itemIndex}`}
                      aria-label={`查看第 ${itemIndex + 1} 张图片`}
                      className={itemIndex === activeIndex
                        ? 'overflow-hidden rounded-[0.5rem] ring-2 ring-white/80'
                        : 'overflow-hidden rounded-[0.5rem] opacity-55 transition-opacity motion-reduce:transition-none sm:hover:opacity-100'}
                      type="button"
                      onClick={() => onIndexChange(itemIndex)}
                    >
                      <img
                        alt={item.alt}
                        className="h-[4rem] w-[3.1rem] object-cover sm:h-[4.5rem] sm:w-[3.5rem]"
                        src={item.src}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
