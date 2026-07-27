/**
 * [INPUT]: 依赖 Treehole 公开只读 query port 与构造注入的 Discover/Treehole 管理命令端口
 * [OUTPUT]: 对外提供 CommunityAdminApplicationService，编排社区管理查询与软删除
 * [POS]: operations/application 的社区管理用例，读模型经所属领域 query port，写操作经命令 adapter
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { TreeholeOperationsQueryPort } from '../../treehole/domain/operations-query';
import type { AdminTreeholeCommentListOptions, AdminTreeholePostListOptions } from '../../treehole/domain/treehole';
import type { DiscoverAdminCommandPort, TreeholeAdminCommandPort } from '../domain/ports';

export class CommunityAdminApplicationService {
  constructor(
    private readonly treeholeQuery: TreeholeOperationsQueryPort,
    private readonly discoverCommands: DiscoverAdminCommandPort,
    private readonly treeholeCommands: TreeholeAdminCommandPort,
  ) {}

  deleteDiscoverPost(postId: number) {
    return this.discoverCommands.deletePost(postId);
  }

  listTreeholePosts(options: AdminTreeholePostListOptions) {
    return this.treeholeQuery.listPosts(options);
  }

  listTreeholeComments(postId: number, options: AdminTreeholeCommentListOptions) {
    return this.treeholeQuery.listComments(postId, options);
  }

  deleteTreeholePost(postId: number) {
    return this.treeholeCommands.deletePost(postId);
  }

  deleteTreeholeComment(commentId: number) {
    return this.treeholeCommands.deleteComment(commentId);
  }
}
