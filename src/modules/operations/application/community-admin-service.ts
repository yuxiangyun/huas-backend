/**
 * [INPUT]: 依赖 Treehole 公开只读/私有媒体 ports 与构造注入的 Discover/Treehole 管理命令端口
 * [OUTPUT]: 对外提供 CommunityAdminApplicationService，编排社区管理查询、帖子图片只读与软删除
 * [POS]: operations/application 的社区管理用例，读模型/媒体经所属领域 port，写操作经命令 adapter
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { TreeholeOperationsQueryPort } from '../../treehole/domain/operations-query';
import type { TreeholeMediaReader } from '../../treehole/domain/ports';
import type { AdminTreeholeCommentListOptions, AdminTreeholePostListOptions } from '../../treehole/domain/treehole';
import type { DiscoverAdminCommandPort, TreeholeAdminCommandPort } from '../domain/ports';

export class CommunityAdminApplicationService {
  constructor(
    private readonly treeholeQuery: TreeholeOperationsQueryPort,
    private readonly treeholeMedia: Pick<TreeholeMediaReader, 'getForAdmin'>,
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

  getTreeholeMedia(mediaKey: string, fileName: string) {
    return this.treeholeMedia.getForAdmin(mediaKey, fileName);
  }

  deleteTreeholePost(postId: number) {
    return this.treeholeCommands.deletePost(postId);
  }

  deleteTreeholeComment(commentId: number) {
    return this.treeholeCommands.deleteComment(commentId);
  }
}
