import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import { Logger } from '../../utils/logger';
import { DiscoverMediaService } from './media-service';

export class DiscoverAdminService {
  static async deletePost(postId: number) {
    const db = getDb();
    const now = new Date();
    const updated = await db.update(schema.discoverPosts)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(schema.discoverPosts.id, postId),
        isNull(schema.discoverPosts.deletedAt),
      ))
      .returning({
        id: schema.discoverPosts.id,
        storageKey: schema.discoverPosts.storageKey,
      });

    await this.cleanupDeletedPostStorage(updated[0]);

    return updated[0] ? { id: updated[0].id } : null;
  }

  private static async cleanupDeletedPostStorage(post?: { id: number; storageKey: string } | null) {
    if (!post) return;

    try {
      await DiscoverMediaService.removeStorage(post.storageKey);
    } catch (err: any) {
      Logger.error('DiscoverService', `帖子 ${post.id} 删除后清理图片失败`, err);
    }
  }
}
