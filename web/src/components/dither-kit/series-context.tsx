/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 series-context.tsx 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { createContext, use } from "react"
import type { Seed } from "./palette"

export type SeriesContextValue = {
  dataKey: string
  seed: Seed
  dimmed: boolean
}

export const SeriesContext = createContext<SeriesContextValue | null>(null)

/** Boundary guard for series-scoped markers (`<Dot>`, `<ActiveDot>`). */
export function useSeries(part: string) {
  const ctx = use(SeriesContext)
  if (!ctx) {
    throw new Error(
      `<${part} /> must be rendered inside a series (e.g. <Area />).`
    )
  }
  return ctx
}
