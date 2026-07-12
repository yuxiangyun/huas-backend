/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 lib.ts 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** Tailwind-aware className combiner — local copy so the chart pack is
 * self-contained and portable as a registry. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
