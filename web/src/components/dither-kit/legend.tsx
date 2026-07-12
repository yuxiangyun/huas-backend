/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 legend.tsx 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useCommonChart } from "./common-context"
import { cn } from "./lib"
import { rgb } from "./palette"

/** Series/slice legend. With `isClickable`, each entry toggles its selection.
 * Works in every chart family via the shared common context. */
export function Legend({
  isClickable = false,
  align = "right",
}: {
  isClickable?: boolean
  align?: "left" | "center" | "right"
}) {
  const chart = useCommonChart()

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 flex flex-wrap gap-3 px-1",
        align === "right" && "justify-end",
        align === "center" && "justify-center",
        align === "left" && "justify-start"
      )}
    >
      {chart.names.map((name) => {
        const seed = chart.seedOf(name)
        const emphasis = chart.selectedDataKey ?? chart.focusDataKey
        const dimmed = emphasis !== null && emphasis !== name
        return (
          <button
            key={name}
            type="button"
            disabled={!isClickable}
            onClick={() =>
              chart.selectDataKey(chart.selectedDataKey === name ? null : name)
            }
            // Hovering an entry spotlights its series so overlapping layers
            // (e.g. two meshed radar polygons) can be told apart at a glance.
            onPointerEnter={() => chart.setFocusDataKey(name)}
            onPointerLeave={() => chart.setFocusDataKey(null)}
            onFocus={() => chart.setFocusDataKey(name)}
            onBlur={() => chart.setFocusDataKey(null)}
            className={cn(
              "flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-opacity",
              isClickable &&
                "pointer-events-auto cursor-pointer hover:text-foreground",
              dimmed && "opacity-40"
            )}
          >
            <span
              className="size-2 rounded-[1px]"
              style={{ backgroundColor: rgb(seed.fill) }}
            />
            {chart.labelOf(name)}
          </button>
        )
      })}
    </div>
  )
}

Legend.chartLayer = "dom" as const
