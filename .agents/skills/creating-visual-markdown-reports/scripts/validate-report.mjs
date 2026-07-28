/**
 * [INPUT]: 依赖本地 Markdown 报告及其相对引用的 SVG 资源
 * [OUTPUT]: 对外提供命令行静态校验，拒绝 Mermaid 源码、失效资源和非 Beautiful Mermaid SVG
 * [POS]: 可视化报告 Skill 的交付门禁，与渲染器共同保证输出契约
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { readFile, readdir } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path'

function fail(messages) {
  for (const message of messages) console.error(`validate-report: ${message}`)
  process.exit(1)
}

function parseReportPath(argv) {
  const index = argv.indexOf('--report')
  const value = index >= 0 ? argv[index + 1] : undefined
  if (!value) fail(['用法: node validate-report.mjs --report <report.md>'])
  return resolve(value)
}

function extractSvgTargets(markdown) {
  const targets = []
  const imagePattern = /!\[[^\]]*\]\(([^)]+)\)/g
  for (const match of markdown.matchAll(imagePattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    const target = rawTarget.split(/\s+["']/u, 1)[0]
    if (extname(target).toLowerCase() === '.svg') targets.push(target)
  }
  return targets
}

const reportPath = parseReportPath(process.argv.slice(2))
const reportDir = dirname(reportPath)
const markdown = await readFile(reportPath, 'utf8')
const errors = []

if (/```\s*mermaid\b/iu.test(markdown)) errors.push('报告中不得包含 Mermaid 源代码块')
if (/\{\{[^}]+\}\}/u.test(markdown)) errors.push('报告仍包含模板占位符')

const narrative = markdown
  .replace(/!\[[^\]]*\]\([^)]+\)/gu, '')
  .replace(/[#>*_`|\-\s]/gu, '')
if (narrative.length < 80) errors.push('事实说明过少；报告不能只包含图表')

const svgTargets = extractSvgTargets(markdown)
if (svgTargets.length === 0) errors.push('报告至少需要引用一张 SVG 图表')

for (const target of svgTargets) {
  if (isAbsolute(target) || /^[a-z][a-z\d+.-]*:/iu.test(target)) {
    errors.push(`SVG 必须使用报告目录内的相对路径: ${target}`)
    continue
  }

  const assetPath = resolve(reportDir, normalize(target))
  if (relative(reportDir, assetPath).startsWith('..')) {
    errors.push(`SVG 不得逃逸报告目录: ${target}`)
    continue
  }

  try {
    const svg = await readFile(assetPath, 'utf8')
    if (!svg.includes('<svg')) errors.push(`资源不是有效 SVG: ${target}`)
    if (!svg.includes('data-beautiful-mermaid')) errors.push(`资源缺少 Beautiful Mermaid 标记: ${target}`)
  } catch {
    errors.push(`无法读取 SVG: ${target}`)
  }
}

try {
  const assets = await readdir(join(reportDir, 'assets'))
  for (const asset of assets) {
    if (extname(asset).toLowerCase() === '.mmd') errors.push(`assets/ 不得保留 Mermaid 源文件: ${asset}`)
  }
} catch {
  errors.push('缺少 assets/ 目录')
}

if (errors.length > 0) fail(errors)
console.log(`validated ${reportPath} (${svgTargets.length} SVG)`)
