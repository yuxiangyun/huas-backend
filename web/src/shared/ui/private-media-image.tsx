/**
 * [INPUT]: 依赖普通 Bearer/后台 Cookie 二进制请求、React 生命周期与受保护媒体路径
 * [OUTPUT]: 对外提供 PrivateMediaImage、近视口 DeferredPrivateMediaImage 与会话缓存清理动作，以 URL+认证模式+身份代次复用有界 Blob
 * [POS]: shared/ui 的私有媒体适配原语，以身份隔离的 10 分钟/24MB 内存 LRU 保护回滚浏览，并让长聊天仅在图片接近视口时发起鉴权请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CSSProperties, ImgHTMLAttributes, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useAuthStore } from '@/entities/auth/model/auth-store';
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
  sizeBytes: number;
  lastUsedAt: number;
}

const mediaCache = new Map<string, MediaCacheEntry>();
const MEDIA_CACHE_TTL_MS = 10 * 60_000;
const MEDIA_CACHE_MAX_BYTES = 24 * 1024 * 1024;
let bearerScopeToken: string | null | undefined;
let bearerScopeVersion = 0;

function bearerCacheScope(token: string | null) {
  if (bearerScopeToken !== token) {
    bearerScopeToken = token;
    bearerScopeVersion += 1;
  }
  return `session-${bearerScopeVersion}`;
}

function removeEntry(cacheKey: string, entry: MediaCacheEntry) {
  entry.controller.abort();
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  mediaCache.delete(cacheKey);
}

function pruneMediaCache(now = Date.now()) {
  for (const [cacheKey, entry] of mediaCache) {
    if (entry.references === 0 && now - entry.lastUsedAt >= MEDIA_CACHE_TTL_MS) {
      removeEntry(cacheKey, entry);
    }
  }

  let cachedBytes = 0;
  const idleEntries: Array<[string, MediaCacheEntry]> = [];
  for (const item of mediaCache) {
    cachedBytes += item[1].sizeBytes;
    if (item[1].references === 0 && item[1].objectUrl) idleEntries.push(item);
  }
  if (cachedBytes <= MEDIA_CACHE_MAX_BYTES) return;

  idleEntries.sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt);
  for (const [cacheKey, entry] of idleEntries) {
    removeEntry(cacheKey, entry);
    cachedBytes -= entry.sizeBytes;
    if (cachedBytes <= MEDIA_CACHE_MAX_BYTES) break;
  }
}

export function clearPrivateMediaCache(authMode?: 'bearer' | 'admin') {
  for (const [cacheKey, entry] of mediaCache) {
    if (!authMode || cacheKey.startsWith(`${authMode}:`)) removeEntry(cacheKey, entry);
  }
}

function buildMediaCacheKey(src: string, authMode: 'bearer' | 'admin', authScope: string | null) {
  return `${authMode}:${authMode === 'bearer' ? authScope ?? 'anonymous' : 'cookie-session'}:${src}`;
}

function acquireMedia(
  src: string,
  authMode: 'bearer' | 'admin',
  authScope: string | null,
) {
  const now = Date.now();
  pruneMediaCache(now);
  const cacheKey = buildMediaCacheKey(src, authMode, authScope);
  let entry = mediaCache.get(cacheKey);
  if (!entry) {
    const controller = new AbortController();
    entry = {
      controller,
      objectUrl: null,
      references: 0,
      sizeBytes: 0,
      lastUsedAt: now,
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
          current.sizeBytes = blob.size;
          current.lastUsedAt = Date.now();
          pruneMediaCache();
          return objectUrl;
        })
        .catch((error) => {
          const current = mediaCache.get(cacheKey);
          if (current?.controller === controller) removeEntry(cacheKey, current);
          throw error;
        }),
    };
    mediaCache.set(cacheKey, entry);
  }
  entry.references += 1;
  entry.lastUsedAt = now;

  return {
    promise: entry.promise,
    release: () => {
      const current = mediaCache.get(cacheKey);
      if (!current) return;
      current.references = Math.max(0, current.references - 1);
      if (current.references > 0) return;
      current.lastUsedAt = Date.now();
      if (!current.objectUrl) {
        removeEntry(cacheKey, current);
        return;
      }
      pruneMediaCache();
    },
  };
}

export function PrivateMediaImage({ src, alt, className, authMode = 'bearer', ...props }: PrivateMediaImageProps) {
  const authToken = useAuthStore((state) => state.token);
  const authScope = authMode === 'bearer' ? bearerCacheScope(authToken) : null;
  const cacheKey = buildMediaCacheKey(src, authMode, authScope);
  const [mediaState, setMediaState] = useState<{
    cacheKey: string;
    failed: boolean;
    objectUrl: string | null;
  }>(() => ({ cacheKey, failed: false, objectUrl: null }));
  const currentState = mediaState.cacheKey === cacheKey
    ? mediaState
    : { cacheKey, failed: false, objectUrl: null };

  useEffect(() => {
    let active = true;
    setMediaState({ cacheKey, failed: false, objectUrl: null });
    const media = acquireMedia(src, authMode, authScope);

    void media.promise
      .then((url) => {
        if (active) setMediaState({ cacheKey, failed: false, objectUrl: url });
      })
      .catch(() => {
        if (active) setMediaState({ cacheKey, failed: true, objectUrl: null });
      });

    return () => {
      active = false;
      media.release();
    };
  }, [authMode, authScope, cacheKey, src]);

  if (!currentState.objectUrl) {
    return (
      <span className={cn('grid min-h-24 place-items-center bg-shell-strong text-muted', className)} aria-label={currentState.failed ? '图片加载失败' : '图片加载中'}>
        {currentState.failed ? <ImageOff aria-hidden="true" className="size-5" /> : <span className="size-5 animate-pulse rounded bg-line" />}
      </span>
    );
  }

  return <img alt={alt} className={className} src={currentState.objectUrl} {...props} />;
}

interface DeferredPrivateMediaImageProps extends PrivateMediaImageProps {
  containerStyle?: CSSProperties;
  imageClassName?: string;
  rootRef?: RefObject<Element | null>;
  rootMargin?: string;
}

export function DeferredPrivateMediaImage({
  className,
  containerStyle,
  imageClassName = 'size-full object-cover',
  rootRef,
  rootMargin = '480px 0px',
  ...props
}: DeferredPrivateMediaImageProps) {
  const targetRef = useRef<HTMLSpanElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setNearViewport(Boolean(entries[0]?.isIntersecting));
      },
      { root: rootRef?.current ?? null, rootMargin },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [rootMargin, rootRef]);

  return (
    <span ref={targetRef} className={cn('block overflow-hidden bg-shell-strong', className)} style={containerStyle}>
      {nearViewport ? (
        <PrivateMediaImage {...props} className={imageClassName} />
      ) : (
        <span className="block size-full min-h-24 animate-pulse bg-shell-strong" aria-label="图片等待加载" />
      )}
    </span>
  );
}
