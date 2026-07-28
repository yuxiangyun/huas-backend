# Beautiful Mermaid 渲染约定

固定依赖：`beautiful-mermaid@1.1.3`。锁文件位于 `scripts/package-lock.json`，不得改用目标项目中的 Mermaid 工具链。

## 稳定语法子集

- 流程图：`flowchart LR`、`flowchart TD`，普通节点、判断节点、子图和带文字的边。
- 状态图：`stateDiagram-v2`，普通状态、起止状态和带文字的转换。
- 时序图：`sequenceDiagram`，参与者、同步/异步消息、返回消息和备注。
- 类图：`classDiagram`，继承、组合、关联和简短成员。
- 实体关系图：`erDiagram`，实体、关系和必要字段。
- 数值图：`xychart-beta`，仅用于材料中存在明确数值的场景。

避免实验性 Mermaid 指令、HTML 标签、图标语法、自定义脚本、超长标签和深层嵌套。渲染失败时先缩小到稳定语法，而不是换用其他渲染器。

## 主题与布局

默认使用 `github-light`，保证 Markdown 阅读器中的浅色背景可读性。除非用户指定，否则不要混用主题。

渲染脚本固定使用：

- `padding: 36`
- `nodeSpacing: 28`
- `layerSpacing: 44`
- `thoroughness: 5`

单图超过约 12 个主要节点或需要大量交叉边时，优先拆图。布局方向表达时间或处理链时用 `LR`，表达层级或分支时用 `TD`。

## API 依据

`renderMermaidSVG(source, options)` 返回自包含 SVG；`THEMES['github-light']` 提供内置主题。API 依据为 Beautiful Mermaid 官方仓库与 Context7 的 `/lukilabs/beautiful-mermaid` 文档快照（查询日期：2026-07-18）。
