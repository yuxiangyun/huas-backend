# campus-integrations/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
cas/: CAS 登录与 TGC 换票防腐层，隔离学校认证协议和故障语义
credential-recovery/: CAS/Portal/JW 显式数值 TTL 凭证恢复与真实学校登录 epoch 上下文；不解释具体派生会话数据
http/: 校园上游 Cookie HTTP 客户端与有界重试原语
jw/: JW 上游适配边界，当前收敛全部纯解析器
mobile-jw/: 移动教务 H5 token-only 派生会话、白名单只读课表协议和纯周解析，供 Academic 第三源消费
mobile-yxt/: Portal 派生无 TTL 会话、校园卡单月交易与 electric config/account 的只读防腐层
portal/: Portal 资料、一卡通服务与纯 JSON 解析器
upstream/: Portal/JW 请求的凭证恢复、会话重建与瞬态重试编排
endpoints.ts: CAS、Portal、JW、mobile-yxt、mobile-jw 地址唯一事实源，旧 core/url-config 只做再导出

架构决策
Campus Integrations 是学校上游协议的 canonical 防腐层；旧 auth/core/parsers/services 路径只能单向再导出本模块，禁止本模块反向依赖旧 Facade、routes 或 Identity。
解析器保持无网络、无缓存、无持久化的纯转换边界；Portal 用户资料与一卡通适配器保留历史缓存、回写和 stale fallback 语义。
恢复失败按学校登录 epoch 绑定固定五秒窗口，CAS 按用户、Portal/JW 按能力隔离，命中不续期；真实登录换代使旧窗口失效，迟到静默请求不能覆盖新登录或补写验证码标记。本地快捷登录不检查学校也不清冷却。静默重认证按用户共享在途恢复（PerKeySingleflight），同用户并发凭证缺口只跑一条 CAS 登录链；共享结果携带实际能力，joiner 在航班结束后优先以新 TGC 串行补足所需系统。upstream 经 resolveCredentialClient 单次恢复链同时取得 token 与客户端，禁止恢复链跑两遍。
mobile-yxt 自有 repository 保存登录 epoch 与无 TTL 派生会话；exchange 只能在 epoch 未变化时条件写入，host/open 401 按值条件失效 Portal JWT 并窄恢复一次，业务 401 按 generation compare-and-delete，并在同用户 singleflight 内最多重建、重试一次。真实 CAS 登录无条件提交 epoch/实际基础凭证、删除本次缺失的旧 Portal JWT 并原子清理严格派生命名空间，普通 Portal JWT 轮换不推进 epoch；损坏 CookieJar 在 repository 读取事务内淘汰后按 miss 重建。
mobile 查询只经 PortalCredentialReader 恢复 Portal，禁止激活、覆盖或失效 JW；同键缓存 miss/显式 refresh 共享在途回源并使用独立内存配额，不消费 Academic refresh 桶；overview 分别投影余额/交易 availability 与 freshness。
mobile-jw 与 mobile-yxt 共享 credential-recovery/PortalCredentialReader，不互读派生会话；移动教务按真实 500+字符串401 恢复，普通 5xx/网络失败仅有限重试。共享 Portal-only 航班包含 TGC 换票，换票提交校验登录 epoch 与 TGC 快照，旧响应不能恢复已清理上下文。同 epoch 普通 TGC 快照竞争有界补足目标能力，不因竞争直接触发 CAS 重登录。
账单与电费只读边界禁止调用 usageDetails、pay、水费及任何上游写能力，未验证官方入口前缴费 capability 固定为 false。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
