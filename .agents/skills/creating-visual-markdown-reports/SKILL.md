---
name: creating-visual-markdown-reports
description: 分析用户明确指定的文档、文件或源代码，并生成包含事实说明与 Beautiful Mermaid SVG 图表的 Markdown 报告。仅当用户同时要求分析材料和生成可视化 Markdown 报告时使用；不用于普通摘要、代码审查、一般文档编写或仅生成图表。
---

# 创建可视化 Markdown 报告

生成一份证据可追溯、文字简洁的 Markdown 报告，只用必要的图表降低理解成本。

## 约束执行边界

- 只读分析目标材料。允许使用只读文件工具或命令枚举、搜索和读取文件。
- 不运行被分析仓库的程序、构建、测试、迁移、开发服务器或其他可能改变项目状态的命令。
- 只允许执行本 Skill 自带的依赖安装、SVG 渲染和报告校验程序；不得把渲染依赖加入目标项目。
- 只陈述材料能够支持的事实。无法由材料确认的内容标记为未知，不用猜测补全。
- 尊重目标仓库的 `AGENTS.md` 及同类局部指令，但不因生成报告而修订被分析代码或原文档。

## 1. 确定范围与输出

1. 明确分析对象、报告语言和输出目录。用户未指定输出目录时，使用当前工作目录。
2. 默认输出 `report.md` 和 `assets/*.svg`。若同名文件已存在，只有在用户明确要求更新或替换时才覆盖。
3. 不在最终输出中保留 Mermaid 源文件、临时文件或依赖目录。

## 2. 读取事实

文档任务：先读取目录、标题结构和相关章节，保留原材料的概念层级。

代码仓库任务：按以下顺序建立心智地图，仅沿证据路径深入：

1. 仓库指令、目录结构、README、清单与配置文件；
2. 应用入口、路由或公开接口；
3. 与报告主题直接相关的主要模块；
4. 现有架构、API 和运维文档；
5. 仅为确认依赖、数据流或行为而读取的实现文件。

用户要求“先读代码再对照文档”时，先从代码独立形成事实清单，再读取文档并记录一致、缺失和冲突之处。不要让旧文档替代码作证。

为每条关键结论保留证据路径和必要的章节名或符号名。复用已提取事实，不重复读取无关文件。

## 3. 选择图表

只选择能够明显减少复杂文字的最小图表集合：

- 架构、模块依赖、数据流：流程图；
- 跨组件交互：时序图；
- 生命周期：状态图；
- 稳定实体关系：ER 图或类图；
- 有可靠数值依据的比较：XY 图。

一个图只回答一个问题。保持节点标签简短，优先使用 `LR` 或 `TD`，复杂图拆分。没有足够证据或图表不能提升理解时，保留文字并说明限制。

绘图前读取 [references/beautiful-mermaid.md](references/beautiful-mermaid.md)，只使用其中列出的稳定语法子集。

## 4. 渲染 SVG

首次使用或依赖缺失时，在 Skill 目录执行：

```bash
npm ci --prefix scripts
```

把每张图的 Mermaid 源码写入输出目录之外的临时 `.mmd` 文件，再执行：

```bash
node scripts/render-diagram.mjs \
  --input /absolute/path/to/diagram.mmd \
  --output /absolute/path/to/report/assets/descriptive-name.svg \
  --theme github-light
```

若用户明确要求替换已生成的图，增加 `--force`。渲染成功后删除临时 `.mmd` 文件。不得用标准 Mermaid CLI、截图或手写 SVG 替代 Beautiful Mermaid。

## 5. 编写报告

可从 [assets/report-template.md](assets/report-template.md) 复制骨架，但必须按材料重组并删除无关章节和全部占位符。

- 用相对路径 `assets/<name>.svg` 引用图表，不嵌入 Mermaid 源码。
- 先给理解图表所必需的上下文，再引用图表；不要逐节点复述图中信息。
- 对关键结论标注源文件、标题、符号或配置项。路径使用反引号或相对 Markdown 链接。
- 区分“代码事实”“文档声明”和“代码—文档差异”。
- 文字直接、紧凑；删除通用开场白、装饰性结论和重复内容。

## 6. 验收

执行静态校验：

```bash
node scripts/validate-report.mjs --report /absolute/path/to/report.md
```

随后逐一检查 SVG 的视觉结果，确认无截断、重叠、不可读文本或过密布局。失败时先简化图，再调整 `nodeSpacing`、`layerSpacing` 或拆图；不要用更小字号掩盖信息过载。

若当前视觉工具不能直接读取 SVG，先生成临时 PNG 预览：

```bash
node scripts/render-preview.mjs \
  --input /absolute/path/to/report/assets/diagram.svg \
  --output /temporary/path/diagram.png
```

检查 PNG 后删除它；最终报告仍只引用 SVG，不交付预览 PNG。

完成条件：报告含有有价值的事实说明、至少一张确实提升理解的 Beautiful Mermaid SVG、可访问的相对引用和足以追溯关键结论的证据；输出目录不含 Mermaid 源码。
