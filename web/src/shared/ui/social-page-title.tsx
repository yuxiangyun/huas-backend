/**
 * [INPUT]: 依赖 React 的 children 类型，依赖本地 huas-community-logo.png 由 Vite 生成内容哈希 URL
 * [OUTPUT]: 对外提供 SocialPageTitle，为普通用户主 Tab 提供中文楷体字标或统一品牌图片字标
 * [POS]: shared/ui 的 Social 标题视觉原语，收敛文字/品牌资产的尺寸、完整裁切与信息流左边界校准，不持有路由语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ReactNode } from 'react';
import brandLogoUrl from './huas-community-logo.png';

interface SocialPageTitleProps {
  children: ReactNode;
  variant?: 'text' | 'brand';
}

export function SocialPageTitle({ children, variant = 'text' }: SocialPageTitleProps) {
  if (variant === 'brand') {
    const label = typeof children === 'string' ? children : '文理社区';
    return (
      <span
        aria-label={label}
        className="relative inline-flex h-11 w-[10.5rem] items-center overflow-hidden sm:h-12 sm:w-[12rem]"
        role="img"
      >
        <img
          alt={label}
          className="absolute left-[40%] top-[64%] w-[145%] max-w-none -translate-x-1/2 -translate-y-1/2"
          decoding="async"
          src={brandLogoUrl}
        />
      </span>
    );
  }

  return (
    <span
      className="inline-block text-[1.7rem] font-semibold leading-none tracking-[-0.02em]"
      style={{ fontFamily: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", serif' }}
    >
      {children}
    </span>
  );
}
