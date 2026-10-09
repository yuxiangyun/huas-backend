import { defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

export interface TimeSeries {
  id: string
  label: string
  color?: string
  values: readonly { date: string; value: number }[]
}

interface TimeSeriesChartProps {
  series: readonly TimeSeries[]
  ariaLabel: string
  height?: number
}

const palette = ['var(--accent)', 'var(--foreground)', 'color-mix(in oklab, var(--warning) 65%, var(--foreground))']
const countFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })

/** Daily counts retain a zero baseline and integer ticks, including an all-zero range. */
function countAxis(maximum: number) {
  const roughStep = Math.max(1, maximum / 4)
  const magnitude = 10 ** Math.floor(Math.log10(roughStep))
  const step = Math.ceil(roughStep / magnitude) * magnitude
  const upper = Math.max(1, Math.ceil(maximum / step) * step)
  return { upper, ticks: Array.from({ length: upper / step + 1 }, (_, index) => index * step) }
}

export function TimeSeriesChart({ series, ariaLabel, height = 240 }: TimeSeriesChartProps) {
  const definition = useMemo(() => {
    const maximum = series.reduce((highest, item) => item.values.reduce(
      (value, point) => Math.max(value, point.value), highest,
    ), 0)
    const { upper, ticks } = countAxis(maximum)

    return defineChart({
      marks: series.map((item, index) => lineY(item.values, {
        id: item.id,
        x: 'date',
        y: 'value',
        z: () => item.id,
        stroke: item.color ?? palette[index % palette.length],
        strokeWidth: 2,
        points: item.values.length === 1,
      })),
      scales: {
        x: {
          scale: scalePoint,
          axis: {
            line: false,
            ticks: { spacing: 72, line: false, padding: 10, format: (date) => date.slice(5).replace('-', '/') },
            tickLabels: { fontSize: 12, thin: { minGap: 16, priority: 'ends' } },
          },
        },
        y: {
          scale: scaleLinear().domain([0, upper]),
          grid: { strokeWidth: 1, strokeOpacity: 0.6 },
          axis: {
            line: false,
            ticks: { values: ticks, line: false, padding: 8, format: (value) => countFormat.format(value) },
            tickLabels: { fontSize: 12 },
          },
        },
      },
      margin: { top: 12, right: 24, bottom: 34, left: Math.max(48, countFormat.format(upper).length * 7 + 16) },
      theme: {
        foreground: 'var(--foreground)',
        muted: 'var(--muted)',
        grid: 'var(--separator)',
        background: 'var(--surface)',
      },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      keyboard: true,
      svgAnimation: false,
      tooltip: {
        use: tooltip,
        motion: false,
        content: (points) => ({
          title: points[0]?.datum.date,
          rows: points.map((point) => {
            const index = series.findIndex((item) => item.id === point.markId)
            const item = series[index]
            return {
              label: item?.label ?? point.markId,
              value: countFormat.format(point.datum.value),
              color: item?.color ?? palette[Math.max(0, index) % palette.length],
            }
          }),
        }),
      },
    })
  }, [series])

  return (
    <div className="min-w-0 w-full">
      {series.length > 1 ? (
        <ul aria-label="图例" className="mb-2 flex flex-wrap justify-end gap-x-5 gap-y-2 text-sm text-muted">
          {series.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: item.color ?? palette[index % palette.length] }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <Chart definition={definition} height={height} initialWidth={288} ariaLabel={ariaLabel} />
    </div>
  )
}
