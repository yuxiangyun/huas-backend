# credential-recovery/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/campus-integrations/AGENTS.md

成员清单
credential-manager.ts: CAS TGC、Portal JWT、JW Session 的强制正 TTL 存储与能力感知静默恢复；请求客户端与条件失效闭包绑定同一原子凭证/epoch 快照，同用户只共享一条 CAS 航班，joiner 校验实际能力并优先以新 TGC 串行补足，mobile 的 Portal-only 航班不触碰 JW；明确 CAS 拒绝阻断快捷登录，CAS 成功后的能力缺失保持 503/504
portal-credential-reader.ts: mobile-yxt/mobile-jw 共享窄端口，原子读取 Portal JWT/epoch、按值条件拒绝和只恢复 CAS/Portal，不读取或激活 JW
recovery-cooldown.ts: 按用户、能力和学校登录 epoch 保存有界五秒失败窗口，读取不续期并保留原有错误；真实登录换代使旧窗口失效
school-login-context.ts: Identity/静默恢复共享的真实 CAS SQLite 事务原语，原子推进 epoch、提交实际取得的基础凭证、删除缺失 Portal，并以字面 GLOB 只清理严格 `derived_session:*`

架构决策
普通过期凭证可沿 TGC 和加密密码静默恢复；CAS 明确要求验证码或拒绝凭据时，按开始 epoch 原子清理三类学校凭证并写入无 TTL 的 interactive_login_required（captcha_required/credentials_rejected），阻断静默恢复与下一次本地快捷登录；真实 CAS 成功提交时清除标记。未知响应、超时与认证后学校能力缺失不写该标记，超时保留 504，其余保留 3005/503；能力失败的五秒冷却重放同一非认证错误。
恢复失败不再累计次数：CAS 失败按用户节流，Portal/JW 失败只节流对应能力，固定五秒后由下一请求重试；同能力回源与 TGC 换票各自合流，CAS 仍使用 user 级 singleflight。窗口绑定 school login epoch，命中不续期且保留原有拒绝/瞬态错误语义；本地登录不检查学校、不清冷却。网络故障复用 Bun/Node cause 链分类；CAS 验证码与 execution 读取在同用户共享恢复内按次数和调用方 deadline 重试瞬态网络/HTTP 5xx，耗尽后才记录五秒冷却，不重放登录 POST。维护页保留既有超时语义，完整页面缺少 execution 则返回 3005/503，不伪装为超时或凭证拒绝。Portal 换票结果携带的 upstreamError 在 TGC 刷新与 CAS 后激活两条路径均必须抛出，避免为 HTTP 5xx 继续密码认证或返回凭证拒绝。
静默 CAS 请求提交、失败窗口和交互认证标记均受开始时 epoch 约束，真实登录先提交后，旧请求只能复用当前能力，不能覆盖新凭证、清理新登录或重新施加冷却；验证码/明确凭据拒绝失效三类基础凭证与写交互标记在同一事务提交。
通用 `storeCredential` 只接受 CAS/Portal/JW 与正整数 TTL，读取拒绝无 TTL 的异常基础凭证，批量失效不越过自有凭证/交互标记边界；真实 CAS 登录的新 epoch 不得继承本次未取得的旧 Portal JWT，本地快捷登录和普通 Portal/JW 轮换均不得改变 epoch。
Portal-only 在途合流覆盖 TGC 换票和缺口恢复；TGC 换票在同一 SQLite 短事务核对 epoch、原 TGC 快照并提交 TGC/目标凭证，真实登录或显式清理先完成时丢弃迟到结果。同 epoch 普通快照竞争先复用目标凭证，再以最新有效 TGC 最多补一次；仍竞争则按临时超时结束，不直接升级为密码登录。
派生会话无 TTL/generation 语义归各业务 repository；credential-recovery 只提供通用登录上下文，不解析 mobile 数据。真实 CAS 成功是事务提交边界，不以 Portal/JW 激活成功或本服务 JWT 签发为前提。
resolveCredentialClient 在单次恢复后原子读取当前凭证、登录代次及所需 TGC Jar，再以同一快照构造客户端和条件失效闭包；迟到业务失效不能删除新登录或同代次轮换的凭证。
恢复 singleflight 保持 user 级 key；共享结果必须先携带实际取得的 CAS/Portal/JW 能力，目标能力缺失的调用方再重放自己的非认证型冷却错误，不能让 JW 失败提前拒绝已取得 Portal 的 joiner，能力不足的 joiner 只能等待当前航班释放后串行补足，禁止按 requirement 拆 key 并发登录 CAS。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
