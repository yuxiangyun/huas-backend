# public/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/AGENTS.md

成员清单
index.html: 开发测试页，直接请求后端接口辅助手工调试。

架构决策
public 只放无需构建的静态资产；开发测试页只在非 production 下暴露。
后台唯一入口是 `/m/admin/*`，public 不再承载管理页面。

开发规范
修改静态页时同步 L3 头部；新增公开文件必须先明确是否需要鉴权托管。

变更日志
2026-07-12: 删除旧 `/status` 静态后台，管理界面收敛到 `/m/admin/*`。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
