import { useEffect, useMemo, useState } from 'react';
import { buildMediaUrl } from '@/shared/api/media';
import { cn } from '@/shared/lib/cn';

interface TreeholeAvatarProps {
  src?: string | null;
  alt?: string;
  className?: string;
}

export function TreeholeAvatar({
  src = null,
  alt = '树洞头像',
  className,
}: TreeholeAvatarProps) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const displaySrc = useMemo(
    () => (!broken && src ? buildMediaUrl(src) : ''),
    [broken, src]
  );

  return (
    <div className={cn(
      'grid size-10 shrink-0 place-items-center overflow-hidden rounded-[0.8rem] bg-shell-strong ring-1 ring-line',
      className
    )}
    >
      {displaySrc ? (
        <img
          alt={alt}
          className="size-full object-cover"
          src={displaySrc}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-sm font-semibold text-muted">匿</span>
      )}
    </div>
  );
}
