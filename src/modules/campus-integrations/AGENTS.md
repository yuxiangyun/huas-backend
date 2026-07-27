# campus-integrations/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/AGENTS.md

成员清单
cas/: CAS 登录与 TGC 换票防腐层，隔离学校认证协议和故障语义
credential-recovery/: 三类学校凭证的持久化生命周期与静默恢复
http/: 校园上游 Cookie HTTP 客户端与有界重试原语
jw/: JW 上游适配边界，当前收敛全部纯解析器
portal/: Portal 资料、一卡通服务与纯 JSON 解析器
upstream/: Portal/JW 请求的凭证恢复、会话重建与瞬态重试编排
endpoints.ts: CAS、Portal、JW 地址唯一事实源，旧 core/url-config 只做再导出

架构决策
Campus Integrations 是学校上游协议的 canonical 防腐层；旧 auth/core/parsers/services 路径只能单向再导出本模块，禁止本模块反向依赖旧 Facade、routes 或 Identity。
解析器保持无网络、无缓存、无持久化的纯转换边界；Portal 用户资料与一卡通适配器保留历史缓存、回写和 stale fallback 语义。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
