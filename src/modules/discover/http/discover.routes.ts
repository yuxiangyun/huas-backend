/**
 * [INPUT]: 依赖 Hono、注入的 DiscoverApplicationService/上传策略、共享请求体上限与领域输入解析工具
 * [OUTPUT]: 对外提供受 Bearer 保护的 createDiscoverRoutes 与匿名只读 createPublicDiscoverRoutes，共享帖子/详情/评论读取协议
 * [POS]: modules/discover/http 的注入式协议 adapter，以独立路由表固定匿名只读边界，并在 formData 前限制声明长度与流式请求体
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context } from 'hono';
import { parseStringArray, type DiscoverSort } from '../domain/discover';
import { ErrorCode } from '../../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../../utils/http-log';
import { Logger } from '../../../utils/logger';
import {
  isBodyLimitError,
  multipartRequestMaxBytes,
  requestBodyLimit,
} from '../../../utils/request-body-limit';
import { error, success } from '../../../utils/response';
import type { DiscoverApplicationService } from '../application/discover-application-service';

type DiscoverReadHttpService = Pick<
  DiscoverApplicationService,
  | 'getMeta'
  | 'getPostDetail'
  | 'listPosts'
  | 'listComments'
>;

type DiscoverHttpService = DiscoverReadHttpService & Pick<
  DiscoverApplicationService,
  | 'createPost'
  | 'listMyPosts'
  | 'listUserPosts'
  | 'likePost'
  | 'unlikePost'
  | 'createComment'
  | 'deleteComment'
  | 'deletePost'
>;

export interface DiscoverHttpUploadPolicy {
  maxImagesPerPost: number;
  imageMaxBytes: number;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function readTagValues(form: FormData) {
  const tags: string[] = [];
  form.forEach((value, field) => {
    if ((field === 'tags' || field === 'tags[]') && typeof value === 'string') {
      tags.push(...parseStringArray(value));
    }
  });
  return tags;
}

function readImageFiles(form: FormData) {
  const files: File[] = [];
  form.forEach((value, field) => {
    if ((field === 'images' || field === 'images[]') && value instanceof File) files.push(value);
  });
  return files;
}

function registerDiscoverReadRoutes(
  routes: Hono,
  service: DiscoverReadHttpService,
  viewerUserId: (context: Context) => number,
) {
  routes.get('/meta', (c) => {
    const data = service.getMeta();
    appendHttpLogDetail(c, formatHttpLogDetail({
      categories: data.categories.length,
      commonTags: data.commonTags.length,
    }));
    return success(c, data);
  });

  routes.get('/posts', async (c) => {
    const sort = c.req.query('sort') || 'latest';
    if (!['latest', 'popular', 'recommended'].includes(sort)) {
      return error(c, ErrorCode.PARAM_ERROR, '排序方式不合法', 400);
    }
    const data = await service.listPosts(sort as DiscoverSort, {
      userId: viewerUserId(c),
      category: c.req.query('category'),
      page: parsePositiveInt(c.req.query('page'), 1),
      pageSize: parsePositiveInt(c.req.query('pageSize'), 20),
    });
    return success(c, data);
  });

  routes.get('/posts/:id', async (c) => {
    const postId = parseId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const data = await service.getPostDetail(viewerUserId(c), postId);
    return data ? success(c, data) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  });

  routes.get('/posts/:id/comments', async (c) => {
    const postId = parseId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const data = await service.listComments(viewerUserId(c), postId, {
      page: parsePositiveInt(c.req.query('page'), 1),
      pageSize: parsePositiveInt(c.req.query('pageSize'), 50),
    });
    return data ? success(c, data) : error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);
  });
}

export function createPublicDiscoverRoutes(service: DiscoverReadHttpService) {
  const routes = new Hono();
  registerDiscoverReadRoutes(routes, service, () => 0);
  return routes;
}

export function createDiscoverRoutes(
  service: DiscoverHttpService,
  uploadPolicy: DiscoverHttpUploadPolicy,
) {
  const routes = new Hono();

  routes.post(
    '/posts',
    requestBodyLimit({
      maxSize: multipartRequestMaxBytes(
        uploadPolicy.maxImagesPerPost * uploadPolicy.imageMaxBytes,
      ),
      tooLargeMessage: '帖子上传请求体过大',
    }),
    async (c) => {
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch (cause) {
        if (isBodyLimitError(cause)) throw cause;
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
        titleLength: Array.from(title?.trim() || '').length,
        contentLength: Array.from(content?.trim() || '').length,
        tags: tags.length,
        images: images.length,
      }));

      const data = await service.createPost({
        userId: c.get('userId'),
        title,
        storeName,
        priceText,
        content,
        category,
        tags,
        images,
      });

      Logger.operation(
        'Discover',
        `发布帖子 #${data?.id ?? '-'} (${data?.category || category})`,
        c.get('studentId'),
        c.get('name'),
        `images=${data?.imageCount ?? 0}; tags=${data?.tags.length ?? 0}`,
      );
      return success(c, data, undefined, 201);
    },
  );

  routes.get('/posts/me', async (c) => {
    const data = await service.listMyPosts({
      userId: c.get('userId'),
      category: c.req.query('category'),
      page: parsePositiveInt(c.req.query('page'), 1),
      pageSize: parsePositiveInt(c.req.query('pageSize'), 20),
    });
    return success(c, data);
  });

  routes.get('/users/:userId/posts', async (c) => {
    const targetUserId = parseId(c.req.param('userId'));
    if (!targetUserId) return error(c, ErrorCode.PARAM_ERROR, '用户 ID 不合法', 400);

    const data = await service.listUserPosts(c.get('userId'), targetUserId, {
      category: c.req.query('category'),
      page: parsePositiveInt(c.req.query('page'), 1),
      pageSize: parsePositiveInt(c.req.query('pageSize'), 20),
    });
    return success(c, data);
  });

  registerDiscoverReadRoutes(routes, service, (c) => c.get('userId'));

  routes.put('/posts/:id/like', async (c) => {
    const postId = parseId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const data = await service.likePost(c.get('userId'), postId);
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);

    Logger.operation('Discover', `点赞帖子 #${postId}`, c.get('studentId'), c.get('name'));
    return success(c, { postId: data.id, liked: data.likedByMe, likeCount: data.likeCount });
  });

  routes.delete('/posts/:id/like', async (c) => {
    const postId = parseId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const data = await service.unlikePost(c.get('userId'), postId);
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);

    Logger.operation('Discover', `取消点赞帖子 #${postId}`, c.get('studentId'), c.get('name'));
    return success(c, { postId: data.id, liked: data.likedByMe, likeCount: data.likeCount });
  });

  routes.post('/posts/:id/comments', async (c) => {
    const postId = parseId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
    }

    let parentCommentId: number | null = null;
    if (body?.parentCommentId !== undefined && body?.parentCommentId !== null && body?.parentCommentId !== '') {
      parentCommentId = Number(body.parentCommentId);
      if (!Number.isInteger(parentCommentId) || parentCommentId <= 0) {
        return error(c, ErrorCode.PARAM_ERROR, '父评论 ID 不合法', 400);
      }
    }

    const data = await service.createComment({
      userId: c.get('userId'),
      postId,
      content: typeof body?.content === 'string' ? body.content : '',
      parentCommentId,
    });
    if (!data) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在', 404);

    Logger.operation('Discover', `评论帖子 #${postId}`, c.get('studentId'), c.get('name'));
    return success(c, data, undefined, 201);
  });

  routes.delete('/posts/:id', async (c) => {
    const postId = parseId(c.req.param('id'));
    if (!postId) return error(c, ErrorCode.PARAM_ERROR, '帖子 ID 不合法', 400);
    const removed = await service.deletePost(postId, c.get('userId'));
    if (!removed) return error(c, ErrorCode.PARAM_ERROR, '帖子不存在或无权删除', 404);

    Logger.operation('Discover', `删除帖子 #${removed.id}`, c.get('studentId'), c.get('name'));
    return success(c, removed);
  });

  routes.delete('/comments/:id', async (c) => {
    const commentId = parseId(c.req.param('id'));
    if (!commentId) return error(c, ErrorCode.PARAM_ERROR, '评论 ID 不合法', 400);
    const removed = await service.deleteComment(commentId, c.get('userId'));
    if (!removed) return error(c, ErrorCode.PARAM_ERROR, '评论不存在或无权删除', 404);

    Logger.operation(
      'Discover',
      `删除评论 #${removed.id}`,
      c.get('studentId'),
      c.get('name'),
      `postId=${removed.postId}`,
    );
    return success(c, removed);
  });

  return routes;
}
