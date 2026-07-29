/**
 * [INPUT]: 依赖 tests/discover 的媒体、推荐、评论与管理合规细分用例
 * [OUTPUT]: 聚合 Discover HTTP/媒体业务回归套件，保持单进程共享支架与逐用例隔离
 * [POS]: tests 的 Discover 回归入口，仅负责装配细分用例
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import './discover/media.cases';
import './discover/feed.cases';
import './discover/comments.cases';
import './discover/operations.cases';
