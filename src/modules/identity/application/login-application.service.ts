/**
 * [INPUT]: 依赖 SchoolAuthentication、IdentityStore、密码匹配、JWT 与时钟 ports
 * [OUTPUT]: 对外提供 LoginApplicationService，本地快捷或 CAS 成功后立即签 JWT，统一登录结果
 * [POS]: Identity 的登录用例，只消费学校认证后的身份，不激活学校能力或等待资料回填
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { AppError, ErrorCode } from '../../../utils/errors';
import type { LoginOutcome } from '../domain/login';
import type { IdentityStorePort, SchoolAuthenticationPort, LoginRuntimePort, LoginTokenPort, PasswordCipherPort } from './login.ports';

export interface LoginCommand { username: string; password: string; captcha?: string; sessionId?: string }
export interface LoginApplicationDependencies {
  school: SchoolAuthenticationPort;
  identityStore: IdentityStorePort;
  cipher: PasswordCipherPort;
  token: LoginTokenPort;
  runtime: LoginRuntimePort;
}
export interface LoginApplicationObserver { onLocalShortcutDisabled?(): void }

export class LoginApplicationService {
  constructor(private readonly dependencies: LoginApplicationDependencies) {}

  async execute(command: LoginCommand, observer: LoginApplicationObserver = {}): Promise<LoginOutcome> {
    const startedAt = this.dependencies.runtime.now().getTime();
    const duration = () => this.dependencies.runtime.now().getTime() - startedAt;
    try {
      if (!command.sessionId) {
        const user = await this.dependencies.identityStore.findByStudentId(command.username);
        if (user) {
          const interactive = this.dependencies.school.requiresInteraction(user.id);
          if (interactive) observer.onLocalShortcutDisabled?.();
          if (!interactive && user.encryptedPassword && this.dependencies.cipher.matches(user.encryptedPassword, command.password)) {
            await this.dependencies.identityStore.touchLocalLogin(user.id, this.dependencies.runtime.now());
            const name = user.name?.trim() || undefined;
            const token = await this.dependencies.token.issue({ userId: user.id, studentId: command.username, name });
            return { kind: 'success', mode: 'local', token, user: { id: user.id, studentId: user.studentId, name, className: user.className?.trim() || '' }, durationMs: duration(), steps: [{ label: 'local', ok: true }] };
          }
        }
      }
      const result = await this.dependencies.school.authenticate(command);
      if (result.kind === 'challenge') {
        return { kind: 'failure', reason: 'captcha-required', message: result.message, durationMs: duration(), steps: result.steps, countsAsFailure: true, challenge: { sessionId: result.sessionId, captchaImage: result.captchaImage } };
      }
      if (result.kind === 'rejected') {
        return { kind: 'failure', reason: 'cas-failed', message: result.message, durationMs: duration(), steps: result.steps, countsAsFailure: true };
      }
      const name = result.user.name?.trim() || undefined;
      const token = await this.dependencies.token.issue({ userId: result.user.id, studentId: result.user.studentId, name });
      return { kind: 'success', mode: 'school', token, user: { ...result.user, name, className: result.user.className?.trim() || '' }, durationMs: duration(), steps: result.steps };
    } catch (cause) {
      const captchaExpired = cause instanceof AppError && cause.code === ErrorCode.CAPTCHA_ERROR;
      const timeout = (cause instanceof AppError && cause.code === ErrorCode.UPSTREAM_TIMEOUT);
      return {
        kind: 'failure', reason: captchaExpired ? 'captcha-session-missing' : timeout ? 'upstream-timeout' : 'exception',
        message: captchaExpired ? cause.message : timeout ? '学校服务器超时' : '学校认证服务暂不可用',
        durationMs: duration(), steps: [], countsAsFailure: captchaExpired, cause,
      };
    }
  }
}
