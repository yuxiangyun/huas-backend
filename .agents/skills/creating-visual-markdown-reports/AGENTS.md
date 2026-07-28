# creating-visual-markdown-reports/
> L2 | 父级: /.agents/skills/AGENTS.md

## 成员清单

SKILL.md: 定义双重触发条件、只读分析边界、证据驱动写作流程及完整交付门槛。
agents/openai.yaml: 提供 Skill 列表名称、简述和默认调用提示。
assets/report-template.md: 提供可删改的最小报告骨架，避免强制固定章节。
references/beautiful-mermaid.md: 锁定 Beautiful Mermaid 版本、稳定语法子集、主题及布局约定。
scripts/package.json: 将渲染依赖隔离在 Skill 内并精确固定直接依赖版本。
scripts/package-lock.json: 锁定渲染器完整依赖树，保证跨次执行的一致性。
scripts/render-diagram.mjs: 将临时 Mermaid 源文件确定性渲染为自包含 SVG。
scripts/render-preview.mjs: 将 SVG 转为临时 PNG，弥合视觉工具无法直接解码 SVG 的验收缺口。
scripts/validate-report.mjs: 校验报告文字、相对 SVG 引用、渲染器标记和临时源文件清理状态。

## 架构决策

Skill 只读取目标材料；唯一可执行路径收敛到自身的依赖安装、渲染器和校验器，避免分析过程触发业务副作用。
报告模板负责降低重复劳动但不规定内容结构，最终章节必须由材料本身决定。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
