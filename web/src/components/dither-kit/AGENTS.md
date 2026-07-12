# dither-kit/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/web/src/components/AGENTS.md

成员清单
area-chart.tsx / area.tsx / cartesian-canvas.tsx / sparkline.tsx: 面积图、折线图与 sparkline 公开能力及 Canvas 绘制层。
bar-chart.tsx / bar.tsx / bar-canvas.tsx: 柱状图公开能力、系列声明与 Canvas 绘制层。
cartesian-root.tsx / chart-context.tsx / common-context.tsx / series-context.tsx: 笛卡尔图表根节点、共享状态与系列协议。
grid.tsx / x-axis.tsx / y-axis.tsx / dot.tsx / legend.tsx / tooltip.tsx: 坐标、图例、提示与标记组合部件。
dither-paint.ts / palette.ts / scales.ts / lib.ts: 抖动绘制、调色板、比例尺与类名工具。
polar.ts / polar-root.tsx / polar-context.tsx: dither-kit core 随附的极坐标底层能力，本项目暂不直接消费。
use-chart-dimensions.ts: 基于 ResizeObserver 的响应式图表尺寸 hook。

架构决策
本目录由 Boring-Software-Inc/dither-kit 注册表生成并纳入仓库；公开消费面限定为 chart、series、axis、grid、legend、tooltip。
文件数量源于第三方绘制原语的平铺导入协议，不在本地重组，避免制造无法升级的私有分叉。

开发规范
本地修改必须保持 children-as-config API；业务配色通过 config 传入，不写死在绘制层。

变更日志
2026-07-12: 从官方注册表引入 core、area-chart 与 bar-chart。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
