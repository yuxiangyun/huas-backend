/**
 * [INPUT]: 依赖 beautiful-mermaid 的确定性 SVG 渲染能力，以及本地 Mermaid 源文件和输出参数
 * [OUTPUT]: 对外提供命令行渲染器，将单个受支持的 Mermaid 图写为自包含 SVG
 * [POS]: 可视化报告 Skill 的唯一绘图适配层，隔离目标仓库与渲染依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { renderMermaidSVG, THEMES } from 'beautiful-mermaid'

function fail(message) {
  console.error(`render-diagram: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = { theme: 'github-light', force: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--force') {
      options.force = true
      continue
    }

    if (argument === '--input' || argument === '--output' || argument === '--theme') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) fail(`${argument} 缺少值`)
      options[argument.slice(2)] = value
      index += 1
      continue
    }

    fail(`未知参数 ${argument}`)
  }

  if (!options.input || !options.output) {
    fail('用法: node render-diagram.mjs --input <diagram.mmd> --output <diagram.svg> [--theme <name>] [--force]')
  }

  return options
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const options = parseArgs(process.argv.slice(2))
const inputPath = resolve(options.input)
const outputPath = resolve(options.output)

if (extname(inputPath) !== '.mmd') fail('输入文件必须使用 .mmd 扩展名')
if (extname(outputPath) !== '.svg') fail('输出文件必须使用 .svg 扩展名')
if (!(options.theme in THEMES)) fail(`未知主题 ${options.theme}；可用主题: ${Object.keys(THEMES).join(', ')}`)
if (!options.force && await pathExists(outputPath)) fail(`输出已存在: ${outputPath}；确认替换后使用 --force`)

const source = (await readFile(inputPath, 'utf8')).trim()
if (!source) fail('Mermaid 源文件为空')

const svg = await renderMermaidSVG(source, {
  ...THEMES[options.theme],
  padding: 36,
  nodeSpacing: 28,
  layerSpacing: 44,
  thoroughness: 5,
})

if (typeof svg !== 'string' || !svg.includes('<svg')) fail('Beautiful Mermaid 未返回有效 SVG')

const markedSvg = svg.replace('<svg ', '<svg data-beautiful-mermaid="1.1.3" ')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${markedSvg.trim()}\n`, 'utf8')
console.log(outputPath)
