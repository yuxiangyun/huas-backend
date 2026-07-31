/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、Treehole policy 与管理查询 adapter
 * [OUTPUT]: 对外提供 SQLiteTreeholeOperationsQuery，执行后台帖子/评论公共作者只读查询
 * [POS]: treehole/infrastructure 的公开只读 adapter，让 Operations 不接触 Treehole 表或校园身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfileReader } from '../../community/domain/ports';
import { clampCommentPageSize, clampPage, clampPageSize } from '../domain/treehole';
import type { TreeholeOperationsQueryPort } from '../domain/operations-query';
import type {
  AdminTreeholeCommentListOptions,
  AdminTreeholePostListOptions,
  TreeholePolicy,
} from '../domain/treehole';
import { SQLiteTreeholeAdminPersistence } from './sqlite-treehole-admin-persistence';
import type { TreeholeDatabase } from './sqlite-treehole-support';

export class SQLiteTreeholeOperationsQuery implements TreeholeOperationsQueryPort {
  private readonly query: SQLiteTreeholeAdminPersistence;

  constructor(
    db: TreeholeDatabase,
    profiles: CommunityProfileReader,
    private readonly policy: TreeholePolicy,
  ) {
    this.query = new SQLiteTreeholeAdminPersistence(db, profiles);
  }

  listPosts(options: AdminTreeholePostListOptions) {
    return this.query.listPosts({
      ...options,
      page: clampPage(options.page),
      pageSize: clampPageSize(options.pageSize, this.policy),
    });
  }

  listComments(postId: number, options: AdminTreeholeCommentListOptions) {
    return this.query.listComments(postId, {
      page: clampPage(options.page),
      pageSize: clampCommentPageSize(options.pageSize, this.policy),
    });
  }
}
