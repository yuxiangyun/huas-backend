/**
 * [INPUT]: 依赖 tests/business-flows 的登录、凭证、课表、日历、缓存与持久化细分用例
 * [OUTPUT]: 聚合核心业务流回归套件，保持进程级 mock 与共享 SQLite 的单进程隔离语义
 * [POS]: tests 的核心业务流回归入口，由 scripts/test.ts 作为独立 Bun 进程执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import './business-flows/auth-login.cases';
import './business-flows/credential-recovery.cases';
import './business-flows/recovery-cooldown.cases';
import './business-flows/schedule-fallback.cases';
import './business-flows/calendar-subscription.cases';
import './business-flows/user-cache.cases';
import './business-flows/persistence-boundaries.cases';
import './business-flows/schedule-cache.cases';
