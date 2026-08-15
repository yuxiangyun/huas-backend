/**
 * [INPUT]: 依赖构造注入的 Drizzle db、CommunityProfileReader、ActivityOutboxWriter、DiscoverPolicy 与同层帖子/评论/推荐实例
 * [OUTPUT]: 对外提供实现 DiscoverPersistence 的 SQLiteDiscoverPersistence 聚合 adapter，删帖与互动事件撤回同事务
 * [POS]: modules/discover/infrastructure 的持久化总边界，统一持有本切片实例图且不读取全局 getDb
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '../../../db';
import type { CommunityProfileReader } from '../../community/domain/ports';
import type { ActivityOutboxWriter } from '../../notifications/domain/ports';
import type {
  DiscoverPolicy,
  ListOptions,
  PersistDiscoverCommentInput,
  PersistDiscoverPostInput,
} from '../domain/discover';
import type { DiscoverPersistence } from '../domain/ports';
import { SQLiteDiscoverCommentService } from './sqlite-discover-comment-service';
import type { DiscoverDatabase, DiscoverTransaction } from './discover-mapping';
import { DiscoverPostQuery, SQLiteDiscoverPostService } from './sqlite-discover-post-service';
import { SQLiteDiscoverRecommendationService } from './sqlite-discover-recommendation-service';

export class SQLiteDiscoverPersistence implements DiscoverPersistence {
  private readonly posts: SQLiteDiscoverPostService;
  private readonly comments: SQLiteDiscoverCommentService;
  private readonly recommendations: SQLiteDiscoverRecommendationService;
  private readonly outbox: ActivityOutboxWriter<DiscoverTransaction>;

  constructor(
    private readonly db: DiscoverDatabase,
    profileReader: CommunityProfileReader,
    policy: DiscoverPolicy,
    outbox: ActivityOutboxWriter<DiscoverTransaction>,
  ) {
    const postQuery = new DiscoverPostQuery(db, profileReader);
    this.outbox = outbox;
    this.posts = new SQLiteDiscoverPostService(db, postQuery, outbox);
    this.comments = new SQLiteDiscoverCommentService(db, postQuery, profileReader, policy, outbox);
    this.recommendations = new SQLiteDiscoverRecommendationService(
      db,
      postQuery,
      this.posts,
      policy.recommendationCandidateLimit,
    );
  }

  async createPost(input: PersistDiscoverPostInput) {
    const now = new Date();
    const inserted = await this.db.insert(schema.discoverPosts).values({
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
      likeCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      deletedAt: null,
    }).returning({ id: schema.discoverPosts.id });
    return inserted[0].id;
  }

  getPostDetail(userId: number, postId: number) {
    return this.posts.getDetail(userId, postId);
  }

  listPosts(sort: 'latest' | 'popular', options: ListOptions) {
    return this.posts.list(sort, options);
  }

  listUserPosts(targetUserId: number, options: ListOptions) {
    return this.posts.listByUser(targetUserId, options);
  }

  listRecommendedPosts(options: ListOptions) {
    return this.recommendations.list(options);
  }

  likePost(userId: number, postId: number) {
    return this.posts.like(userId, postId);
  }

  unlikePost(userId: number, postId: number) {
    return this.posts.unlike(userId, postId);
  }

  listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }) {
    return this.comments.list(userId, postId, options);
  }

  createComment(input: PersistDiscoverCommentInput) {
    return this.comments.create(input);
  }

  deleteComment(commentId: number, userId: number) {
    return this.comments.delete(commentId, userId);
  }

  async deletePost(postId: number, userId?: number) {
    return this.db.transaction((tx) => {
      const now = new Date();
      const filters = [
        eq(schema.discoverPosts.id, postId),
        isNull(schema.discoverPosts.deletedAt),
      ];
      if (userId !== undefined) filters.push(eq(schema.discoverPosts.userId, userId));
      const updated = tx.update(schema.discoverPosts)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(...filters))
        .returning({ id: schema.discoverPosts.id, storageKey: schema.discoverPosts.storageKey })
        .all();
      if (!updated[0]) return null;

      this.outbox.removeResource(tx, 'discover_post', postId);
      return updated[0];
    });
  }
}
