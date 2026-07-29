/**
 * [INPUT]: 依赖 tests/treehole 的帖子头像、交互、管理与合规细分用例
 * [OUTPUT]: 聚合 Treehole HTTP/事务/媒体业务回归套件，保持单进程共享支架与逐用例隔离
 * [POS]: tests 的 Treehole 回归入口，仅负责装配细分用例
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import './treehole/posts-avatar.cases';
import './treehole/interactions.cases';
import './treehole/management.cases';
import './treehole/compliance.cases';
