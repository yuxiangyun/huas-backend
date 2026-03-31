import { Hono } from 'hono';
import { config } from '../../config';
import { DiscoverService } from '../../services/discover/discover-service';
import { ErrorCode } from '../../utils/errors';
import { parseStringArray } from '../../utils/discover';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { Logger } from '../../utils/logger';
import { error, success } from '../../utils/response';

const discover = new Hono();

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parsePostId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function readTagValues(form: FormData) {
  return [...form.getAll('tags'), ...form.getAll('tags[]')]
    .flatMap((value) => typeof value === 'string' ? parseStringArray(value) : []);
}

function readImageFiles(form: FormData) {
  return [...form.getAll('images'), ...form.getAll('images[]')]
    .filter((value): value is File => value instanceof File);
}

discover.get('/meta', (c) => {
  const data = DiscoverService.getMeta();
  appendHttpLogDetail(c, formatHttpLogDetail({
    categories: data.categories.length,
    commonTags: data.commonTags.length,
  }));
  return success(c, data);
});

discover.post('/posts', async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return error(c, ErrorCode.PARAM_ERROR, '请求必须是 multipart/form-data', 400);
  }

  const category = form.get('category');
  if (typeof category !== 'string' || !category.trim()) {
    return error(c, ErrorCode.PARAM_ERROR, '分类不能为空', 400);
  }

  const title = typeof form.get('title') === 'string' ? String(form.get('title')) : undefined;
  const storeName = typeof form.get('storeName') === 'string' ? String(form.get('storeName')) : undefined;
  const priceText = typeof form.get('priceText') === 'string' ? String(form.get('priceText')) : undefined;
  const content = typeof form.get('content') === 'string' ? String(form.get('content')) : undefined;
  const tags = readTagValues(form);
  const images = readImageFiles(form);

  appendHttpLogDetail(c, formatHttpLogDetail({
    category,
    titleLength: title?.trim().length || 0,
    contentLength: content?.trim().length || 0,
    tags: tags.length,
    images: images.length,
  }));

  const data = await DiscoverService.createPost({
    userId: c.get('userId'),
    title,
    storeName,
    priceText,
    content,
    category,
    tags,
    images,
  });

  appendHttpLogDetail(c, formatHttpLogDetail({
    postId: data?.id,
    imageCount: data?.imageCount ?? 0,
  }));

  Logger.operation(
    'Discover',
    `发布帖子 #${data?.id ?? '-'} (${data?.category || category})`,
    c.get('studentId'),
    c.get('name'),
    `images=${data?.imageCount ?? 0}; tags=${data?.tags.length ?? 0}`
  );

  return success(c, data, undefined, 201);
});

discover.get('/posts/me', async (c) => {
  const category = c.req.query('category');
  const page = parsePositiveInt(c.req.query('page'), 1);
  const pageSize = parsePositiveInt(c.req.query('pageSize'), 20);

  appendHttpLogDetail(c, formatHttpLogDetail({
    scope: 'me',
    category,
    page,
    pageSize,
  }));

  const data = await DiscoverService.listMyPosts({
    userId: c.get('userId'),
    category,
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

discover.get('/posts/:id', async (c) => {
  const postId = parsePostId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId }));
  const data = await DiscoverService.getPostDetail(c.get('userId'), postId);
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  return success(c, data);
});

discover.get('/posts/:id/comments', async (c) => {
  const postId = parsePostId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  const page = parsePositiveInt(c.req.query('page'), 1);
  const pageSize = parsePositiveInt(c.req.query('pageSize'), config.discover.defaultCommentPageSize);

  appendHttpLogDetail(c, formatHttpLogDetail({
    postId,
    page,
    pageSize,
  }));

  const data = await DiscoverService.listComments(c.get('userId'), postId, {
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

discover.post('/posts/:id/comments', async (c) => {
  const postId = parsePostId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
  }

  let parentCommentId: number | null = null;
  if (body?.parentCommentId !== undefined && body?.parentCommentId !== null && body?.parentCommentId !== '') {
    const parsedParentCommentId = Number(body.parentCommentId);
    if (!Number.isInteger(parsedParentCommentId) || parsedParentCommentId <= 0) {
      return error(c, ErrorCode.PARAM_ERROR, '父评论 ID 不合法', 400);
    }
    parentCommentId = parsedParentCommentId;
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    postId,
    contentLength: typeof body?.content === 'string' ? body.content.trim().length : 0,
    parentCommentId: parentCommentId ?? undefined,
  }));

  const data = await DiscoverService.createComment({
    userId: c.get('userId'),
    postId,
    content: typeof body?.content === 'string' ? body.content : '',
    parentCommentId,
  });
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    commentId: data.id,
  }));

  Logger.operation(
    'Discover',
    `评论帖子 #${postId}`,
    c.get('studentId'),
    c.get('name')
  );

  return success(c, data, undefined, 201);
});

discover.get('/posts', async (c) => {
  const sort = c.req.query('sort') || 'latest';
  if (!['latest', 'score', 'recommended'].includes(sort)) {
    return error(c, ErrorCode.PARAM_ERROR, '排序方式不合法', 400);
  }

  const category = c.req.query('category');
  const page = parsePositiveInt(c.req.query('page'), 1);
  const pageSize = parsePositiveInt(c.req.query('pageSize'), 20);

  appendHttpLogDetail(c, formatHttpLogDetail({
    sort,
    category,
    page,
    pageSize,
  }));

  const data = await DiscoverService.listPosts(sort as 'latest' | 'score' | 'recommended', {
    userId: c.get('userId'),
    category,
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

discover.post('/posts/:id/rating', async (c) => {
  const postId = parsePostId(c.req.param('id'));
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
    score: Number(body?.score),
  }));

  const data = await DiscoverService.ratePost(c.get('userId'), postId, Number(body?.score));
  if (!data) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  }

  Logger.operation(
    'Discover',
    `评分帖子 #${postId}`,
    c.get('studentId'),
    c.get('name'),
    `score=${body?.score}`
  );

  return success(c, data);
});

discover.delete('/posts/:id', async (c) => {
  const postId = parsePostId(c.req.param('id'));
  if (!postId) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId }));
  const removed = await DiscoverService.deletePost(postId, c.get('userId'));
  if (!removed) {
    return error(c, ErrorCode.PARAM_ERROR, '帖子不存在或无权删除', 404);
  }

  Logger.operation(
    'Discover',
    `删除帖子 #${removed.id}`,
    c.get('studentId'),
    c.get('name')
  );

  return success(c, { id: removed.id });
});

discover.delete('/comments/:id', async (c) => {
  const commentId = parsePostId(c.req.param('id'));
  if (!commentId) {
    return error(c, ErrorCode.PARAM_ERROR, '评论 ID 不合法', 400);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ commentId }));
  const removed = await DiscoverService.deleteComment(commentId, c.get('userId'));
  if (!removed) {
    return error(c, ErrorCode.PARAM_ERROR, '评论不存在或无权删除', 404);
  }

  appendHttpLogDetail(c, formatHttpLogDetail({ postId: removed.postId }));

  Logger.operation(
    'Discover',
    `删除评论 #${removed.id}`,
    c.get('studentId'),
    c.get('name'),
    `postId=${removed.postId}`
  );

  return success(c, removed);
});

export default discover;
