/**
 * [INPUT]: 依赖 Treehole 管理列表稳定 DTO
 * [OUTPUT]: 对外提供 TreeholeOperationsQueryPort，封装后台帖子与评论只读查询
 * [POS]: treehole/domain 的公开管理查询契约，让 Operations 不感知匿名社区 SQLite 表
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  AdminTreeholeCommentListOptions,
  AdminTreeholeCommentListResponse,
  AdminTreeholePostListOptions,
  AdminTreeholePostListResponse,
} from './treehole';

export interface TreeholeOperationsQueryPort {
  listPosts(options: AdminTreeholePostListOptions): Promise<AdminTreeholePostListResponse>;
  listComments(
    postId: number,
    options: AdminTreeholeCommentListOptions,
  ): Promise<AdminTreeholeCommentListResponse | null>;
}
