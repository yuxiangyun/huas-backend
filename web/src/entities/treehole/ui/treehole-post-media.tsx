/**
 * [INPUT]: 依赖 Treehole 私有图片元数据、Bearer 媒体原语与浏览器视口/原生滚动能力
 * [OUTPUT]: 对外提供首页首图 TreeholePrimaryMedia 与只挂载当前/相邻图的详情滑动多图 TreeholeMediaCarousel，详情纵向手势交给外层页面
 * [POS]: entities/treehole 的鉴权媒体展示边界，首页延迟首图请求且详情用滑动窗口约束一次最多三个 Blob 请求，轮播只允许横向滚动
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, UIEvent } from 'react';
import type { TreeholeImage } from '@/entities/treehole/model/treehole-types';
import { cn } from '@/shared/lib/cn';
import { IconButton } from '@/shared/ui/icon-button';
import { PrivateMediaImage } from '@/shared/ui/private-media-image';

const MIN_INSTAGRAM_RATIO = 4 / 5;
const MAX_INSTAGRAM_RATIO = 1.91;

function mediaStageStyle(image: TreeholeImage | undefined): CSSProperties {
  const sourceRatio = image?.width && image.height ? image.width / image.height : MIN_INSTAGRAM_RATIO;
  const aspectRatio = Math.min(MAX_INSTAGRAM_RATIO, Math.max(MIN_INSTAGRAM_RATIO, sourceRatio));
  return { aspectRatio: String(aspectRatio), maxHeight: 'min(72dvh, 42rem)' };
}

function useNearViewport(eager: boolean) {
  const targetRef = useRef<HTMLButtonElement | null>(null);
  const [nearViewport, setNearViewport] = useState(eager);

  useEffect(() => {
    if (eager) setNearViewport(true);
  }, [eager]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setNearViewport(entry.isIntersecting);
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [eager]);

  return { nearViewport, targetRef };
}

interface TreeholePrimaryMediaProps {
  image: TreeholeImage;
  imageCount: number;
  alt: string;
  eager?: boolean;
  onOpen: () => void;
}

export function TreeholePrimaryMedia({
  image,
  imageCount,
  alt,
  eager = false,
  onOpen,
}: TreeholePrimaryMediaProps) {
  const { nearViewport, targetRef } = useNearViewport(eager);

  return (
    <button
      ref={targetRef}
      aria-label={`${alt}${imageCount > 1 ? `，共 ${imageCount} 张` : ''}`}
      className="relative grid w-full place-items-center overflow-hidden bg-white"
      style={mediaStageStyle(image)}
      type="button"
      onClick={onOpen}
    >
      {nearViewport ? (
        <PrivateMediaImage
          alt={alt}
          className="size-full object-contain"
          decoding="async"
          fetchPriority={eager ? 'high' : 'auto'}
          height={image.height}
          src={image.url}
          width={image.width}
        />
      ) : (
        <span className="size-full animate-pulse bg-shell-strong" aria-label="图片等待加载" />
      )}
      {imageCount > 1 ? (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
          1/{imageCount}
        </span>
      ) : null}
    </button>
  );
}

interface TreeholeMediaCarouselProps {
  images: readonly TreeholeImage[];
  alt: string;
  onOpenImage: (index: number) => void;
}

export function TreeholeMediaCarousel({ images, alt, onOpenImage }: TreeholeMediaCarouselProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const firstImageUrl = images[0]?.url ?? '';

  useEffect(() => {
    setActiveIndex(0);
    viewportRef.current?.scrollTo({ left: 0 });
  }, [firstImageUrl]);

  const goTo = (index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextIndex = Math.min(images.length - 1, Math.max(0, index));
    viewport.scrollTo({ left: viewport.clientWidth * nextIndex, behavior: 'smooth' });
    setActiveIndex(nextIndex);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    if (viewport.clientWidth <= 0) return;
    const nextIndex = Math.min(
      images.length - 1,
      Math.max(0, Math.round(viewport.scrollLeft / viewport.clientWidth))
    );
    setActiveIndex(nextIndex);
  };

  if (images.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="relative overflow-hidden bg-white" style={mediaStageStyle(images[0])}>
        <div
          ref={viewportRef}
          aria-label={`帖子图片，共 ${images.length} 张`}
          className="flex size-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth"
          onScroll={handleScroll}
        >
          {images.map((image, imageIndex) => {
            const shouldLoad = Math.abs(imageIndex - activeIndex) <= 1;
            return (
            <button
              key={image.url}
              aria-label={`查看第 ${imageIndex + 1} 张图片的全屏预览`}
              className="grid size-full min-w-full snap-center place-items-center"
              type="button"
              onClick={() => onOpenImage(imageIndex)}
            >
              {shouldLoad ? (
                <PrivateMediaImage
                  alt={`${alt} · 第 ${imageIndex + 1} 张`}
                  className="size-full object-contain"
                  decoding="async"
                  draggable={false}
                  height={image.height}
                  src={image.url}
                  width={image.width}
                />
              ) : (
                <span className="size-full animate-pulse bg-shell-strong" aria-label="图片等待加载" />
              )}
            </button>
            );
          })}
        </div>

        {images.length > 1 ? (
          <>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">
              {activeIndex + 1}/{images.length}
            </span>
            <IconButton
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 bg-black/55 text-white hover:bg-black/75 sm:inline-flex"
              disabled={activeIndex === 0}
              icon={<ChevronLeft aria-hidden="true" className="size-5" />}
              label="上一张"
              size="sm"
              onClick={() => goTo(activeIndex - 1)}
            />
            <IconButton
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 bg-black/55 text-white hover:bg-black/75 sm:inline-flex"
              disabled={activeIndex === images.length - 1}
              icon={<ChevronRight aria-hidden="true" className="size-5" />}
              label="下一张"
              size="sm"
              onClick={() => goTo(activeIndex + 1)}
            />
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex justify-center gap-1.5" aria-label="图片位置">
          {images.map((image, imageIndex) => (
            <button
              key={image.url}
              aria-label={`切换到第 ${imageIndex + 1} 张图片`}
              aria-current={imageIndex === activeIndex ? 'true' : undefined}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                imageIndex === activeIndex ? 'bg-ink' : 'bg-line'
              )}
              type="button"
              onClick={() => goTo(imageIndex)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
