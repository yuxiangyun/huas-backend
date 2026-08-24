/**
 * [INPUT]: 依赖 Hono、注入的 CommunityApplicationService/头像策略、共享请求体上限与统一响应工具
 * [OUTPUT]: 对外提供 createCommunityRoutes(service, uploadPolicy)，沿用受限 multipart 更新 nickname/Bio/avatar 并读取详细公共资料
 * [POS]: modules/community/http 的认证后协议 adapter，在 formData 前限制声明长度与流式请求体并维持字段披露边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../../utils/http-log';
import {
  isBodyLimitError,
  multipartRequestMaxBytes,
  requestBodyLimit,
} from '../../../utils/request-body-limit';
import { error, success } from '../../../utils/response';
import type { CommunityApplicationService } from '../application/community-application-service';

type CommunityHttpService = Pick<
  CommunityApplicationService,
  'getProfile' | 'getCurrentProfile' | 'updateProfile' | 'clearAvatar'
>;

export interface CommunityHttpUploadPolicy {
  avatarMaxBytes: number;
}

function parseUserId(value: string) {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function profileNotFound(c: Parameters<typeof error>[0]) {
  return error(c, ErrorCode.PARAM_ERROR, '用户不存在', 404);
}

export function createCommunityRoutes(
  service: CommunityHttpService,
  uploadPolicy: CommunityHttpUploadPolicy,
) {
  const routes = new Hono();

  routes.get('/profile', async (c) => {
    const profile = await service.getCurrentProfile(c.get('userId'));
    return profile ? success(c, profile) : profileNotFound(c);
  });

  routes.put(
    '/profile',
    requestBodyLimit({
      maxSize: multipartRequestMaxBytes(uploadPolicy.avatarMaxBytes),
      tooLargeMessage: '资料上传请求体过大',
    }),
    async (c) => {
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch (cause) {
        if (isBodyLimitError(cause)) throw cause;
        return error(c, ErrorCode.PARAM_ERROR, '请求必须是 multipart/form-data', 400);
      }

      const hasNickname = form.has('nickname');
      const nickname = form.get('nickname');
      if (hasNickname && typeof nickname !== 'string') {
        return error(c, ErrorCode.PARAM_ERROR, '昵称必须是字符串', 400);
      }
      const hasBio = form.has('bio');
      const bio = form.get('bio');
      if (hasBio && typeof bio !== 'string') {
        return error(c, ErrorCode.PARAM_ERROR, 'Bio 必须是字符串', 400);
      }
      const avatarEntry = form.get('avatar');
      if (avatarEntry !== null && (!(avatarEntry instanceof File) || avatarEntry.size <= 0)) {
        return error(c, ErrorCode.PARAM_ERROR, '头像文件不合法', 400);
      }
      const avatar = avatarEntry instanceof File ? avatarEntry : undefined;
      if (!hasNickname && !hasBio && !avatar) {
        return error(c, ErrorCode.PARAM_ERROR, '至少提交昵称、Bio 或头像', 400);
      }

      appendHttpLogDetail(c, formatHttpLogDetail({
        nicknameLength: typeof nickname === 'string' ? Array.from(nickname.trim()).length : undefined,
        bioLength: typeof bio === 'string' ? Array.from(bio.trim()).length : undefined,
        avatarBytes: avatar?.size ?? 0,
      }));
      const profile = await service.updateProfile(c.get('userId'), {
        nickname: hasNickname ? nickname : undefined,
        bio: hasBio ? bio : undefined,
        avatar,
      });
      return success(c, profile);
    },
  );

  routes.delete('/profile/avatar', async (c) => {
    return success(c, await service.clearAvatar(c.get('userId')));
  });

  routes.get('/users/:id', async (c) => {
    const userId = parseUserId(c.req.param('id'));
    if (!userId) return error(c, ErrorCode.PARAM_ERROR, '用户 ID 不合法', 400);

    const profile = await service.getProfile(userId);
    return profile ? success(c, profile) : profileNotFound(c);
  });

  return routes;
}
