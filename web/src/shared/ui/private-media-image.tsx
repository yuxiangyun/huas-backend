/**
 * [INPUT]: 依赖普通 Bearer/后台 Cookie 二进制请求、React 生命周期与受保护媒体路径
 * [OUTPUT]: 对外提供 PrivateMediaImage，以 URL+认证模式去重请求并回收共享 Blob URL
 * [POS]: shared/ui 的私有媒体适配原语，统一参与者与管理员不能直接写入 img src 的鉴权资源
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ImgHTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { adminSessionFetch, authenticatedFetch } from '@/shared/api/http-client';
import { cn } from '@/shared/lib/cn';

interface PrivateMediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  authMode?: 'bearer' | 'admin';
}

interface MediaCacheEntry {
  controller: AbortController;
  objectUrl: string | null;
  promise: Promise<string>;
  references: number;
}

const mediaCache = new Map<string, MediaCacheEntry>();

function acquireMedia(src: string, authMode: 'bearer' | 'admin') {
  const cacheKey = `${authMode}:${src}`;
  let entry = mediaCache.get(cacheKey);
  if (!entry) {
    const controller = new AbortController();
    entry = {
      controller,
      objectUrl: null,
      references: 0,
      promise: (authMode === 'admin' ? adminSessionFetch : authenticatedFetch)(src, { signal: controller.signal })
        .then((response) => response.blob())
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          const current = mediaCache.get(cacheKey);
          if (!current || current.controller !== controller || controller.signal.aborted) {
            URL.revokeObjectURL(objectUrl);
            throw new DOMException('媒体请求已取消', 'AbortError');
          }
          current.objectUrl = objectUrl;
          return objectUrl;
        }),
    };
    mediaCache.set(cacheKey, entry);
  }
  entry.references += 1;

  return {
    promise: entry.promise,
    release: () => {
      const current = mediaCache.get(cacheKey);
      if (!current) return;
      current.references = Math.max(0, current.references - 1);
      if (current.references > 0) return;
      current.controller.abort();
      if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
      mediaCache.delete(cacheKey);
    },
  };
}

export function PrivateMediaImage({ src, alt, className, authMode = 'bearer', ...props }: PrivateMediaImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setObjectUrl(null);
    const media = acquireMedia(src, authMode);

    void media.promise
      .then((url) => {
        if (active) setObjectUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      media.release();
    };
  }, [authMode, src]);

  if (!objectUrl) {
    return (
      <span className={cn('grid min-h-24 place-items-center bg-shell-strong text-muted', className)} aria-label={failed ? '图片加载失败' : '图片加载中'}>
        {failed ? <ImageOff aria-hidden="true" className="size-5" /> : <span className="size-5 animate-pulse rounded bg-line" />}
      </span>
    );
  }

  return <img alt={alt} className={className} src={objectUrl} {...props} />;
}
