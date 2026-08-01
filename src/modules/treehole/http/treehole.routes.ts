/**
 * [INPUT]: 依赖 Hono、注入的 TreeholeApplicationService/图片策略/上传门禁与共享请求体限制/响应工具
 * [OUTPUT]: 对外提供 createTreeholeRoutes(service, uploadPolicy, uploadGate)，映射受限 multipart 图文帖子、私有媒体、评论与幂等点赞
 * [POS]: modules/treehole/http 的 Bearer 认证后 factory adapter，在 formData 前同时执行字节上限与有界并发门禁
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../../utils/http-log';
import { Logger } from '../../../utils/logger';
import { privateMediaResponse } from '../../../utils/private-media-response';
import {
  isBodyLimitError,
  multipartRequestMaxBytes,
  requestBodyLimit,
} from '../../../utils/request-body-limit';
import { error, success } from '../../../utils/response';
import type { TreeholeApplicationService } from '../application/treehole-application-service';
import type { TreeholeUploadGate } from './treehole-upload-gate';

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
  | 'getMedia'
>;

export interface TreeholeHttpUploadPolicy {
  maxImagesPerPost: number;
  maxImageBytes: number;
  maxImageTotalBytes: number;
}

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

export function createTreeholeRoutes(
  service: TreeholeHttpService,
  uploadPolicy: TreeholeHttpUploadPolicy,
  uploadGate: Pick<TreeholeUploadGate, 'acquire'>,
) {
  const routes = new Hono();

  routes.get('/meta', (c) => {
    const data = service.getMeta();
    appendHttpLogDetail(c, formatHttpLogDetail({
      maxPostLength: data.limits.maxPostLength,
      maxCommentLength: data.limits.maxCommentLength,
      maxImagesPerPost: data.limits.maxImagesPerPost,
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

  routes.post(
    '/posts',
    requestBodyLimit({
      maxSize: multipartRequestMaxBytes(uploadPolicy.maxImageTotalBytes),
      tooLargeMessage: '帖子上传请求体过大',
    }),
    async (c) => {
      const lease = await uploadGate.acquire(c.req.raw.signal);
      if (!lease) return error(c, ErrorCode.PARAM_ERROR, '图片处理繁忙，请稍后重试', 429);

      try {
        const contentType = c.req.header('content-type') ?? '';
        if (!/^multipart\/form-data(?:;|$)/iu.test(contentType)) {
          return error(c, ErrorCode.PARAM_ERROR, '请求必须是 multipart/form-data', 400);
        }

        let form: FormData;
        try {
          form = await c.req.formData();
        } catch (cause) {
          if (isBodyLimitError(cause)) throw cause;
          return error(c, ErrorCode.PARAM_ERROR, '请求必须是 multipart/form-data', 400);
        }

        const content = form.get('content');
        if (typeof content !== 'string') {
          return error(c, ErrorCode.PARAM_ERROR, '树洞内容不合法', 400);
        }
        const imageEntries: unknown[] = [];
        form.forEach((value, field) => {
          if (field === 'images' || field === 'images[]') imageEntries.push(value);
        });
        if (!imageEntries.every((entry): entry is File => entry instanceof File && entry.size > 0)) {
          return error(c, ErrorCode.PARAM_ERROR, '图片文件不合法', 400);
        }
        const images = imageEntries;
        if (images.length > uploadPolicy.maxImagesPerPost) {
          return error(c, ErrorCode.PARAM_ERROR, `每篇帖子最多上传 ${uploadPolicy.maxImagesPerPost} 张图片`, 400);
        }
        if (images.some((image) => image.size > uploadPolicy.maxImageBytes)) {
          return error(c, ErrorCode.PARAM_ERROR, '单张图片超过允许的大小限制', 413);
        }
        const originalBytes = images.reduce((total, image) => total + image.size, 0);
        if (!Number.isSafeInteger(originalBytes) || originalBytes > uploadPolicy.maxImageTotalBytes) {
          return error(c, ErrorCode.PARAM_ERROR, '帖子图片总大小超过允许的限制', 413);
        }

        appendHttpLogDetail(c, formatHttpLogDetail({
          contentLength: Array.from(content.trim()).length,
          images: images.length,
          originalBytes,
        }));
        const data = await service.createPost({
          userId: c.get('userId'),
          content,
          images,
        });
        Logger.operation(
          'Treehole',
          `发布树洞 #${data?.id ?? '-'}`,
          c.get('studentId'),
          c.get('name'),
          `images=${data?.imageCount ?? 0}`,
        );
        return success(c, data, undefined, 201);
      } finally {
        lease();
      }
    },
  );

  routes.get('/media/:mediaKey/:fileName', async (c) => {
    const mediaKey = c.req.param('mediaKey').trim();
    const fileName = c.req.param('fileName').trim();
    if (!mediaKey || !fileName) return error(c, ErrorCode.PARAM_ERROR, '媒体标识不合法', 400);
    const file = await service.getMedia(mediaKey, fileName);
    if (!file) return error(c, ErrorCode.PARAM_ERROR, '树洞图片不存在', 404);
    return privateMediaResponse(file);
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
