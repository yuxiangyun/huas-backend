/**
 * [INPUT]: 依赖 React、d3/motion 与 dither-kit 同目录绘制原语
 * [OUTPUT]: 提供 use-chart-dimensions.ts 对应的图表组合或底层绘制能力
 * [POS]: components/dither-kit 的第三方源码组件，由公开 chart 入口间接消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useLayoutEffect, useRef, useState } from "react"

export type Dimensions = { width: number; height: number }

/**
 * Tracks an element's CSS pixel size via {@link ResizeObserver}. Uses
 * `clientWidth`/`clientHeight` (the layout size) rather than
 * `getBoundingClientRect()` so a parent `layoutId` morph — which scales the
 * element via a transform — can't trick the chart into measuring a scaled size
 * and locking its canvas to it.
 */
export function useChartDimensions<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Dimensions>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const width = Math.max(0, el.clientWidth)
      const height = Math.max(0, el.clientHeight)
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev // guard against repeat fires
          : { width, height }
      )
    }

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  return { ref, size }
}
