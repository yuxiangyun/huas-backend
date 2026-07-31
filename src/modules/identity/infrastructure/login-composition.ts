/**
 * [INPUT]: 依赖 LoginApplicationService、LegacyCampusLoginAdapter、SqliteIdentityStore、CryptoHelper、JWT、config 与 Node crypto
 * [OUTPUT]: 对外提供纯装配 createLoginApplicationService，由根组合层接管验证码会话周期清理
 * [POS]: identity/infrastructure 的 composition root，把具体实现注入纯应用服务，不私自创建后台定时器
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { timingSafeEqual } from 'node:crypto';
import { generateToken } from '../../../auth/jwt';
import { config } from '../../../config';
import { CryptoHelper } from '../../../utils/crypto';
import { LoginApplicationService } from '../application/login-application.service';
import { LegacyCampusLoginAdapter } from './legacy-campus-login.adapter';
import { SqliteIdentityStore } from './sqlite-identity.store';

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createLoginApplicationService(): LoginApplicationService {
  const campus = new LegacyCampusLoginAdapter();
  return new LoginApplicationService({
    campus,
    recovery: campus,
    profile: campus,
    identityStore: new SqliteIdentityStore(),
    cipher: {
      encrypt: (password) => CryptoHelper.encryptAES(password, config.jwtSecret),
      matches: (encryptedPassword, candidate) => {
        const stored = CryptoHelper.decryptAES(encryptedPassword, config.jwtSecret);
        return Boolean(stored && safeEqual(stored, candidate));
      },
    },
    token: { issue: generateToken },
    runtime: {
      now: () => new Date(),
      createId: () => crypto.randomUUID(),
      encodeBase64: (buffer) => Buffer.from(buffer).toString('base64'),
    },
    config: {
      captchaSessionTtlMs: config.captchaSessionTtl,
      maxCaptchaSessions: 1000,
    },
  });
}
