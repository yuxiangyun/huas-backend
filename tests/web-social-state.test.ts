/**
 * [INPUT]: 依赖 Web Social 路由原子切换、Discover 缓存策略与通知快照校准纯规则
 * [OUTPUT]: 覆盖私信单一目标、资料/详情互斥、服务端排序/分页失效及通知删除感知
 * [POS]: tests 的无 DOM Web Social 状态测试，验证跨组件读模型不变量而非视觉实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, test } from 'bun:test';
import {
  reconcileCreatedDiscoverComment,
  reconcileDiscoverLike,
} from '../web/src/entities/discover/api/discover-cache-policy';
import { shouldReconcileNotificationSnapshot } from '../web/src/entities/notifications/model/notification-reconciliation';
import {
  selectMessageTarget,
  selectSocialPost,
} from '../web/src/pages/social-route-state';

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
});

describe('Web Discover cache policy', () => {
  test('patches like feedback and invalidates server-owned public ordering', () => {
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
    expect(invalidated).toContainEqual(['discover', 'list']);
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
