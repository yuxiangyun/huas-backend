/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、TreeholeMediaReader、Treehole policy 与管理查询 adapter
 * [OUTPUT]: 对外提供 SQLiteTreeholeOperationsQuery，执行含管理图片 URL 的安全分页的后台帖子列表、详情及评论公共作者只读查询
 * [POS]: treehole/infrastructure 的公开只读 adapter，让 Operations 不接触 Treehole 表、媒体路径或校园身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { resolvePagination } from '../../../utils/pagination';
import type { CommunityProfileReader } from '../../community/domain/ports';
import type { TreeholeMediaReader } from '../domain/ports';
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
    media: TreeholeMediaReader,
    private readonly policy: TreeholePolicy,
  ) {
    this.query = new SQLiteTreeholeAdminPersistence(db, profiles, media);
  }

  getPost(postId: number) { return this.query.getPost(postId); }

  listPosts(options: AdminTreeholePostListOptions) {
    return this.query.listPosts({
      ...options,
      ...resolvePagination(options, this.policy.defaultPageSize, this.policy.maxPageSize),
    });
  }

  listComments(postId: number, options: AdminTreeholeCommentListOptions) {
    return this.query.listComments(postId, {
      ...resolvePagination(options, this.policy.defaultCommentPageSize, this.policy.maxCommentPageSize),
    });
  }
}
