# campus-integrations/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
school-access/: 学校真实认证与条件状态提交公共入口，CAS 成功立即交付身份；统一拥有具名业务访问、目标恢复、条件状态与请求执行。
cas/: CAS 登录与 TGC 换票防腐层，隔离学校认证协议和故障语义
http/: 校园上游 Cookie HTTP 客户端与有界重试原语
jw/: JW 上游适配边界，当前收敛全部纯解析器
mobile-jw/: 移动教务 H5 token-only 派生会话、白名单只读课表协议和纯周解析，供 Academic 第三源消费
mobile-yxt/: Portal 派生无 TTL 会话、校园卡单月交易与 electric config/account 的只读防腐层
portal/: Portal 资料、一卡通服务与纯 JSON 解析器
endpoints.ts: CAS、Portal、JW、mobile-yxt、mobile-jw 地址唯一事实源，固定学校协议地址

架构决策
Campus Integrations 是学校上游协议的 canonical 防腐层；保留的旧 parsers/services 路径只能单向再导出本模块，禁止本模块反向依赖旧 Facade、routes 或 Identity。
解析器保持无网络、无缓存、无持久化的纯转换边界；Portal 用户资料与一卡通适配器保留历史缓存、回写和 stale fallback 语义。
认证与学校访问对外收敛为 Identity、SchoolAccess、RuntimeConfig。Identity 只做本地快捷、JWT、登录结果及缺失资料补全请求；学校 CAS 成功立即条件提交身份，不等待学校业务能力或资料。SchoolAccess 的状态、恢复与协议只在内部协作，业务消费具名操作，不接收客户端或凭证。
恢复依赖固定为 CAS→Portal、CAS→JW、Portal→mobile。CAS 按用户合流，目标按用户/能力合流；共享任务只返回冻结快照并使用自身预算，每个等待者独立限时，每个业务调用独立创建客户端。唯一 request-executor 负责临时重试与一次会话恢复重放，CAS POST 和评教提交不可重放。
真实认证按开始顺序和最近成功提交排序；迟到成功仍可签 JWT，但不能回写较新账号状态。静默恢复附加 epoch 约束；基础换票同时核对 epoch/TGC 原快照，派生会话保留 epoch 条件创建和 generation 条件删除。
只有 CAS 明确拒绝保存凭据或要求验证码才持久化交互标记并返回 3003/401。学校故障、协议异常和二次会话拒绝不退出；固定五秒冷却按 epoch/目标隔离且不续期。协议失效证据由各适配器判定，HTTP 层只报告传输事实并覆盖完整正文预算。
mobile-jw 保留 token-only 会话与 HTTP 401、HTTP 200/500 加字符串 code=401 证据；mobile-yxt 只认业务 HTTP 401，持久 Cookie 经单 JSESSIONID codec 校验。二者不读取或激活 JW，不把首个调用的客户端或 deadline 交给 joiner。
账单与电费只读边界禁止调用 usageDetails、pay、水费及任何上游写能力，未验证官方入口前缴费 capability 固定为 false。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
