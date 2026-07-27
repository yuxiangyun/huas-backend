# parsers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
academic/: JW parser 兼容 Facade，canonical HTML/混合响应解析器位于 campus-integrations/jw/parsers
portal/: Portal parser 兼容 Facade，canonical JSON 解析器位于 campus-integrations/portal/parsers
index.ts: 解析器聚合兼容出口，直接再导出 Campus Integrations parser 类型和实例

架构决策
旧 parsers 目录不持有解析实现；canonical 解析器只把上游 HTML/JSON 翻译成内部 DTO，不得访问数据库、缓存或 HTTP 响应对象。
session 过期、评教阻断等上游语义在解析层识别，业务层决定如何恢复或兜底。

开发规范
新增解析器必须有 fixture 或 parser 测试覆盖；不得把路由参数和服务缓存逻辑混入解析器。

变更日志
2026-07-27: 全部 JW/Portal parser 迁入 campus-integrations，旧文件与聚合出口只做单向再导出。
2026-07-16: academic 收敛评教 URL、列表、表单和提交页解析，服务层不再直接解释 HTML。
2026-06-30: 播种 parsers L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
