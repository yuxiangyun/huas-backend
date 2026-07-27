/**
 * [INPUT]: 依赖 Treehole operations query 契约、管理查询 adapter 与分页规则配置
 * [OUTPUT]: 对外提供 SQLiteTreeholeOperationsQuery，执行后台帖子/评论只读查询
 * [POS]: treehole/infrastructure 的公开只读 adapter，复用模块内管理 SQL 而不暴露持久化写能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { clampCommentPageSize, clampPage, clampPageSize } from '../domain/treehole';
import type { TreeholeOperationsQueryPort } from '../domain/operations-query';
import type { AdminTreeholeCommentListOptions, AdminTreeholePostListOptions } from '../domain/treehole';
import { SQLiteTreeholeAdminPersistence } from './sqlite-treehole-admin-persistence';

const policy = {
  maxPostLength: config.treehole.maxPostLength,
  maxCommentLength: config.treehole.maxCommentLength,
  defaultPageSize: config.treehole.defaultPageSize,
  maxPageSize: config.treehole.maxPageSize,
  defaultCommentPageSize: config.treehole.defaultCommentPageSize,
  maxCommentPageSize: config.treehole.maxCommentPageSize,
};

export class SQLiteTreeholeOperationsQuery implements TreeholeOperationsQueryPort {
  private readonly query = new SQLiteTreeholeAdminPersistence();

  listPosts(options: AdminTreeholePostListOptions) {
    return this.query.listPosts({
      ...options,
      page: clampPage(options.page),
      pageSize: clampPageSize(options.pageSize, policy),
    });
  }

  listComments(postId: number, options: AdminTreeholeCommentListOptions) {
    return this.query.listComments(postId, {
      page: clampPage(options.page),
      pageSize: clampCommentPageSize(options.pageSize, policy),
    });
  }
}
