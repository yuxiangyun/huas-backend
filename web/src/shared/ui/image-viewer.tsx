/**
 * [INPUT]: 依赖 document.body Portal、motion 动效、Lucide 图标、图片集合、可选媒体渲染器/缩略图窗口与键盘/触摸导航动作
 * [OUTPUT]: 对外提供 ImageViewer，以可限制邻近缩略图挂载的全屏查看器呈现公开或私有媒体
 * [POS]: shared/ui 的顶层媒体查看原语，通过渲染插槽兼容鉴权媒体，并允许私有集合避免一次请求全部缩略图
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode, TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/shared/ui/icon-button';

export interface ImageViewerItem {
  src: string;
  alt: string;
  key?: string;
}

export interface ImageViewerRenderContext {
  item: ImageViewerItem;
  className: string;
  thumbnail: boolean;
}

interface ImageViewerProps {
  index: number | null;
  items: readonly ImageViewerItem[];
  onClose: () => void;
  onIndexChange: (index: number) => void;
  renderImage?: (context: ImageViewerRenderContext) => ReactNode;
  thumbnailWindow?: number;
}

export function ImageViewer({
  index,
  items,
  onClose,
  onIndexChange,
  renderImage,
  thumbnailWindow = Number.POSITIVE_INFINITY,
}: ImageViewerProps) {
  const isOpen = index !== null && items.length > 0;
  const activeIndex = index === null ? 0 : Math.min(Math.max(index, 0), items.length - 1);
  const activeItem = items[activeIndex];
  const prefersReducedMotion = useReducedMotion();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
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

  const showImage = (item: ImageViewerItem, className: string, thumbnail: boolean) => (
    renderImage
      ? renderImage({ item, className, thumbnail })
      : <img alt={item.alt} className={className} src={item.src} />
  );

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0 && activeIndex < items.length - 1) onIndexChange(activeIndex + 1);
    if (deltaX > 0 && activeIndex > 0) onIndexChange(activeIndex - 1);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && activeItem ? (
        <div className="fixed inset-0 z-[100] bg-black">
          <motion.button
            aria-label="关闭图片预览"
            className="absolute inset-0 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
            type="button"
            onClick={onClose}
          />

          <motion.div
            className="absolute inset-0 mx-auto flex w-full max-w-[96rem] transform-gpu flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6"
            initial={panelMotion.initial}
            animate={{ y: 0, opacity: 1 }}
            exit={panelMotion.exit}
            style={{ willChange: 'transform, opacity' }}
            transition={panelTransition}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 text-white">
              <div className="flex h-10 shrink-0 items-center justify-between gap-3">
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
                  {activeIndex + 1} / {items.length}
                </span>
                <IconButton
                  className="rounded-full bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white"
                  icon={<X aria-hidden="true" className="size-5" />}
                  label="关闭图片预览"
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                />
              </div>

              <div
                className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden"
                onTouchEnd={handleTouchEnd}
                onTouchStart={handleTouchStart}
              >
                {showImage(activeItem, 'max-h-full max-w-full object-contain', false)}
                <IconButton
                  className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/45 text-white shadow-none hover:bg-black/70 hover:text-white disabled:text-white/30 sm:inline-flex"
                  disabled={activeIndex === 0}
                  icon={<ChevronLeft aria-hidden="true" className="size-5" />}
                  label="上一张"
                  onClick={() => onIndexChange(activeIndex - 1)}
                />
                <IconButton
                  className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/45 text-white shadow-none hover:bg-black/70 hover:text-white disabled:text-white/30 sm:inline-flex"
                  disabled={activeIndex >= items.length - 1}
                  icon={<ChevronRight aria-hidden="true" className="size-5" />}
                  label="下一张"
                  onClick={() => onIndexChange(activeIndex + 1)}
                />
              </div>

              {items.length > 1 ? (
                <div className="mx-auto flex max-w-full justify-start gap-2.5 overflow-x-auto px-0.5 pb-1">
                  {items.map((item, itemIndex) => (
                    <button
                      key={item.key ?? `${item.src}-${itemIndex}`}
                      aria-label={`查看第 ${itemIndex + 1} 张图片`}
                      className={itemIndex === activeIndex
                        ? 'shrink-0 overflow-hidden rounded-[0.625rem] ring-2 ring-white'
                        : 'shrink-0 overflow-hidden rounded-[0.625rem] opacity-45 transition-opacity motion-reduce:transition-none sm:hover:opacity-90'}
                      type="button"
                      onClick={() => onIndexChange(itemIndex)}
                    >
                      {Math.abs(itemIndex - activeIndex) <= thumbnailWindow
                        ? showImage(item, 'h-[4rem] w-[3.1rem] object-cover sm:h-[4.5rem] sm:w-[3.5rem]', true)
                        : <span className="block h-[4rem] w-[3.1rem] bg-white/10 sm:h-[4.5rem] sm:w-[3.5rem]" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
