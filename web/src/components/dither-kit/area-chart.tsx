/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 area-chart.tsx 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { CartesianCanvas } from "./cartesian-canvas"
import { type CartesianChartProps, CartesianRoot } from "./cartesian-root"

type Row = Record<string, unknown>

/** Composable dither **area** chart. Compose `<Area>`, `<Grid>`, axes, … inside. */
export function AreaChart<TData extends Row>(
  props: CartesianChartProps<TData>
) {
  return <CartesianRoot chartType="area" Canvas={CartesianCanvas} {...props} />
}

/** Composable dither **line** chart — `<Line>` series with a glow under the line. */
export function LineChart<TData extends Row>(
  props: CartesianChartProps<TData>
) {
  return <CartesianRoot chartType="line" Canvas={CartesianCanvas} {...props} />
}

export type AreaChartProps<TData extends Row> = CartesianChartProps<TData>
