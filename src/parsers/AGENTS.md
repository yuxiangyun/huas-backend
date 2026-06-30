# parsers/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/AGENTS.md

成员清单
academic/: 教务 HTML/混合响应解析器，处理课表、成绩、空教室和 session 过期识别
portal/: Portal JSON 解析器，处理一卡通、用户资料和 Portal 课表
index.ts: 解析器统一出口，向旧调用方暴露 parser 类型和实例

架构决策
解析器只把上游 HTML/JSON 翻译成内部 DTO；不得访问数据库、缓存或 HTTP 响应对象。
session 过期、评教阻断等上游语义在解析层识别，业务层决定如何恢复或兜底。

开发规范
新增解析器必须有 fixture 或 parser 测试覆盖；不得把路由参数和服务缓存逻辑混入解析器。

变更日志
2026-06-30: 播种 parsers L2 地图。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
