# application/
> L2 | 父级: /Users/xiangyun/workspace/huas-wechat-app/huas-server/src/modules/cache/AGENTS.md

成员清单
singleflight.ts: 进程内 per-key 在途 Promise 注册表，以业务 key 和 refresh 意图为联合键并在完成后释放

架构决策
singleflight 不读取缓存、不执行回源也不解释业务错误；它只合并调用方明确声明为同一意图的并发工作。

[PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
