/**
 * [INPUT]: 依赖 Hono、注入的 TreeholeApplicationService 与统一错误/日志/响应工具
 * [OUTPUT]: 对外提供 createTreeholeRoutes(service)，映射帖子、评论及统一 `{postId, liked, likeCount}` 的 PUT/DELETE 点赞协议
 * [POS]: modules/treehole/http 的认证后 factory adapter，不读取配置、数据库或 composition singleton
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../../utils/http-log';
import { Logger } from '../../../utils/logger';
import { error, success } from '../../../utils/response';
import type { TreeholeApplicationService } from '../application/treehole-application-service';

type TreeholeHttpService = Pick<
  TreeholeApplicationService,
  | 'getMeta'
  | 'listPosts'
  | 'listMyPosts'
  | 'listUserPosts'
  | 'createPost'
  | 'getPostDetail'
  | 'likePost'
  | 'unlikePost'
  | 'listComments'
  | 'createComment'
  | 'deletePost'
  | 'deleteComment'
>;

function parseOptionalPositiveInt(value: string | undefined) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseEntityId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePagination(c: Context) {
  return {
    page: parseOptionalPositiveInt(c.req.query('page')),
    pageSize: parseOptionalPositiveInt(c.req.query('pageSize')),
  };
}

export function createTreeholeRoutes(service: TreeholeHttpService) {
  const routes = new Hono();

  routes.get('/meta', (c) => {
    const data = service.getMeta();
    appendHttpLogDetail(c, formatHttpLogDetail({
      maxPostLength: data.limits.maxPostLength,
      maxCommentLength: data.limits.maxCommentLength,
    }));
    return success(c, data);
  });

  routes.get('/posts', async (c) => {
    const pagination = parsePagination(c);
    if (pagination.page === null || pagination.pageSize === null) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    const data = await service.listPosts({
      userId: c.get('userId'),
      page: pagination.page ?? undefined,
      pageSize: pagination.pageSize ?? undefined,
    });
    appendHttpLogDetail(c, formatHttpLogDetail({ total: data.total, items: data.items.length }));
    return success(c, data);
  });

  routes.get('/posts/me', async (c) => {
    const pagination = parsePagination(c);
    if (pagination.page === null || pagination.pageSize === null) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    const data = await service.listMyPosts({
      userId: c.get('userId'),
      page: pagination.page ?? undefined,
      pageSize: pagination.pageSize ?? undefined,
    });
    appendHttpLogDetail(c, formatHttpLogDetail({ scope: 'me', total: data.total }));
    return success(c, data);
  });

  routes.get('/users/:userId/posts', async (c) => {
    const authorUserId = parseEntityId(c.req.param('userId'));
    const pagination = parsePagination(c);
    if (!authorUserId) return error(c, ErrorCode.PARAM_ERROR, '用户 ID 不合法', 400);
    if (pagination.page === null || pagination.pageSize === null) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    const data = await service.listUserPosts(c.get('userId'), authorUserId, {
      page: pagination.page ?? undefined,
      pageSize: pagination.pageSize ?? undefined,
    });
    appendHttpLogDetail(c, formatHttpLogDetail({ authorUserId, total: data.total }));
    return success(c, data);
  });

  routes.post('/posts', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
    }
    appendHttpLogDetail(c, formatHttpLogDetail({
      contentLength: typeof body?.content === 'string' ? body.content.trim().length : 0,
    }));
    const data = await service.createPost({
      userId: c.get('userId'),
      content: typeof body?.content === 'string' ? body.content : '',
    });
    Logger.operation('Treehole', `发布树洞 #${data?.id ?? '-'}`, c.get('studentId'), c.get('name'));
    return success(c, data, undefined, 201);
  });

  routes.get('/posts/:id', async (c) => {
    const postId = parseEntityId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const data = await service.getPostDetail(c.get('userId'), postId);
    return data ? success(c, data) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  });

  routes.put('/posts/:id/like', async (c) => {
    const postId = parseEntityId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const data = await service.likePost(c.get('userId'), postId);
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
    appendHttpLogDetail(c, formatHttpLogDetail({ postId, liked: data.viewer.liked }));
    Logger.operation('Treehole', `点赞树洞 #${postId}`, c.get('studentId'), c.get('name'));
    return success(c, { postId: data.id, liked: data.viewer.liked, likeCount: data.stats.likeCount });
  });

  routes.delete('/posts/:id/like', async (c) => {
    const postId = parseEntityId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const data = await service.unlikePost(c.get('userId'), postId);
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
    appendHttpLogDetail(c, formatHttpLogDetail({ postId, liked: data.viewer.liked }));
    Logger.operation('Treehole', `取消点赞树洞 #${postId}`, c.get('studentId'), c.get('name'));
    return success(c, { postId: data.id, liked: data.viewer.liked, likeCount: data.stats.likeCount });
  });

  routes.get('/posts/:id/comments', async (c) => {
    const postId = parseEntityId(c.req.param('id'));
    const pagination = parsePagination(c);
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    if (pagination.page === null || pagination.pageSize === null) {
      return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
    }
    const data = await service.listComments(c.get('userId'), postId, {
      page: pagination.page ?? undefined,
      pageSize: pagination.pageSize ?? undefined,
    });
    return data ? success(c, data) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  });

  routes.post('/posts/:id/comments', async (c) => {
    const postId = parseEntityId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
    }
    let parentCommentId: number | null = null;
    if (body?.parentCommentId !== undefined && body?.parentCommentId !== null && body.parentCommentId !== '') {
      parentCommentId = parseEntityId(String(body.parentCommentId));
      if (!parentCommentId) return error(c, ErrorCode.PARAM_ERROR, '父评论 ID 不合法', 400);
    }
    const data = await service.createComment({
      userId: c.get('userId'),
      postId,
      content: typeof body?.content === 'string' ? body.content : '',
      parentCommentId,
    });
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
    Logger.operation('Treehole', `评论树洞 #${postId}`, c.get('studentId'), c.get('name'));
    return success(c, data, undefined, 201);
  });

  routes.delete('/posts/:id', async (c) => {
    const postId = parseEntityId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const removed = await service.deletePost(postId, c.get('userId'));
    if (!removed) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在或无权删除', 404);
    Logger.operation('Treehole', `删除树洞 #${removed.id}`, c.get('studentId'), c.get('name'));
    return success(c, removed);
  });

  routes.delete('/comments/:id', async (c) => {
    const commentId = parseEntityId(c.req.param('id'));
    if (!commentId) return error(c, ErrorCode.PARAM_ERROR, '评论 ID 不合法', 400);
    const removed = await service.deleteComment(commentId, c.get('userId'));
    if (!removed) return error(c, ErrorCode.PARAM_ERROR, '评论不存在或无权删除', 404);
    Logger.operation(
      'Treehole',
      `删除评论 #${removed.id}`,
      c.get('studentId'),
      c.get('name'),
      `postId=${removed.postId}`,
    );
    return success(c, removed);
  });

  return routes;
}
