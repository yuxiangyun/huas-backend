/**
 * [INPUT]: 依赖 LoginApplicationService、SchoolAccess、Portal UserService、后台任务登记器、SqliteIdentityStore、Logger、CryptoHelper、JWT、config 与 Node crypto
 * [OUTPUT]: 对外提供 createLoginApplicationService，把本地和原始学校资料补全检查调度为不阻塞登录且完整登记收尾的后台工作
 * [POS]: identity/infrastructure 的 composition root，把学校协议与后台任务归属隔离在应用端口之外
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { timingSafeEqual } from 'node:crypto';
import { generateToken } from '../../../auth/jwt';
import { config } from '../../../config';
import { CryptoHelper } from '../../../utils/crypto';
import { LoginApplicationService } from '../application/login-application.service';
import { schoolAccess } from '../../campus-integrations/school-access/school-access';
import { UserService } from '../../campus-integrations/portal/user-service';
import { Logger } from '../../../utils/logger';
import { SqliteIdentityStore } from './sqlite-identity.store';
import { trackBackgroundTask } from '../../../runtime/background-tasks';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createLoginApplicationService(): LoginApplicationService {
  return new LoginApplicationService({
    school: schoolAccess,
    identityStore: new SqliteIdentityStore(),
    cipher: {
      matches: (encryptedPassword, candidate) => {
        const stored = CryptoHelper.decryptAES(encryptedPassword, config.jwtSecret);
        return Boolean(stored && safeEqual(stored, candidate));
      },
    },
    token: { issue: generateToken },
    profile: {
      requestCompletion: ({ userId, studentId, hasCompleteLocalProfile }) => {
        void trackBackgroundTask(UserService.completeMissingUserInfo(userId, studentId, hasCompleteLocalProfile).catch((error) => {
          const detail = error instanceof Error ? error.message : String(error);
          Logger.warn('Identity', '用户资料后台补全失败', detail, studentId);
        }));
      },
    },
    runtime: {
      now: () => new Date(),
    },
  });
}
