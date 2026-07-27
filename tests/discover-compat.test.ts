/**
 * [INPUT]: 依赖 Discover canonical composition/http/infrastructure 与 routes/services/utils 旧 Facade
 * [OUTPUT]: 验证旧类名、媒体、路由和工具导出与 canonical 实现保持运行时引用一致
 * [POS]: tests 的 Discover 迁移兼容回归，防止旧入口生成实现副本或反向依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import canonicalRoute from '../src/modules/discover/http/discover.routes';
import {
  DiscoverAdminService as CanonicalAdminService,
  DiscoverCommentService as CanonicalCommentService,
  DiscoverPostService as CanonicalPostService,
  DiscoverRecommendationService as CanonicalRecommendationService,
  DiscoverService as CanonicalService,
  DiscoverUserService as CanonicalUserService,
} from '../src/modules/discover/composition';
import {
  DISCOVER_MEDIA_CACHE_CONTROL as CANONICAL_CACHE_CONTROL,
  DiscoverMediaService as CanonicalMediaService,
} from '../src/modules/discover/infrastructure/discover-media-service';
import legacyRoute from '../src/routes/discover/discover.routes';
import { DiscoverAdminService } from '../src/services/discover/discover-admin-service';
import { DiscoverCommentService } from '../src/services/discover/discover-comment-service';
import { DiscoverPostService } from '../src/services/discover/discover-post-service';
import { DiscoverRecommendationService } from '../src/services/discover/discover-recommendation-service';
import { DiscoverService } from '../src/services/discover/discover-service';
import { DiscoverUserService } from '../src/services/discover/discover-user-service';
import { DISCOVER_MEDIA_CACHE_CONTROL, DiscoverMediaService } from '../src/services/discover/media-service';

describe('Discover compatibility facades', () => {
  it('旧 routes/services 类只再导出 canonical application', () => {
    expect(legacyRoute).toBe(canonicalRoute);
    expect(DiscoverService).toBe(CanonicalService);
    expect(DiscoverUserService).toBe(CanonicalUserService);
    expect(DiscoverPostService).toBe(CanonicalPostService);
    expect(DiscoverCommentService).toBe(CanonicalCommentService);
    expect(DiscoverRecommendationService).toBe(CanonicalRecommendationService);
    expect(DiscoverAdminService).toBe(CanonicalAdminService);
  });

  it('旧媒体路径继续导出 canonical infrastructure adapter', () => {
    expect(DiscoverMediaService).toBe(CanonicalMediaService);
    expect(DISCOVER_MEDIA_CACHE_CONTROL).toBe(CANONICAL_CACHE_CONTROL);
  });
});
