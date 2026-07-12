/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 y-axis.tsx 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useChartPart } from "./chart-context"

export function YAxis({
  tickFormatter,
  tickCount = 4,
  tickMargin = 8,
}: {
  tickFormatter?: (value: number) => string
  tickCount?: number
  tickMargin?: number
}) {
  const ctx = useChartPart("YAxis")
  if (!ctx.ready) return null

  return (
    <g className="fill-current font-mono text-[10px] text-muted-foreground">
      {ctx.y.ticks(tickCount).map((t) => (
        <text
          key={t}
          x={-tickMargin}
          y={ctx.y(t)}
          textAnchor="end"
          dominantBaseline="central"
          fill="currentColor"
        >
          {tickFormatter ? tickFormatter(t) : t}
        </text>
      ))}
    </g>
  )
}
