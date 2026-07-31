/**
 * [INPUT]: 依赖 clsx 条件类名与 tailwind-merge 冲突消解能力
 * [OUTPUT]: 对外提供 cn，生成确定性的 Tailwind className
 * [POS]: shared/lib 的样式组合基础函数，被所有可配置 UI 原语复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
