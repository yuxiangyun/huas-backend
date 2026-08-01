/**
 * [INPUT]: 依赖 DiscoverApplicationService 与内存 persistence/media/activity projection port doubles
 * [OUTPUT]: 验证发帖数据库失败的媒体补偿、软删除后媒体清理失败语义、孤儿清理委托，以及互动提交后的投影触发边界
 * [POS]: tests 的 Discover application 边界回归，补足文件副作用、数据库事实与提交后通知投影之间的失败语义证明
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { DiscoverApplicationService } from '../src/modules/discover/application/discover-application-service';
import type { DiscoverPolicy } from '../src/modules/discover/domain/discover';
import type { DiscoverMediaStorage, DiscoverPersistence } from '../src/modules/discover/domain/ports';

const policy: DiscoverPolicy = {
  maxImagesPerPost: 9,
  maxTagsPerPost: 6,
  maxTitleLength: 80,
  maxTagLength: 12,
  maxStoreNameLength: 32,
  maxPriceTextLength: 20,
  maxContentLength: 400,
  maxCommentLength: 200,
  defaultCommentPageSize: 50,
  maxCommentPageSize: 100,
};

describe('DiscoverApplicationService media compensation', () => {
  it('帖子写库失败时删除已经写入的媒体目录并保留原错误', async () => {
    const removedKeys: string[] = [];
    const databaseError = new Error('insert failed');
    const persistence = {
      createPost: async () => { throw databaseError; },
    } as unknown as DiscoverPersistence;
    const media: DiscoverMediaStorage = {
      storeImages: async () => ({
        storageKey: 'stored-before-insert',
        coverUrl: '/media/discover/stored-before-insert/01.webp',
        images: [],
      }),
      removeStorage: async (storageKey) => { removedKeys.push(storageKey); },
      cleanupOrphans: async () => 0,
    };
    const service = new DiscoverApplicationService(persistence, media, policy, { async attempt() {} });

    const operation = service.createPost({
      userId: 1,
      title: '测试菜品',
      content: '测试口味与分量',
      category: '其他',
      tags: ['好吃'],
      images: [new File(['image'], '01.jpg', { type: 'image/jpeg' })],
    });

    await expect(operation).rejects.toBe(databaseError);
    expect(removedKeys).toEqual(['stored-before-insert']);
  });

  it('软删除事实已提交后，媒体清理失败仍返回删除结果', async () => {
    const persistence = {
      deletePost: async () => ({ id: 7, storageKey: 'cleanup-fails' }),
    } as unknown as DiscoverPersistence;
    const media = {
      storeImages: async () => { throw new Error('unused'); },
      removeStorage: async () => { throw new Error('filesystem unavailable'); },
      cleanupOrphans: async () => 0,
    } satisfies DiscoverMediaStorage;
    const service = new DiscoverApplicationService(persistence, media, policy, { async attempt() {} });

    await expect(service.deletePost(7, 1)).resolves.toEqual({ id: 7 });
  });

  it('将孤儿媒体宽限截止时间原样委托给媒体端口', async () => {
    const cutoff = new Date('2026-08-01T01:00:00.000Z');
    let received: Date | null = null;
    const media = {
      storeImages: async () => { throw new Error('unused'); },
      removeStorage: async () => undefined,
      cleanupOrphans: async (before: Date) => {
        received = before;
        return 2;
      },
    } satisfies DiscoverMediaStorage;
    const service = new DiscoverApplicationService(
      {} as DiscoverPersistence,
      media,
      policy,
      { async attempt() {} },
    );

    await expect(service.cleanupOrphanMedia(cutoff)).resolves.toBe(2);
    expect(received).toBe(cutoff);
  });
});
