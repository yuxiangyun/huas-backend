/**
 * [INPUT]: 依赖 React 的 children 类型
 * [OUTPUT]: 对外提供 SocialPageTitle，为普通用户四个主 Tab 提供统一中文楷体字标
 * [POS]: shared/ui 的 Social 标题视觉原语，只约束字形、字号与字距，不持有页面布局或路由语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ReactNode } from 'react';

interface SocialPageTitleProps {
  children: ReactNode;
}

export function SocialPageTitle({ children }: SocialPageTitleProps) {
  return (
    <span
      className="inline-block text-[1.7rem] font-semibold leading-none tracking-[-0.02em]"
      style={{ fontFamily: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif CJK SC", serif' }}
    >
      {children}
    </span>
  );
}
