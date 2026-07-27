/**
 * [INPUT]: 依赖 Treehole canonical composition/http/domain 与 routes/services 旧路径 Facade
 * [OUTPUT]: 验证旧类名、媒体常量、路由引用一致及 application 依赖方向
 * [POS]: tests 的 Treehole 迁移兼容护栏，防止新模块反向依赖旧层或 Discover
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import canonicalRoute from '../src/modules/treehole/http/treehole.routes';
import {
  TreeholeAdminService as CanonicalAdminService,
  TreeholeAvatarMediaService as CanonicalAvatarMediaService,
  TreeholeService as CanonicalService,
  TreeholeUserService as CanonicalUserService,
  TREEHOLE_AVATAR_CACHE_CONTROL as canonicalCacheControl,
} from '../src/modules/treehole/composition';
import legacyRoute from '../src/routes/treehole/treehole.routes';
import { TreeholeAdminService as LegacyAdminService } from '../src/services/treehole/treehole-admin-service';
import {
  TreeholeAvatarMediaService as LegacyAvatarMediaService,
  TREEHOLE_AVATAR_CACHE_CONTROL as legacyCacheControl,
} from '../src/services/treehole/treehole-avatar-media-service';
import { TreeholeService as LegacyService } from '../src/services/treehole/treehole-service';
import {
  clampCommentPageSize as legacyClampCommentPageSize,
  clampPageSize as legacyClampPageSize,
  getTreeholeMeta as legacyGetTreeholeMeta,
  normalizeCommentContent as legacyNormalizeCommentContent,
  normalizePostContent as legacyNormalizePostContent,
  postSelect as legacyPostSelect,
  refreshPostCommentCount as legacyRefreshPostCommentCount,
} from '../src/services/treehole/treehole-shared';
import { TreeholeUserService as LegacyUserService } from '../src/services/treehole/treehole-user-service';
import {
  postSelect as canonicalPostSelect,
  refreshPostCommentCount as canonicalRefreshPostCommentCount,
} from '../src/modules/treehole/infrastructure/sqlite-treehole-support';

describe('treehole compatibility', () => {
  it('旧 route、用户/管理服务与头像媒体出口直接指向 canonical 实现', () => {
    expect(legacyRoute).toBe(canonicalRoute);
    expect(LegacyService).toBe(CanonicalService);
    expect(LegacyUserService).toBe(CanonicalUserService);
    expect(LegacyAdminService).toBe(CanonicalAdminService);
    expect(LegacyAvatarMediaService).toBe(CanonicalAvatarMediaService);
    expect(legacyCacheControl).toBe(canonicalCacheControl);
  });

  it('旧 shared 保留全部 SQL helper 与无 policy 参数调用签名', () => {
    expect(legacyPostSelect).toBe(canonicalPostSelect);
    expect(legacyRefreshPostCommentCount).toBe(canonicalRefreshPostCommentCount);
    expect(legacyGetTreeholeMeta()).toEqual(CanonicalService.getMeta());
    expect(legacyClampPageSize(undefined)).toBe(CanonicalService.getMeta().pagination.defaultPageSize);
    expect(legacyClampCommentPageSize(undefined)).toBe(
      CanonicalService.getMeta().pagination.defaultCommentPageSize,
    );
    expect(legacyNormalizePostContent('  旧帖子  ')).toBe('旧帖子');
    expect(legacyNormalizeCommentContent('  旧评论  ')).toBe('旧评论');
  });

  it('application 只依赖 domain ports，canonical 模块不反向依赖旧层或 Discover', () => {
    const applicationSource = readFileSync(
      new URL('../src/modules/treehole/application/treehole-application-service.ts', import.meta.url),
      'utf8',
    );
    expect(applicationSource).not.toContain('/infrastructure/');
    expect(applicationSource).not.toContain("from '../infrastructure");

    const moduleSources = [
      'composition.ts',
      'legacy-shared.ts',
      'domain/treehole.ts',
      'domain/ports.ts',
      'application/treehole-application-service.ts',
      'http/treehole.routes.ts',
      'infrastructure/sqlite-treehole-persistence.ts',
      'infrastructure/sqlite-treehole-user-persistence.ts',
      'infrastructure/sqlite-treehole-admin-persistence.ts',
      'infrastructure/sqlite-treehole-support.ts',
      'infrastructure/treehole-avatar-media-storage.ts',
    ].map((path) => readFileSync(new URL(`../src/modules/treehole/${path}`, import.meta.url), 'utf8'));

    for (const source of moduleSources) {
      expect(source).not.toMatch(/services\/treehole|routes\/treehole|modules\/discover/);
    }
  });
});
