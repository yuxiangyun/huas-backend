/**
 * [INPUT]: 依赖 Web Social 路由原子切换/部署前缀归一化、Discover 缓存策略与通知快照校准纯规则
 * [OUTPUT]: 覆盖私信单一目标/历史增量合并、资料详情互斥、部署前缀、Discover 原位乐观点赞与通知删除感知
 * [POS]: tests 的无 DOM Web Social 状态测试，验证跨组件读模型不变量而非视觉实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, test } from 'bun:test';
import {
  reconcileCreatedDiscoverComment,
  reconcileDiscoverLike,
  optimisticallyReconcileDiscoverLike,
} from '../web/src/entities/discover/api/discover-cache-policy';
import { shouldReconcileNotificationSnapshot } from '../web/src/entities/notifications/model/notification-reconciliation';
import { mergeMessagesIntoHistoryData } from '../web/src/entities/messaging/api/messaging-cache-policy';
import type { Message } from '../web/src/entities/messaging/model/messaging-types';
import { isSupportedUploadImage, prepareUploadImages } from '../web/src/shared/lib/image-upload-processing';
import {
  selectMessageTarget,
  selectSocialPost,
} from '../web/src/pages/social-route-state';
import { normalizeSocialPathname } from '../web/src/widgets/mobile-tab-shell/mobile-tab-shell';

describe('Web Social route state', () => {
  test('opens a post and closes the public profile in one URL transition', () => {
    const params = new URLSearchParams('sort=popular&profileUserId=17');

    selectSocialPost(params, 42);

    expect(params.toString()).toBe('sort=popular&postId=42');
  });

  test('keeps userId as the only messaging target fact', () => {
    const params = new URLSearchParams('conversationId=9&userId=7&tab=notifications');

    selectMessageTarget(params, 17);

    expect(params.get('userId')).toBe('17');
    expect(params.has('conversationId')).toBe(false);
  });

  test('normalizes both router-relative and basename-prefixed Social paths', () => {
    expect(normalizeSocialPathname('/messages')).toBe('/messages');
    expect(normalizeSocialPathname('/m/messages')).toBe('/messages');
    expect(normalizeSocialPathname('/mobile/messages')).toBe('/mobile/messages');
  });
});

describe('Web Messaging history cache', () => {
  const message = (id: number): Message => ({
    id,
    conversationId: 9,
    clientMessageId: `client-${id}`,
    sender: { id: 1, displayName: '同学', avatarUrl: null },
    text: `message-${id}`,
    images: [],
    createdAt: new Date(id * 1_000).toISOString(),
  });

  test('keeps a sent message across immediate reopen and retains earlier-history pagination', () => {
    const data = mergeMessagesIntoHistoryData(undefined, 9, [message(30)], true, true);
    expect(data?.pages[0]?.items.map((item) => item.id)).toEqual([30]);
    expect(data?.pages[0]?.hasMore).toBe(true);
    expect(data?.pages[0]?.beforeMessageId).toBe(30);
  });

  test('merges incoming changes into the latest page without replacing older pages', () => {
    const data = mergeMessagesIntoHistoryData({
      pages: [
        { conversationId: 9, items: [message(20)], beforeMessageId: 20, afterMessageId: 20, hasMore: true },
        { conversationId: 9, items: [message(10)], beforeMessageId: 10, afterMessageId: 10, hasMore: false },
      ],
      pageParams: [null, 20],
    }, 9, [message(21)]);
    expect(data?.pages[0]?.items.map((item) => item.id)).toEqual([20, 21]);
    expect(data?.pages[1]?.items.map((item) => item.id)).toEqual([10]);
    expect(data?.pageParams).toEqual([null, 20]);
  });
});

describe('Web Social upload preparation', () => {
  test('rejects unlisted image containers instead of relying on a broad image MIME prefix', () => {
    expect(isSupportedUploadImage(new File(['<svg/>'], 'vector.svg', { type: 'image/svg+xml' }))).toBe(false);
    expect(isSupportedUploadImage(new File(['jpg'], 'photo.jpg', { type: 'image/jpeg' }))).toBe(true);
    expect(isSupportedUploadImage(new File(['heic'], 'phone.heic', { type: '' }))).toBe(true);
  });

  test('rejects an image before upload when the browser cannot reach the output-byte target', async () => {
    const oversized = new File([new Uint8Array(1024 * 1024 + 1)], 'photo.heic', { type: 'image/heic' });
    await expect(prepareUploadImages([oversized], {
      maxFiles: 1,
      maxInputBytes: 2 * 1024 * 1024,
      maxTotalBytes: 2 * 1024 * 1024,
      maxPixels: 16_000_000,
      maxOutputBytes: 1024 * 1024,
      maxDimension: 2_048,
      quality: 0.82,
    })).rejects.toThrow('1 MB');
  });
});

describe('Web Discover cache policy', () => {
  test('patches like feedback in place without immediately refetching server-owned ordering', () => {
    let publicList: unknown = {
      pages: [{ items: [{ id: 42, likedByMe: false, likeCount: 1 }] }],
      pageParams: [1],
    };
    const invalidated: Array<readonly unknown[]> = [];
    const cache = {
      setQueryData: () => undefined,
      setQueriesData: (
        filters: { queryKey?: readonly unknown[] },
        updater: (value: unknown) => unknown,
      ) => {
        if (filters.queryKey?.join('/') === 'discover/list') {
          publicList = updater(publicList);
        }
        return [];
      },
      invalidateQueries: (filters: { queryKey?: readonly unknown[] }) => {
        if (filters.queryKey) invalidated.push(filters.queryKey);
        return Promise.resolve();
      },
    };

    reconcileDiscoverLike(
      cache as unknown as Parameters<typeof reconcileDiscoverLike>[0],
      { postId: 42, liked: true, likeCount: 2 },
    );

    expect((publicList as any).pages[0].items[0]).toMatchObject({
      likedByMe: true,
      likeCount: 2,
    });
    expect(invalidated).not.toContainEqual(['discover', 'list']);
  });

  test('applies an immediate optimistic like count before the response arrives', () => {
    let publicList: unknown = {
      pages: [{ items: [{ id: 42, likedByMe: false, likeCount: 1 }] }],
      pageParams: [1],
    };
    const cache = {
      setQueryData: () => undefined,
      setQueriesData: (
        filters: { queryKey?: readonly unknown[] },
        updater: (value: unknown) => unknown,
      ) => {
        if (filters.queryKey?.join('/') === 'discover/list') publicList = updater(publicList);
        return [];
      },
      invalidateQueries: () => Promise.resolve(),
    };

    optimisticallyReconcileDiscoverLike(
      cache as unknown as Parameters<typeof optimisticallyReconcileDiscoverLike>[0],
      42,
      true,
    );

    expect((publicList as any).pages[0].items[0]).toMatchObject({ likedByMe: true, likeCount: 2 });
  });

  test('invalidates ascending comment pagination instead of appending to a loaded page', () => {
    const invalidated: Array<readonly unknown[]> = [];
    const cache = {
      setQueryData: () => undefined,
      setQueriesData: () => [],
      invalidateQueries: (filters: { queryKey?: readonly unknown[] }) => {
        if (filters.queryKey) invalidated.push(filters.queryKey);
        return Promise.resolve();
      },
    };

    reconcileCreatedDiscoverComment(
      cache as unknown as Parameters<typeof reconcileCreatedDiscoverComment>[0],
      42,
    );

    expect(invalidated).toContainEqual(['discover', 'comments', 42]);
  });
});

describe('Web notification reconciliation', () => {
  test('reconciles only when both totals exist and differ', () => {
    expect(shouldReconcileNotificationSnapshot(3, 2)).toBe(true);
    expect(shouldReconcileNotificationSnapshot(2, 2)).toBe(false);
    expect(shouldReconcileNotificationSnapshot(null, 2)).toBe(false);
    expect(shouldReconcileNotificationSnapshot(2, null)).toBe(false);
  });
});
