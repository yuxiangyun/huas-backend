/**
 * [INPUT]: 依赖注入的 Drizzle 测试数据库与全局 schema 表定义
 * [OUTPUT]: 对外提供 clearSocialTestData，以同步 SQLite transaction 按外键方向清空社交、Early Rising、资料与身份测试事实
 * [POS]: tests 的跨纵向切片数据库隔离 helper，统一处理 Messaging 游标循环引用、Early Rising 外键与 users 依赖顺序
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { schema } from '../src/db';
import type { getDb } from '../src/db';

type TestDatabase = ReturnType<typeof getDb>;

export async function clearSocialTestData(db: TestDatabase) {
  db.transaction((tx) => {
    tx.update(schema.conversations).set({
      lowLastReadMessageId: null,
      highLastReadMessageId: null,
      lastMessageId: null,
    }).run();
    tx.delete(schema.messageImages).run();
    tx.delete(schema.messages).run();
    tx.delete(schema.conversations).run();
    tx.delete(schema.notifications).run();
    tx.delete(schema.activityOutbox).run();
    tx.delete(schema.treeholePostLikes).run();
    tx.delete(schema.treeholeComments).run();
    tx.delete(schema.treeholePosts).run();
    tx.delete(schema.discoverComments).run();
    tx.delete(schema.discoverPostLikes).run();
    tx.delete(schema.discoverPosts).run();
    tx.delete(schema.earlyRisingCheckins).run();
    tx.delete(schema.communityProfiles).run();
    tx.delete(schema.analyticsDailyUsers).run();
    tx.delete(schema.credentials).run();
    tx.delete(schema.cache).run();
    tx.delete(schema.users).run();
  });
}
