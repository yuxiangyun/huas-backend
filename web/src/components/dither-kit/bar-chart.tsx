/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 bar-chart.tsx 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { BarCanvas } from "./bar-canvas"
import { type CartesianChartProps, CartesianRoot } from "./cartesian-root"

type Row = Record<string, unknown>

/** Composable dither **bar** chart — `<Bar>` series, grouped or stacked. */
export function BarChart<TData extends Row>(props: CartesianChartProps<TData>) {
  return <CartesianRoot chartType="bar" Canvas={BarCanvas} {...props} />
}
