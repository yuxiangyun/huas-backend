# public/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
index.html: 开发测试页，直接请求后端接口辅助手工调试。
status.html: Basic Auth 后台工作台，管理用户、公告、Discover、Treehole、日志与 UGC 合规模式热开关。

架构决策
public 只放无需构建的静态资产；/status 由 src/index.ts 单独套 Basic Auth，开发测试页只在非 production 下暴露。
UGC 合规模式控制放在 status.html，调用 /api/admin/compliance/ugc，不在前台移动端暴露。

开发规范
修改静态页时同步 L3 头部；新增公开文件必须先明确是否需要鉴权托管。

变更日志
2026-07-01: 播种 public L2 地图，记录 status.html 的 UGC 合规模式控制职责。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
