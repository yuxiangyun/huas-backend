import { Hono } from 'hono';
import type { EarlyRisingOperationsQueryPort } from '../../early-rising/domain/operations-query';
import { parseEarlyRisingPeriod } from '../../early-rising/domain/early-rising';
import { AppError, ErrorCode } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import { positiveSafeInteger } from '../../../utils/pagination';
import { error, success } from '../../../utils/response';
import type { AdminInsightsApplicationService } from '../application/admin-insights-service';
import type { CommunityAdminApplicationService } from '../application/community-admin-service';

interface AdminDataDependencies {
  insights: Pick<AdminInsightsApplicationService, 'listUsers' | 'getOverview' | 'getRuntime'>;
  communityAdmin: Pick<CommunityAdminApplicationService,
    'listDiscoverPosts' | 'getDiscoverPost' | 'listDiscoverComments' | 'deleteDiscoverComment' | 'getTreeholePost'>;
  earlyRisingQuery: EarlyRisingOperationsQueryPort;
}

function optionalInteger(value: string | undefined, field: string) {
  return value === undefined ? undefined : positiveSafeInteger(Number(value), field);
}

function daysParameter(value: string | undefined): 7 | 30 | 90 {
  const days = value === undefined ? 30 : Number(value);
  if (days !== 7 && days !== 30 && days !== 90) throw new AppError(ErrorCode.PARAM_ERROR, 'days 仅支持 7、30、90');
  return days;
}

/** Mounted only after the shared Admin Cookie middleware. */
export function createAdminDataRoutes(dependencies: AdminDataDependencies) {
  const routes = new Hono();
  routes.get('/users', async (c) => {
    const query = c.req.query();
    const grade = query.grade?.trim() || '';
    if (grade && !/^(19|20)\d{2}$/.test(grade)) throw new AppError(ErrorCode.PARAM_ERROR, '年级不合法');
    return success(c, await dependencies.insights.listUsers({
      page: optionalInteger(query.page, 'page'), search: query.search, className: query.className, grade,
    }));
  });
  routes.get('/overview', async (c) => success(c, await dependencies.insights.getOverview()));
  routes.get('/runtime', (c) => success(c, dependencies.insights.getRuntime()));
  routes.get('/early-rising/overview', async (c) => success(c,
    await dependencies.earlyRisingQuery.getAdminOverview(daysParameter(c.req.query('days')))));
  routes.get('/early-rising/leaderboard', async (c) => success(c,
    await dependencies.earlyRisingQuery.getAdminLeaderboard(parseEarlyRisingPeriod(c.req.query('period') ?? 'today'))));
  routes.get('/discover/posts', async (c) => {
    const query = c.req.query();
    return success(c, await dependencies.communityAdmin.listDiscoverPosts({
      page: optionalInteger(query.page, 'page'), pageSize: optionalInteger(query.pageSize, 'pageSize'),
      keyword: query.keyword, category: query.category,
    }));
  });
  routes.get('/discover/posts/:id', async (c) => {
    const postId = positiveSafeInteger(Number(c.req.param('id')), '帖子 ID');
    const post = await dependencies.communityAdmin.getDiscoverPost(postId);
    return post ? success(c, post) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  });
  routes.get('/discover/posts/:id/comments', async (c) => {
    const postId = positiveSafeInteger(Number(c.req.param('id')), '帖子 ID');
    const query = c.req.query();
    const comments = await dependencies.communityAdmin.listDiscoverComments(postId, {
      page: optionalInteger(query.page, 'page'), pageSize: optionalInteger(query.pageSize, 'pageSize'),
    });
    return comments ? success(c, comments) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  });
  routes.delete('/discover/comments/:id', async (c) => {
    const commentId = positiveSafeInteger(Number(c.req.param('id')), '评论 ID');
    const removed = await dependencies.communityAdmin.deleteDiscoverComment(commentId);
    if (!removed) return error(c, ErrorCode.PARAM_ERROR, '评论不存在', 404);
    Logger.operation('Admin', '删除 Discover 评论', c.get('adminUser'), '管理员', `commentId=${removed.id}; postId=${removed.postId}`);
    return success(c, removed);
  });
  routes.get('/treehole/posts/:id', async (c) => {
    const postId = positiveSafeInteger(Number(c.req.param('id')), '帖子 ID');
    const post = await dependencies.communityAdmin.getTreeholePost(postId);
    return post ? success(c, post) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  });
  return routes;
}
