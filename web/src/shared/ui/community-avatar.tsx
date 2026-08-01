/**
 * [INPUT]: 依赖媒体 URL 构造、cn 与按资源地址隔离的 React 图片失败状态
 * [OUTPUT]: 对外提供 CommunityAvatar，可无旧资源闪帧地显示社区头像、通用用户占位或按领域隐藏
 * [POS]: shared/ui 的社区头像视觉原语，不决定昵称或内容归属等业务语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { buildMediaUrl } from '@/shared/api/media';
import { cn } from '@/shared/lib/cn';

interface CommunityAvatarProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackLabel?: string | null;
}

export function CommunityAvatar({
  src = null,
  alt = '社区头像',
  className,
  fallbackLabel = '',
}: CommunityAvatarProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const displaySrc = src && brokenSrc !== src ? buildMediaUrl(src) : '';

  if (!displaySrc && fallbackLabel === null) return null;

  return (
    <div className={cn(
      'grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-shell-strong ring-1 ring-line',
      className
    )}
    >
      {displaySrc ? (
        <img
          alt={alt}
          className="size-full object-cover"
          src={displaySrc}
          onError={() => setBrokenSrc(src)}
        />
      ) : (
        fallbackLabel
          ? <span className="text-sm font-semibold text-muted">{fallbackLabel}</span>
          : <UserRound aria-hidden="true" className="size-1/2 text-muted" />
      )}
    </div>
  );
}
