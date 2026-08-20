# HUAS Server 社交后端重构交付核对报告

> 事实基准：2026-07-31
>
> 核对范围：后端代码、SQLite migration、HTTP 契约、测试、运维脚本与 GEB 文档。UI 设计和前端页面实现不在本轮范围。

## 核心结论

社交后端已完成从“用户表混存资料、Discover 评分、匿名 Treehole、模块内提醒”到五个独立纵向切片的破坏性重构：

1. Community 独立拥有公共资料，Identity 只提供校园 className 窄投影。
2. Discover 物理删除评分能力，改为幂等点赞与基于点赞偏好的推荐。
3. Treehole 取消匿名，帖子和评论统一返回公共作者。
4. Notifications 通过 transactional outbox 投影六类活动通知。
5. Messaging 提供一对一图文私信、幂等、限流、游标未读与私有媒体。
6. Operations 通过公开 ports 读取社交数据，私信管理入口严格只读。
7. 应用启动不再拥有 migration 权限；0003 只能在快照、停流和显式 destructive 授权后执行。

本轮按产品负责人最新范围不修改 Web UI。当前 Web 仍消费旧评分/匿名相关契约，因此本后端提交是“后端完成、整体发布未就绪”：必须等待独立前端任务切换到新 DTO 和路由后，与新 Server/Web 在同一个维护发布中交付，禁止单独部署当前后端。

## 1. 模块与依赖边界

```text
Identity ──read port──> Community
                         │
                         ├──batch profile reader──> Discover
                         ├──batch profile reader──> Treehole
                         ├──batch profile reader──> Notifications
                         └──batch profile reader──> Messaging

Discover/Treehole ──activity ports──> Notifications
Identity/Discover/Treehole/Messaging ──query ports──> Operations
```

跨模块组合只发生在 `src/composition.ts`。各模块导出构造器、应用服务、route factory 和领域 ports，不导出 concrete singleton。Community 不反向依赖任何社交消费者；Operations 不直接 SQL 查询消费者表。

公共作者统一为：

```json
{
  "id": 17,
  "displayName": "软工同学17",
  "avatarUrl": null
}
```

不存在昵称时，Community 读取 Identity className 第一个数字前的前缀；无有效前缀时回退 `文理er {id}`。学号、真实姓名、完整班级、评论历史和点赞历史不进入公共资料 DTO。

## 2. Discover 与 Treehole

Discover 当前事实为帖子、图片元数据、点赞和评论。点赞/取消点赞幂等，作者也可自赞且自赞不生成通知；`popular` 以点赞数和时间排序，`recommended` 从用户点赞过的分类/标签推断，无数据回退 `latest`。评分表、评分字段、评分接口和兼容 Facade 均已删除。

Treehole 只保留产品名称，不再提供匿名语义。帖子和评论显式绑定 `users.id`，作者资料由 Community 批量投影；旧头像/profile/通知职责不再属于 Treehole。公共用户内容由 Discover 与 Treehole 各自的 `/users/:userId/posts` 接口提供。

## 3. Activity Outbox 与 Notifications

Discover/Treehole 的有效点赞、评论和回复在原领域 SQLite 短事务内同时提交互动事实、派生计数与 Outbox 事件。事件只保存稳定引用，不复制帖子、评论正文，也不建立跨领域内容外键。

六类通知为 Discover/Treehole 各自的 like、comment、comment_reply。eventId 包含 recipient，支持同一回复向父评论作者和不同的帖子作者分别幂等投影；自我互动过滤，重复 recipient 去重。取消点赞会在原事务撤销 pending/processed Outbox 和已投影通知。

请求提交后立即尝试投影，失败由周期任务退避重试。通知只支持逐条已读；Messaging 未读完全独立，不写活动通知。

## 4. Messaging

Messaging 数据模型针对一对一会话：

- `conversations` 对有序用户对建立唯一约束和双边阅读游标；
- `messages` 以 `(sender_user_id, client_message_id)` 保证客户端 UUID 幂等；
- `message_images` 约束 0–8 序位和 `image/webp` 元数据；
- 会话只在首条消息成功事务内创建，不存在空会话命令；
- 发送速率由持久消息事实按用户计算，限制 30 条/分钟；
- 未读数由消息 ID 与当前用户游标计算，不写冗余通知事实。

消息允许文字、图片或二者同时存在。文字上限 1000 Unicode code point；图片最多 9 张，单张原图 32MB、合计 64MB。图片在事务外完成真实格式识别、旋转、缩放和 WebP 转换，SQLite 短事务只提交消息与元数据；失败补偿删除整批候选媒体。

普通媒体读取必须证明 Bearer 用户属于会话；管理员读取必须通过后台 Cookie，并且只能消费 `MessagingOperationsQueryPort`。两条路径都返回 `private, no-store`，没有任何编辑、撤回、删除消息或删除会话接口。

## 5. 数据库 contract migration

`0003_social_rearchitecture` 完成以下结构变化：

- 建立 `community_profiles` 并迁移旧昵称/头像元数据；
- 从 `users` 删除 `community_nickname/treehole_avatar_url`；
- 删除空的 `discover_post_ratings`、评分聚合列和旧 Treehole 通知表；
- 建立 Discover 点赞、Activity Outbox、Notifications 与 Messaging 表；
- 动态保存并复核 users、credentials、cache、Discover/Treehole 八张核心事实表行数；
- 旧评分或旧通知出现新事实时拒绝迁移并回滚。

当前 Drizzle 类型相共有 17 张业务表。运行期数据库入口只打开已有文件并验证完整 migration metadata 与 schema fingerprint；v2、缺失库、被篡改 checksum 或结构漂移都会在监听端口前失败。

## 6. 运行态与可观测性

`src/index.ts` 只负责 schema 校验、监听和生命周期；`src/app.ts` 只构造 Hono；`src/composition.ts` 是唯一跨模块组合根。

`PeriodicTaskRegistry` 收敛凭证、缓存、验证码会话、Outbox 重试、已读通知清理和无主私信媒体清理，保证具名、可停止、失败隔离与同任务不重叠。

成功的 Notifications/Messaging 轮询不写访问日志，但仍计入 HTTP metrics；失败和写操作保留日志。发送日志只记录对象 ID、图片数和原图总字节数，不记录正文、原文件名或图片内容。

## 7. 发布门禁

0003 不是在线 expand migration。发布顺序固定为：

```text
maintenance 503
  -> stop all writers
  -> SQLite snapshot
  -> db:migrate --allow-destructive
  -> PRAGMA quick_check / foreign_key_check
  -> new Server/Web local smoke
  -> reopen traffic
```

迁移后失败不得恢复旧 upstream，因为旧版本与 contract schema 已不兼容；必须保持停流、停 writer 并 forward-fix。真实 `data/huas.db` 不用于开发演练，所有迁移验证都在内存或系统临时目录完成。

## 8. 证据索引

| 能力 | 机器相 | 主要验证 |
|---|---|---|
| Community | `src/modules/community/` | `tests/community.test.ts` |
| Discover | `src/modules/discover/` | `tests/discover.test.ts` |
| Treehole | `src/modules/treehole/` | `tests/treehole.test.ts` |
| Outbox/Notifications | `src/modules/notifications/` | `tests/notifications.test.ts`、`tests/activity-outbox-integration.test.ts` |
| Messaging | `src/modules/messaging/` | `tests/messaging.test.ts`、`tests/messaging-admin.test.ts` |
| app/composition/runtime | `src/app.ts`、`src/composition.ts`、`src/runtime/` | `tests/app-factory.test.ts`、`tests/periodic-tasks.test.ts` |
| migration/deploy | `src/db/migrations/0003_social_rearchitecture.ts`、`scripts/` | `tests/database-migrations.test.ts`、`tests/deployment-scripts.test.ts` |

最终后端门禁为：

```bash
bun run typecheck
bun run test
bun run db:verify
git diff --check
```

文档完成标准不是“描述看起来合理”，而是 API、架构、运维、L1/L2/L3 与上述机器相逐项一致。
