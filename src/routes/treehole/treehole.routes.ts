import { Hono } from 'hono';
import { config } from '../../config';
import { TreeholeService } from '../../services/treehole/treehole-service';
import { ErrorCode } from '../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { Logger } from '../../utils/logger';
import { error, success } from '../../utils/response';

const treehole = new Hono();

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseEntityId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

treehole.get('/meta', (c) => {
  const data = TreeholeService.getMeta();
  appendHttpLogDetail(c, formatHttpLogDetail({
    maxPostLength: data.limits.maxPostLength,
    maxCommentLength: data.limits.maxCommentLength,
  }));
  return success(c, data);
});

treehole.get('/posts', async (c) => {
  const page = parsePositiveInt(c.req.query('page'), 1);
  const pageSize = parsePositiveInt(c.req.query('pageSize'), config.treehole.defaultPageSize);
  if (!page || !pageSize) {
    return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ page, pageSize }));
  const data = await TreeholeService.listPosts({
    userId: c.get('userId'),
    page,
    pageSize,
  });

  appendHttpLogDetail(c, formatHttpLogDetail({
    total: data.total,
    items: data.items.length,
    hasMore: data.hasMore,
  }));
  return success(c, data);
});

treehole.get('/posts/me', async (c) => {
  const page = parsePositiveInt(c.req.query('page'), 1);
  const pageSize = parsePositiveInt(c.req.query('pageSize'), config.treehole.defaultPageSize);
  if (!page || !pageSize) {
    return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    scope: 'me',
    page,
    pageSize,
  }));
  const data = await TreeholeService.listMyPosts({
    userId: c.get('userId'),
    page,
    pageSize,
  });

  appendHttpLogDetail(c, formatHttpLogDetail({
    total: data.total,
    items: data.items.length,
    hasMore: data.hasMore,
  }));
  return success(c, data);
});

treehole.post('/posts', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    contentLength: typeof body?.content === 'string' ? body.content.trim().length : 0,
  }));

  const data = await TreeholeService.createPost({
    userId: c.get('userId'),
    content: typeof body?.content === 'string' ? body.content : '',
  });

  appendHttpLogDetail(c, formatHttpLogDetail({ postId: data?.id }));

  Logger.operation(
    'Treehole',
    `发布树洞 #${data?.id ?? '-'}`,
    c.get('studentId'),
    c.get('name')
  );

  return success(c, data, undefined, 201);
});

treehole.get('/posts/:id', async (c) => {
  const postId = parseEntityId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId }));
  const data = await TreeholeService.getPostDetail(c.get('userId'), postId);
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  return success(c, data);
});

treehole.put('/posts/:id/like', async (c) => {
  const postId = parseEntityId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId, action: 'like' }));
  const data = await TreeholeService.likePost(c.get('userId'), postId);
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    liked: data.viewer.liked,
    likeCount: data.stats.likeCount,
  }));

  Logger.operation(
    'Treehole',
    `点赞树洞 #${postId}`,
    c.get('studentId'),
    c.get('name')
  );

  return success(c, data);
});

treehole.delete('/posts/:id/like', async (c) => {
  const postId = parseEntityId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId, action: 'unlike' }));
  const data = await TreeholeService.unlikePost(c.get('userId'), postId);
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    liked: data.viewer.liked,
    likeCount: data.stats.likeCount,
  }));

  Logger.operation(
    'Treehole',
    `取消点赞树洞 #${postId}`,
    c.get('studentId'),
    c.get('name')
  );

  return success(c, data);
});

treehole.get('/posts/:id/comments', async (c) => {
  const postId = parseEntityId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  const page = parsePositiveInt(c.req.query('page'), 1);
  const pageSize = parsePositiveInt(c.req.query('pageSize'), config.treehole.defaultCommentPageSize);
  if (!page || !pageSize) {
    return error(c, ErrorCode.PARAM_ERROR, '分页参数不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    postId,
    page,
    pageSize,
  }));
  const data = await TreeholeService.listComments(c.get('userId'), postId, {
    page,
    pageSize,
  });
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    total: data.total,
    items: data.items.length,
    hasMore: data.hasMore,
  }));

  return success(c, data);
});

treehole.post('/posts/:id/comments', async (c) => {
  const postId = parseEntityId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    postId,
    contentLength: typeof body?.content === 'string' ? body.content.trim().length : 0,
  }));

  const data = await TreeholeService.createComment({
    userId: c.get('userId'),
    postId,
    content: typeof body?.content === 'string' ? body.content : '',
  });
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ commentId: data.id }));

  Logger.operation(
    'Treehole',
    `评论树洞 #${postId}`,
    c.get('studentId'),
    c.get('name')
  );

  return success(c, data, undefined, 201);
});

treehole.delete('/posts/:id', async (c) => {
  const postId = parseEntityId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId }));
  const removed = await TreeholeService.deletePost(postId, c.get('userId'));
  if (!removed) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在或无权删除', 404);
  }

  Logger.operation(
    'Treehole',
    `删除树洞 #${removed.id}`,
    c.get('studentId'),
    c.get('name')
  );

  return success(c, removed);
});

treehole.delete('/comments/:id', async (c) => {
  const commentId = parseEntityId(c.req.param('id'));
  if (!commentId) {
    return error(c, ErrorCode.PARAM_ERROR, '评论 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ commentId }));
  const removed = await TreeholeService.deleteComment(commentId, c.get('userId'));
  if (!removed) {
    return error(c, ErrorCode.PARAM_ERROR, '评论不存在或无权删除', 404);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId: removed.postId }));

  Logger.operation(
    'Treehole',
    `删除评论 #${removed.id}`,
    c.get('studentId'),
    c.get('name'),
    `postId=${removed.postId}`
  );

  return success(c, removed);
});

export default treehole;
