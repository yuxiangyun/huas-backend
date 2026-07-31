/**
 * [INPUT]: 依赖 Hono、注入的 CommunityApplicationService 与统一响应/HTTP 日志工具
 * [OUTPUT]: 对外提供 createCommunityRoutes(service)，映射当前资料、资料修改、头像删除与公共用户详情
 * [POS]: modules/community/http 的认证后协议 adapter，所有公开响应严格收敛为 id/displayName/avatarUrl
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../../utils/http-log';
import { error, success } from '../../../utils/response';
import type { CommunityApplicationService } from '../application/community-application-service';

type CommunityHttpService = Pick<
  CommunityApplicationService,
  'getProfile' | 'updateProfile' | 'clearAvatar'
>;

function parseUserId(value: string) {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function profileNotFound(c: Parameters<typeof error>[0]) {
  return error(c, ErrorCode.PARAM_ERROR, '用户不存在', 404);
}

export function createCommunityRoutes(service: CommunityHttpService) {
  const routes = new Hono();

  routes.get('/profile', async (c) => {
    const profile = await service.getProfile(c.get('userId'));
    return profile ? success(c, profile) : profileNotFound(c);
  });

  routes.put('/profile', async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return error(c, ErrorCode.PARAM_ERROR, '请求必须是 multipart/form-data', 400);
    }

    const hasNickname = form.has('nickname');
    const nickname = form.get('nickname');
    if (hasNickname && typeof nickname !== 'string') {
      return error(c, ErrorCode.PARAM_ERROR, '昵称必须是字符串', 400);
    }
    const avatarEntry = form.get('avatar');
    if (avatarEntry !== null && (!(avatarEntry instanceof File) || avatarEntry.size <= 0)) {
      return error(c, ErrorCode.PARAM_ERROR, '头像文件不合法', 400);
    }
    const avatar = avatarEntry instanceof File ? avatarEntry : undefined;
    if (!hasNickname && !avatar) {
      return error(c, ErrorCode.PARAM_ERROR, '至少提交昵称或头像', 400);
    }

    appendHttpLogDetail(c, formatHttpLogDetail({
      nicknameLength: typeof nickname === 'string' ? Array.from(nickname.trim()).length : undefined,
      avatarBytes: avatar?.size ?? 0,
    }));
    const profile = await service.updateProfile(c.get('userId'), {
      nickname: hasNickname ? nickname : undefined,
      avatar,
    });
    return success(c, profile);
  });

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
