/**
 * [INPUT]: 依赖 Drizzle SQLite、Discover domain port，以及同层帖子/评论/推荐查询事务实现
 * [OUTPUT]: 对外提供实现 DiscoverPersistence 的单一 SQLiteDiscoverPersistence adapter
 * [POS]: modules/discover/infrastructure 的持久化总边界，application 不感知其内部分责文件
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../../../db';
import type { ListOptions, PersistDiscoverCommentInput, PersistDiscoverPostInput } from '../domain/discover';
import type { DiscoverPersistence } from '../domain/ports';
import { DiscoverCommentService } from './sqlite-discover-comment-service';
import { DiscoverPostService } from './sqlite-discover-post-service';
import { DiscoverRecommendationService } from './sqlite-discover-recommendation-service';

export class SQLiteDiscoverPersistence implements DiscoverPersistence {
  async createPost(input: PersistDiscoverPostInput) {
    const now = new Date();
    const inserted = await getDb().insert(schema.discoverPosts).values({
      userId: input.userId,
      title: input.title,
      storeName: input.storeName,
      priceText: input.priceText,
      content: input.content,
      category: input.category,
      storageKey: input.media.storageKey,
      imagesJson: JSON.stringify(input.media.images),
      tagsJson: JSON.stringify(input.tags),
      coverUrl: input.media.coverUrl,
      imageCount: input.media.images.length,
      commentCount: 0,
      ratingCount: 0,
      ratingSum: 0,
      ratingAvg: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.discoverPosts.id });
    return inserted[0].id;
  }

  getPostDetail(userId: number, postId: number) {
    return DiscoverPostService.getDetail(userId, postId);
  }

  listPosts(sort: 'latest' | 'score', options: ListOptions) {
    return DiscoverPostService.list(sort, options);
  }

  listMyPosts(options: ListOptions) {
    return DiscoverPostService.listMine(options);
  }

  listRecommendedPosts(options: ListOptions) {
    return DiscoverRecommendationService.list(options);
  }

  ratePost(userId: number, postId: number, score: number) {
    return DiscoverPostService.rate(userId, postId, score);
  }

  listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return DiscoverCommentService.list(userId, postId, options);
  }

  createComment(input: PersistDiscoverCommentInput) {
    return DiscoverCommentService.create(input);
  }

  deleteComment(commentId: number, userId: number) {
    return DiscoverCommentService.delete(commentId, userId);
  }

  async deletePost(postId: number, userId?: number) {
    const now = new Date();
    const filters = [
      eq(schema.discoverPosts.id, postId),
      isNull(schema.discoverPosts.deletedAt),
    ];
    if (userId !== undefined) filters.push(eq(schema.discoverPosts.userId, userId));
    const updated = await getDb().update(schema.discoverPosts)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(...filters))
      .returning({ id: schema.discoverPosts.id, storageKey: schema.discoverPosts.storageKey });
    return updated[0] ?? null;
  }
}
