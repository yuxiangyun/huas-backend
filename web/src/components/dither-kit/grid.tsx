/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 grid.tsx 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useChartPart } from "./chart-context"

export function Grid({
  horizontal = true,
  vertical = false,
  strokeDasharray = "3 3",
}: {
  horizontal?: boolean
  vertical?: boolean
  strokeDasharray?: string
}) {
  const ctx = useChartPart("Grid")
  if (!ctx.ready) return null
  const { width } = ctx.plot

  return (
    <g className="stroke-border" strokeDasharray={strokeDasharray}>
      {horizontal &&
        ctx.y
          .ticks(4)
          .map((t) => (
            <line
              key={`h-${t}`}
              x1={0}
              x2={width}
              y1={ctx.y(t)}
              y2={ctx.y(t)}
            />
          ))}
      {vertical &&
        ctx.data.map((_, i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: index is the stable x position
            key={`v-${i}`}
            x1={ctx.xCenter(i) ?? 0}
            x2={ctx.xCenter(i) ?? 0}
            y1={0}
            y2={ctx.plot.height}
          />
        ))}
    </g>
  )
}

// Render beneath the dither canvas so grid lines sit behind the fill.
Grid.chartLayer = "back" as const
