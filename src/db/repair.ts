/**
 * [INPUT]: 依赖 Bun SQLite 对 Discover/Treehole 事实表执行聚合核对与事务更新
 * [OUTPUT]: 对外提供幂等 repairDerivedCounts，并支持无写入 dry-run
 * [POS]: db 的显式数据修复边界，把昂贵派生计数校准移出普通应用启动
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { Database } from 'bun:sqlite';

export interface RepairSummary {
  dryRun: boolean;
  discoverPosts: number;
  treeholePosts: number;
}

const discoverMismatch = `
  SELECT count(*) AS count
  FROM discover_posts AS posts
  WHERE posts.comment_count <> (
      SELECT count(*) FROM discover_comments AS comments
      WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
    )
    OR posts.rating_count <> (
      SELECT count(*) FROM discover_post_ratings AS ratings WHERE ratings.post_id = posts.id
    )
    OR posts.rating_sum <> (
      SELECT coalesce(sum(score), 0) FROM discover_post_ratings AS ratings WHERE ratings.post_id = posts.id
    )
    OR posts.rating_avg <> (
      SELECT round(coalesce(avg(score), 0), 2) FROM discover_post_ratings AS ratings WHERE ratings.post_id = posts.id
    )
`;

const treeholeMismatch = `
  SELECT count(*) AS count
  FROM treehole_posts AS posts
  WHERE posts.like_count <> (
      SELECT count(*) FROM treehole_post_likes AS likes WHERE likes.post_id = posts.id
    )
    OR posts.comment_count <> (
      SELECT count(*) FROM treehole_comments AS comments
      WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
    )
`;

function count(database: Database, query: string): number {
  return Number((database.query(query).get() as { count: number }).count);
}

export function repairDerivedCounts(database: Database, options: { dryRun?: boolean } = {}): RepairSummary {
  const summary: RepairSummary = {
    dryRun: Boolean(options.dryRun),
    discoverPosts: count(database, discoverMismatch),
    treeholePosts: count(database, treeholeMismatch),
  };
  if (summary.dryRun || (summary.discoverPosts === 0 && summary.treeholePosts === 0)) return summary;

  const repair = database.transaction(() => {
    database.exec(`UPDATE discover_posts AS posts SET
      comment_count = (
        SELECT count(*) FROM discover_comments AS comments
        WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
      ),
      rating_count = (
        SELECT count(*) FROM discover_post_ratings AS ratings WHERE ratings.post_id = posts.id
      ),
      rating_sum = (
        SELECT coalesce(sum(score), 0) FROM discover_post_ratings AS ratings WHERE ratings.post_id = posts.id
      ),
      rating_avg = (
        SELECT round(coalesce(avg(score), 0), 2) FROM discover_post_ratings AS ratings WHERE ratings.post_id = posts.id
      )
      WHERE id IN (SELECT id FROM discover_posts AS candidates WHERE
        candidates.comment_count <> (SELECT count(*) FROM discover_comments WHERE post_id = candidates.id AND deleted_at IS NULL)
        OR candidates.rating_count <> (SELECT count(*) FROM discover_post_ratings WHERE post_id = candidates.id)
        OR candidates.rating_sum <> (SELECT coalesce(sum(score), 0) FROM discover_post_ratings WHERE post_id = candidates.id)
        OR candidates.rating_avg <> (SELECT round(coalesce(avg(score), 0), 2) FROM discover_post_ratings WHERE post_id = candidates.id)
      )`);
    database.exec(`UPDATE treehole_posts AS posts SET
      like_count = (SELECT count(*) FROM treehole_post_likes AS likes WHERE likes.post_id = posts.id),
      comment_count = (
        SELECT count(*) FROM treehole_comments AS comments
        WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
      )
      WHERE id IN (SELECT id FROM treehole_posts AS candidates WHERE
        candidates.like_count <> (SELECT count(*) FROM treehole_post_likes WHERE post_id = candidates.id)
        OR candidates.comment_count <> (SELECT count(*) FROM treehole_comments WHERE post_id = candidates.id AND deleted_at IS NULL)
      )`);
  });
  repair.immediate();
  return summary;
}
