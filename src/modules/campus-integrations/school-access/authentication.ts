/**
 * [INPUT]: 依赖 CAS 单次协议、独立 HttpClient、学校状态仓储、统一执行器、认证排序、加密及只读配置
 * [OUTPUT]: 对外提供 SchoolAuthentication 的认证结果与验证码清理，CAS 成功即提交，不等待 Portal/JW
 * [POS]: SchoolAccess 的真实学校认证用例；挑战只保存在有界内存，身份和学校上下文原子落库
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { runtimeConfig } from '../../../runtime-config';
import { requestContext, schoolRequestExecutor } from './request-executor';
import { CryptoHelper } from '../../../utils/crypto';
import { AppError, ErrorCode } from '../../../utils/errors';
import type { LoginStep } from '../../../utils/logger';
import { AuthEngine } from '../cas/auth-engine';
import { HttpClient } from '../http/http-client';
import { authenticationAttempts } from './authentication-attempts';
import { schoolStateStore, type SchoolIdentity } from './state-store';

export interface SchoolAuthenticationCommand {
  username: string;
  password: string;
  captcha?: string;
  sessionId?: string;
}
export type SchoolAuthenticationResult =
  | { kind: 'authenticated'; user: SchoolIdentity; steps: LoginStep[] }
  | { kind: 'rejected'; message: string; steps: LoginStep[] }
  | { kind: 'challenge'; message: string; sessionId: string; captchaImage: string; steps: LoginStep[] };

interface CaptchaChallenge { snapshot: string; execution: string; expiresAt: number }

export class SchoolAuthentication {
  private readonly challenges = new Map<string, CaptchaChallenge>();

  async authenticate(command: SchoolAuthenticationCommand, deadlineAt = Date.now() + config.timeout.gradeFreshBudget): Promise<SchoolAuthenticationResult> {
    const context = requestContext(deadlineAt);
    const attempt = authenticationAttempts.begin(command.username);
    try {
      let client: HttpClient;
      let execution: string | null;
      if (command.sessionId) {
        const saved = this.challenges.get(command.sessionId);
        this.challenges.delete(command.sessionId);
        if (!saved || Date.now() >= saved.expiresAt) {
          throw new AppError(ErrorCode.CAPTCHA_ERROR, '验证码会话不存在或已过期，请重新获取验证码');
        }
        client = HttpClient.fromSerializedJar(saved.snapshot, deadlineAt);
        execution = saved.execution;
      } else {
        client = new HttpClient(undefined, config.timeout.cas);
        client.setDeadline(deadlineAt);
        execution = await schoolRequestExecutor.step(context, () => new AuthEngine(client).getExecution());
      }
      if (!execution) throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '学校登录服务响应异常，请稍后重试');
      const engine = new AuthEngine(client);
      const result = await schoolRequestExecutor.step(context, () => engine.login(command.username, command.password, command.captcha || '', execution!), false);
      if (!result.success) {
        if (result.needCaptcha) {
          const image = await schoolRequestExecutor.step(context, () => engine.getCaptcha());
          const nextExecution = await schoolRequestExecutor.step(context, () => engine.getExecution());
          if (!nextExecution) throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '学校验证码初始化失败，请稍后重试');
          if (this.challenges.size >= runtimeConfig.captcha.maxChallenges) this.challenges.delete(this.challenges.keys().next().value!);
          const sessionId = crypto.randomUUID();
          this.challenges.set(sessionId, {
            snapshot: client.serializeJar(), execution: nextExecution, expiresAt: Date.now() + config.captchaSessionTtl,
          });
          return { kind: 'challenge', message: result.message || '需要验证码', sessionId, captchaImage: Buffer.from(image).toString('base64'), steps: result.steps || [] };
        }
        if (!result.credentialsRejected) throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '学校认证响应暂时无法识别');
        return { kind: 'rejected', message: result.message || '账号或密码错误', steps: result.steps || [] };
      }
      const user = schoolStateStore.commitAuthentication({
        attempt, encryptedPassword: CryptoHelper.encryptAES(command.password, config.jwtSecret),
        casCookieJar: client.serializeJar(), portalToken: result.portalToken || null,
      });
      return { kind: 'authenticated', user, steps: result.steps || [] };
    } finally {
      authenticationAttempts.finish(attempt);
    }
  }

  cleanupChallenges(): void {
    for (const [id, challenge] of this.challenges) if (Date.now() >= challenge.expiresAt) this.challenges.delete(id);
  }
}
