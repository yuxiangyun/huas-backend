/**
 * [INPUT]: 依赖 Operations 管理命令端口与 Discover/Treehole canonical application 实例
 * [OUTPUT]: 对外提供 DiscoverAdminCommandAdapter、TreeholeAdminCommandAdapter
 * [POS]: operations/infrastructure 的跨域命令 adapter，保持 Operations → 业务领域单向依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { discoverApplicationService } from '../../discover/composition';
import { treeholeApplicationService } from '../../treehole/composition';
import type { DiscoverAdminCommandPort, TreeholeAdminCommandPort } from '../domain/ports';

export class DiscoverAdminCommandAdapter implements DiscoverAdminCommandPort {
  deletePost(postId: number) {
    return discoverApplicationService.deletePost(postId);
  }
}

export class TreeholeAdminCommandAdapter implements TreeholeAdminCommandPort {
  deletePost(postId: number) {
    return treeholeApplicationService.adminDeletePost(postId);
  }

  deleteComment(commentId: number) {
    return treeholeApplicationService.adminDeleteComment(commentId);
  }
}
