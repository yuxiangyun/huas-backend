import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

type OrnamentTone = 'amber' | 'blue' | 'mint' | 'rose' | 'slate';
type BubbleSize = 'sm' | 'md' | 'lg';

const bubbleToneClasses: Record<OrnamentTone, string> = {
  amber: 'bg-[#fff3d8] text-[#8b5a11] ring-[#efd7a0]',
  blue: 'bg-[#deebff] text-[#1f4fa8] ring-[#bfd4ff]',
  mint: 'bg-[#ddf5eb] text-[#24634a] ring-[#bfe3d3]',
  rose: 'bg-[#f7dfe8] text-[#9d4668] ring-[#eab7cb]',
  slate: 'bg-[#edf1f5] text-[#37414b] ring-[#d6dde6]',
};

const bubbleSizeClasses: Record<BubbleSize, string> = {
  sm: 'size-9 text-[1rem]',
  md: 'size-11 text-[1.1rem]',
  lg: 'size-14 text-[1.35rem]',
};

const ornamentToneClasses: Record<OrnamentTone, string> = {
  amber: 'bg-[linear-gradient(145deg,rgba(255,246,224,0.92),rgba(255,236,193,0.62))]',
  blue: 'bg-[linear-gradient(145deg,rgba(230,240,255,0.92),rgba(206,224,255,0.62))]',
  mint: 'bg-[linear-gradient(145deg,rgba(230,248,240,0.92),rgba(205,237,223,0.62))]',
  rose: 'bg-[linear-gradient(145deg,rgba(255,237,244,0.92),rgba(248,214,228,0.62))]',
  slate: 'bg-[linear-gradient(145deg,rgba(244,247,250,0.94),rgba(228,235,241,0.66))]',
};

const ornamentGlowClasses: Record<OrnamentTone, string> = {
  amber: 'bg-[#f4d48f]/70',
  blue: 'bg-[#bfd6ff]/72',
  mint: 'bg-[#b8e4d0]/70',
  rose: 'bg-[#efbfd2]/70',
  slate: 'bg-[#d9e1ea]/76',
};

interface OrnamentBadge {
  icon: ReactNode;
  label: string;
  tone?: OrnamentTone;
}

export interface IconBubbleProps {
  icon: ReactNode;
  tone?: OrnamentTone;
  size?: BubbleSize;
  className?: string;
}

export function IconBubble({
  icon,
  tone = 'slate',
  size = 'md',
  className,
}: IconBubbleProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[1.1rem] ring-1 shadow-[0_10px_24px_rgba(15,23,42,0.08)]',
        bubbleToneClasses[tone],
        bubbleSizeClasses[size],
        className
      )}
    >
      {icon}
    </span>
  );
}

export interface PageOrnamentProps {
  label: string;
  title: string;
  icon: ReactNode;
  tone?: OrnamentTone;
  badges?: OrnamentBadge[];
  compact?: boolean;
  className?: string;
}

export function PageOrnament({
  label,
  title,
  icon,
  tone = 'slate',
  badges = [],
  compact = false,
  className,
}: PageOrnamentProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden border border-white/78 shadow-[0_22px_48px_rgba(15,23,42,0.09)] backdrop-blur-[24px] max-sm:shadow-[0_10px_22px_rgba(15,23,42,0.08)] max-sm:backdrop-blur-none',
        ornamentToneClasses[tone],
        compact ? 'min-w-0 rounded-[1.35rem] p-3 sm:min-w-[10.5rem] sm:rounded-[1.5rem] sm:p-3.5' : 'rounded-[1.7rem] p-4',
        className
      )}
    >
      <div className="absolute inset-0 hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.42),rgba(255,255,255,0.02))] sm:block" />
      <div className="absolute -right-7 -top-7 hidden size-24 rounded-full bg-white/58 blur-2xl sm:block" />
      <div
        className={cn(
          'absolute -left-7 bottom-0 hidden size-20 rounded-full blur-3xl sm:block',
          ornamentGlowClasses[tone]
        )}
      />
      <div className="absolute bottom-3 right-3 hidden h-7 w-12 rounded-full border border-white/62 sm:bottom-4 sm:right-4 sm:block sm:h-8 sm:w-14" />
      <div className="absolute bottom-6 right-7 hidden size-2 rounded-full bg-white/88 sm:bottom-7 sm:right-8 sm:block" />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[0.8rem] font-medium tracking-[0.1em] text-muted">
              {label}
            </p>
            <p className={cn('font-semibold tracking-[-0.04em] text-ink', compact ? 'text-sm' : 'text-base')}>
              {title}
            </p>
          </div>
          <IconBubble
            icon={icon}
            size={compact ? 'md' : 'lg'}
            tone={tone}
          />
        </div>

        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {badges.slice(0, compact ? 2 : 3).map((badge) => (
              <span
                key={badge.label}
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-pill bg-white/68 px-2.5 py-1.5 text-[0.8rem] font-medium text-muted ring-1 ring-white/66"
              >
                <IconBubble
                  className="size-5 rounded-[0.7rem] text-[0.8rem] shadow-none"
                  icon={badge.icon}
                  size="sm"
                  tone={badge.tone ?? tone}
                />
                <span className="truncate">{badge.label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
