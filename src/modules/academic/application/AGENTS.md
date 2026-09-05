# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/academic/AGENTS.md

成员清单
schedule-service.ts: JW 单源周课表用例，分离 current/stale reader，并保留周缓存、同意图回源合并、按开始代次提交与保留原时间的条件日粒度提升
portal-schedule-service.ts: Portal 单源日期课表用例，分离 current/stale reader，并保留范围校验、同意图回源合并、按开始代次提交、旧日期/空表缓存按快照淘汰与缓存限额
mobile-jw-schedule-service.ts: 第三源周课表用例，经窄 client 读取真实日期锚点和目标周；独立版本缓存复用 normal/refresh 合流、代次提交和用户 LRU，范围外以独立能力错误交给后备来源，缺少周锚点元信息仍视为协议失败
schedule-facade.ts: 移动教务/JW/Portal 通用 plan 编排，并提供日历固定移动教务单源入口，穷尽 current 后按参与源固定顺序读取 stale，固化请求级快照元信息排除来源能力限制参与最终错误仲裁，并保留 legacy 主源未公布短路与错误优先级
schedule-source-policy-service.ts: 课表来源策略用例边界，统一读取状态快照与持久化热切换命令
grade-service.ts: fresh-first 成绩读取用例，以 45 秒总预算有限重试凭证恢复、502/503/504 与一次无效页，按回源代次提交缓存，并在新鲜路径穷尽后执行 stale fallback
evaluation-service.ts: 评教用例，保留 actionable/blocked，固定有界批次目标、只重试读取、一次性提交及批末按身份增量确认；已尝试 POST 无完成增量或回查失败均为 unknown，failed 仅表示提交前准备失败
classroom-free-service.ts: 空教室用例，分离审计 actor 与配置化服务账号上游身份

架构决策
application 只编排用例顺序并消费 canonical 纯解析器，不定义校园协议或数据库查询；服务采用构造注入，composition root 负责暴露旧静态类签名。
课表 stale 必须由 Facade 在参与来源的 current 全部失败后统一选择，单源 service 不得提前降级；mobile-jw-first 固定移动教务→JW→Portal stale，旧模式固定 JW→Portal。当前学期范围外与真实协议错误均不得被错误移动周缓存伪装成功。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
