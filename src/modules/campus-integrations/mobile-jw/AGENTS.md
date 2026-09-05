# mobile-jw/
> L2 | 父级: ../AGENTS.md

成员清单
errors.ts: HTTP/业务失效与超时、业务拒绝、协议异常的独立低敏感错误语义，固定字符串 code=401 证据。
auth-exchanger.ts: 固定学校 SSO 入口交换 Portal JWT 为独立 H5 token，只解析同源 casLogin/loginSso 路由且不执行响应脚本。
session-repository.ts: SQLite 的 token-only 派生会话，绑定真实登录 epoch、按 generation 条件失效且坏行读取即淘汰。
session-executor.ts: 会话复用、同用户重建合流、一次 Portal 窄恢复与一次业务重放；临时故障复用有限退避，每个调用保留自己的客户端与截止时间。
schedule-client.ts: 学期/字典/节次模式/节次/当前课表/指定学期六类只读 POST 内部入口，固定路径和有界 query 参数，不接受任意 URL。
schedule-parser.ts: 严格校验七天日期、三层 item、节次序列与 courses 数量，按真实日期投影统一 ICourse，拆分非连续节次而不拼接重复容器。

架构决策
本模块服务 APP“移动教务”学生课表，独立于 xyjw Cookie、Portal 日程与 APP 学习中心 API。Portal reader 归 credential-recovery；H5 token 归本模块，不扩展三类基础 CredentialSystem。
业务 HTTP 401 或 HTTP 200/500 且字符串 code="401" 才重建 H5 会话；500/502/503/504 普通临时故障和网络错误在共享 45 秒预算内默认最多尝试两次；403、未知 JSON、空课表与未公布不清凭证。SSO 明确拒绝 Portal 时按值条件删除并只窄恢复一次。
会话没有猜测的 TTL，只存 H5 token/epoch/generation，不存 Portal JWT、完整 Cookie 或 SSO URL。真实 CAS 登录统一清理 derived_session:*；交换期间 epoch 变化只允许重试一次。
Academic composition 经窄 MobileJwSchedulePort 装配本模块，作为 /api/schedule 的 mobile-jw 来源；公开 DTO 不透传学校原文或凭证。2026-09-05 已验证 SSO、三层凭证恢复及当前学期全部 19 周。getSycurriculum 同周实测空表与 curriculum 有课冲突，因此正式第三源仅使用 curriculum，范围外由 JW/Portal 接力。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
