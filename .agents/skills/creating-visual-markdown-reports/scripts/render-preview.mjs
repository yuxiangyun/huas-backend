/**
 * [INPUT]: 依赖 sharp 的 SVG 解码能力，以及已生成的本地 SVG 与临时 PNG 路径
 * [OUTPUT]: 对外提供命令行预览器，将 SVG 栅格化为仅用于视觉验收的 PNG
 * [POS]: 可视化报告 Skill 的视觉验收适配层，不参与最终报告交付
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import sharp from 'sharp'

function fail(message) {
  console.error(`render-preview: ${message}`)
  process.exit(1)
}

function readArgument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (!value) fail(`用法: node render-preview.mjs --input <diagram.svg> --output <preview.png>`)
  return resolve(value)
}

const inputPath = readArgument('--input')
const outputPath = readArgument('--output')
if (extname(inputPath) !== '.svg') fail('输入文件必须使用 .svg 扩展名')
if (extname(outputPath) !== '.png') fail('输出文件必须使用 .png 扩展名')

function mixHex(foreground, background, foregroundRatio) {
  const parse = (value) => {
    const match = value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu)
    if (!match) fail(`预览器只支持十六进制主题颜色: ${value}`)
    return match.slice(1).map((channel) => Number.parseInt(channel, 16))
  }
  const fg = parse(foreground)
  const bg = parse(background)
  const channels = fg.map((channel, index) => Math.round(channel * foregroundRatio + bg[index] * (1 - foregroundRatio)))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function inlineThemeVariables(source) {
  const rootStyle = source.match(/<svg[^>]*\sstyle="([^"]+)"/u)?.[1] ?? ''
  const theme = Object.fromEntries(
    [...rootStyle.matchAll(/--([a-z-]+):([^;]+)/gu)].map((match) => [match[1], match[2].trim()])
  )
  const bg = theme.bg ?? '#ffffff'
  const fg = theme.fg ?? '#27272a'
  const values = {
    bg,
    fg,
    line: theme.line ?? mixHex(fg, bg, 0.5),
    accent: theme.accent ?? mixHex(fg, bg, 0.85),
    muted: theme.muted ?? mixHex(fg, bg, 0.6),
    surface: theme.surface ?? mixHex(fg, bg, 0.03),
    border: theme.border ?? mixHex(fg, bg, 0.2),
    '_text': fg,
    '_text-sec': theme.muted ?? mixHex(fg, bg, 0.6),
    '_text-muted': theme.muted ?? mixHex(fg, bg, 0.4),
    '_text-faint': mixHex(fg, bg, 0.25),
    '_line': theme.line ?? mixHex(fg, bg, 0.5),
    '_arrow': theme.accent ?? mixHex(fg, bg, 0.85),
    '_node-fill': theme.surface ?? mixHex(fg, bg, 0.03),
    '_node-stroke': theme.border ?? mixHex(fg, bg, 0.2),
    '_group-fill': bg,
    '_group-hdr': mixHex(fg, bg, 0.05),
    '_inner-stroke': mixHex(fg, bg, 0.12),
    '_key-badge': mixHex(fg, bg, 0.1),
  }

  let resolved = source
  for (const [name, value] of Object.entries(values)) {
    resolved = resolved.replaceAll(`var(--${name})`, value)
  }
  return resolved
}

const source = inlineThemeVariables(await readFile(inputPath, 'utf8'))
await sharp(Buffer.from(source), { density: 180 })
  .flatten({ background: '#ffffff' })
  .png()
  .toFile(outputPath)

console.log(outputPath)
