/**
 * [INPUT]: 依赖各 canonical 模块公开构造器/ports、唯一数据库实例、运行配置、观测器、媒体端口与周期任务注册器
 * [OUTPUT]: 对外提供 createApplicationComposition，集中生成 Early Rising、公开 Discover 读表、认证社交/Operations、周期任务与关闭钩子
 * [POS]: src 的唯一跨模块组合根；仅在此把 Community 详细资料 reader 注入 Early Rising，并把其设置端口注入 Operations 管理面
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { AppDependencies } from './app';
import { dirname, join } from 'node:path';
import { CredentialManager } from './auth/credential-manager';
import { config } from './config';
import { getDb } from './db';
import { CacheService } from './modules/cache/cache-service';
import { configureHttpClientObservers } from './modules/campus-integrations/http/http-client';
import { CommunityApplicationService } from './modules/community/application/community-application-service';
import { createCommunityRoutes } from './modules/community/http/community.routes';
import {
  CommunityAvatarMediaStorage,
  COMMUNITY_AVATAR_CACHE_CONTROL,
} from './modules/community/infrastructure/community-avatar-media-storage';
import { SQLiteCommunityProfileRepository } from './modules/community/infrastructure/sqlite-community-profile-repository';
import { createDiscoverModule } from './modules/discover/composition';
import { createEarlyRisingModule } from './modules/early-rising/composition';
import { DISCOVER_MEDIA_CACHE_CONTROL } from './modules/discover/infrastructure/discover-media-service';
import { loginApplicationService } from './modules/identity/http/auth.routes';
import { SQLiteCommunityIdentityReader } from './modules/identity/infrastructure/sqlite-community-identity-reader';
import { SQLiteIdentityOperationsQuery } from './modules/identity/infrastructure/sqlite-identity-operations-query';
import { createMessagingModule } from './modules/messaging/composition';
import { createNotificationsModule } from './modules/notifications/composition';
import type { ActivityProjectionTrigger } from './modules/notifications/domain/ports';
import { createOperationsComposition } from './modules/operations/composition';
import metricsRoutes from './modules/operations/http/metrics.routes';
import { AnalyticsService } from './modules/operations/infrastructure/analytics-service';
import {
  INDEX_POPUP_MEDIA_BASE_PATH,
  INDEX_POPUP_MEDIA_CACHE_CONTROL,
  IndexPopupService,
} from './modules/operations/infrastructure/index-popup-service';
import { createTreeholeComposition } from './modules/treehole/composition';
import { registerRoutes as registerApplicationRoutes } from './routes';
import { createSocialSummaryRoutes } from './routes/social-summary.routes';
import { PeriodicTaskRegistry } from './runtime/periodic-tasks';
import { runtimeMetrics } from './runtime/runtime-metrics';
import { registerShutdownFlushHook } from './runtime/shutdown-hooks';
import { configureRefreshFallbackObservers } from './services/infra/refresh-fallback';
import { Logger } from './utils/logger';

export interface ApplicationComposition {
  app: AppDependencies;
  social: {
    community: CommunityApplicationService;
    discover: ReturnType<typeof createDiscoverModule>;
    messaging: ReturnType<typeof createMessagingModule>;
    notifications: ReturnType<typeof createNotificationsModule>;
    treehole: ReturnType<typeof createTreeholeComposition>;
  };
  operations: ReturnType<typeof createOperationsComposition>;
  earlyRising: ReturnType<typeof createEarlyRisingModule>;
  periodicTasks: PeriodicTaskRegistry;
  dispose(): void;
}

export function createApplicationComposition(): ApplicationComposition {
  const db = getDb();
  const profileRepository = new SQLiteCommunityProfileRepository(db);
  const communityAvatarMedia = new CommunityAvatarMediaStorage(profileRepository, {
    storageRoot: config.community.avatarStorageRoot,
    mediaBasePath: config.community.avatarMediaBasePath,
    maxBytes: config.community.avatarMaxBytes,
    maxDimension: config.community.avatarMaxDimension,
    quality: config.community.avatarQuality,
  });
  const community = new CommunityApplicationService(
    new SQLiteCommunityIdentityReader(db),
    profileRepository,
    communityAvatarMedia,
  );
  const notifications = createNotificationsModule({ db, profileReader: community });
  const earlyRising = createEarlyRisingModule({ db, profiles: community });
  const activityProjection: ActivityProjectionTrigger = {
    async attempt() {
      await notifications.projector.runOnce();
    },
  };
  const discover = createDiscoverModule({
    db,
    profileReader: community,
    activityOutbox: notifications.outboxWriter,
    activityProjection,
  });
  const treehole = createTreeholeComposition({
    db,
    profiles: community,
    policy: {
      maxPostLength: config.treehole.maxPostLength,
      maxCommentLength: config.treehole.maxCommentLength,
      defaultPageSize: config.treehole.defaultPageSize,
      maxPageSize: config.treehole.maxPageSize,
      defaultCommentPageSize: config.treehole.defaultCommentPageSize,
      maxCommentPageSize: config.treehole.maxCommentPageSize,
      maxImagesPerPost: config.treehole.maxImagesPerPost,
      maxImageBytes: config.treehole.imageMaxBytes,
      maxImageTotalBytes: config.treehole.imageTotalMaxBytes,
      maxImagePixels: config.treehole.imageMaxPixels,
      maxOutputImageBytes: config.treehole.imageMaxOutputBytes,
      imageMaxDimension: config.treehole.imageMaxDimension,
      imageQuality: config.treehole.imageQuality,
      allowAnimatedImages: false,
      orphanMediaGraceMs: config.treehole.orphanMediaGraceMs,
    },
    activityOutbox: notifications.outboxWriter,
    activityProjection,
    media: {
      storageRoot: config.treehole.storageRoot,
      userMediaBasePath: config.treehole.userMediaBasePath,
      adminMediaBasePath: config.treehole.adminMediaBasePath,
    },
    upload: {
      maxActive: config.treehole.uploadMaxActive,
      maxQueued: config.treehole.uploadMaxQueued,
    },
  });
  const messaging = createMessagingModule({
    db,
    profileReader: community,
    media: {
      storageRoot: join(dirname(config.dbPath), 'message-media'),
      mediaBasePath: '/api/messaging/media',
      adminMediaBasePath: '/api/admin/messaging/media',
    },
  });
  const operations = createOperationsComposition({
    identityQuery: new SQLiteIdentityOperationsQuery(),
    discoverQuery: discover.operationsQuery,
    treeholeQuery: treehole.operationsQuery,
    treeholeMedia: treehole.media,
    messagingQuery: messaging.operationsQuery,
    discoverCommands: {
      deletePost: (postId) => discover.service.deletePost(postId),
    },
    treeholeCommands: {
      deletePost: (postId) => treehole.service.adminDeletePost(postId),
      deleteComment: (commentId) => treehole.service.adminDeleteComment(commentId),
    },
    earlyRisingSettings: {
      getAdminSettings: () => earlyRising.service.getAdminSettings(),
      updateSettings: (profileEntryVisible, updatedBy) => (
        earlyRising.service.updateSettings(profileEntryVisible, updatedBy)
      ),
    },
  });
  const communityRoutes = createCommunityRoutes(community, {
    avatarMaxBytes: config.community.avatarMaxBytes,
  });

  const unregisterAnalyticsShutdown = registerShutdownFlushHook('analytics', async () => {
    const result = await AnalyticsService.shutdown();
    if (!result.success) Logger.warn('Shutdown', 'analytics shutdown flush returned success=false');
  });

  AnalyticsService.configureFlushFailureObserver(() => {
    runtimeMetrics.recordAnalyticsFlushFailure();
  });
  const restoreCacheObservers = CacheService.configureObservers({
    recordAccess: (outcome) => runtimeMetrics.recordCache(outcome),
    recordSingleflightMerge: () => runtimeMetrics.recordSingleflightMerge(),
  });
  const restoreRefreshFallbackObservers = configureRefreshFallbackObservers({
    recordFallback: () => runtimeMetrics.recordFallback(),
  });
  const restoreHttpClientObservers = configureHttpClientObservers({
    recordOutcome: (outcome) => runtimeMetrics.recordUpstream(outcome),
  });

  const periodicTasks = new PeriodicTaskRegistry(({ name, error }) => {
    Logger.error('PeriodicTask', `周期任务失败 name=${name}`, error);
  });
  periodicTasks.register({
    name: 'credential-cleanup',
    intervalMs: config.cleanupInterval,
    run: () => CredentialManager.cleanupExpired(),
  });
  periodicTasks.register({
    name: 'cache-cleanup',
    intervalMs: config.cleanupInterval,
    run: () => CacheService.cleanupExpired(),
  });
  periodicTasks.register({
    name: 'captcha-session-cleanup',
    intervalMs: config.captchaSessionTtl,
    run: () => loginApplicationService.cleanupExpiredCaptchaSessions(),
  });
  periodicTasks.register({
    name: 'activity-outbox-projection',
    intervalMs: 5_000,
    async run() {
      await notifications.projector.runOnce();
    },
  });
  periodicTasks.register({
    name: 'orphan-message-media-cleanup',
    intervalMs: 60 * 60_000,
    async run() {
      await messaging.orphanMediaCleanup.runOnce();
    },
  });
  periodicTasks.register({
    name: 'orphan-discover-media-cleanup',
    intervalMs: config.cleanupInterval,
    async run() {
      const before = new Date(Date.now() - config.discover.orphanMediaGraceMs);
      await discover.service.cleanupOrphanMedia(before);
    },
  });
  periodicTasks.register({
    name: 'orphan-treehole-media-cleanup',
    intervalMs: config.cleanupInterval,
    async run() {
      const before = new Date(Date.now() - config.treehole.orphanMediaGraceMs);
      await treehole.service.cleanupOrphanMedia(before);
    },
  });
  periodicTasks.register({
    name: 'orphan-community-avatar-cleanup',
    intervalMs: config.cleanupInterval,
    async run() {
      const before = new Date(Date.now() - config.community.orphanMediaGraceMs);
      await community.cleanupOrphanAvatars(before);
    },
  });

  return {
    app: {
      registerRoutes: (app) => registerApplicationRoutes(app, {
        adminRoutes: operations.adminRoutes,
        communityRoutes,
        discoverRoutes: discover.routes,
        publicDiscoverRoutes: discover.publicRoutes,
        earlyRisingRoutes: earlyRising.routes,
        messagingRoutes: messaging.routes,
        notificationRoutes: notifications.routes,
        socialSummaryRoutes: createSocialSummaryRoutes({
          countMessagingUnread: (userId) => messaging.service.countUnread(userId),
          summarizeNotifications: (userId) => notifications.service.summarize(userId),
        }),
        treeholeRoutes: treehole.routes,
      }),
      metricsRoutes,
      media: [
        {
          basePath: INDEX_POPUP_MEDIA_BASE_PATH,
          cacheControl: INDEX_POPUP_MEDIA_CACHE_CONTROL,
          getFile: (requestPath) => IndexPopupService.getPublicFile(requestPath),
        },
        {
          basePath: config.discover.mediaBasePath,
          cacheControl: DISCOVER_MEDIA_CACHE_CONTROL,
          getFile: (requestPath) => discover.media.getPublicFile(requestPath),
        },
        {
          basePath: config.community.avatarMediaBasePath,
          cacheControl: COMMUNITY_AVATAR_CACHE_CONTROL,
          getFile: (requestPath) => communityAvatarMedia.getPublicFile(requestPath),
        },
      ],
    },
    social: { community, discover, messaging, notifications, treehole },
    operations,
    earlyRising,
    periodicTasks,
    dispose() {
      unregisterAnalyticsShutdown();
      restoreCacheObservers();
      AnalyticsService.configureFlushFailureObserver();
      restoreRefreshFallbackObservers();
      restoreHttpClientObservers();
    },
  };
}
