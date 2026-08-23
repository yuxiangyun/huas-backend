/**
 * [INPUT]: 依赖登录领域类型与 Campus/Recovery/IdentityStore/Cipher/Token/Profile/Runtime ports
 * [OUTPUT]: 对外提供 LoginApplicationService.execute、CAS 成功即提交上下文但仅在学校系统激活后签发 JWT 的登录编排、验证码挑战与清理入口
 * [POS]: identity/application 的用例核心，把真实学校认证事实、激活能力与本服务 JWT 三个状态转换分离在端口之上
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { LoginFailure, LoginOutcome, LoginStep } from '../domain/login';
import type {
  CampusLoginPort,
  IdentityStorePort,
  LoginApplicationConfig,
  LoginRecoveryPort,
  LoginRuntimePort,
  LoginTokenPort,
  PasswordCipherPort,
  UserProfilePort,
} from './login.ports';

export interface LoginCommand {
  username: string;
  password: string;
  captcha?: string;
  sessionId?: string;
}

interface CaptchaSessionRecord {
  snapshot: string;
  execution: string;
  createdAt: number;
}

export interface LoginApplicationDependencies {
  campus: CampusLoginPort;
  recovery: LoginRecoveryPort;
  identityStore: IdentityStorePort;
  cipher: PasswordCipherPort;
  token: LoginTokenPort;
  profile: UserProfilePort;
  runtime: LoginRuntimePort;
  config: LoginApplicationConfig;
}

export interface LoginApplicationObserver {
  onLocalShortcutDisabled?(): void;
}

export class LoginApplicationService {
  private readonly captchaSessions = new Map<string, CaptchaSessionRecord>();

  constructor(private readonly dependencies: LoginApplicationDependencies) {}

  async execute(command: LoginCommand, observer: LoginApplicationObserver = {}): Promise<LoginOutcome> {
    const executeStartedAt = this.dependencies.runtime.now().getTime();

    try {
      const local = await this.tryLocalLogin(command, executeStartedAt, observer);
      if (local) return local;

      const prepared = await this.prepareCampusSession(command, executeStartedAt);
      if ('kind' in prepared) return prepared;

      const loginStartedAt = this.dependencies.runtime.now().getTime();
      const loginResult = await this.dependencies.campus.login({
        session: prepared.session,
        username: command.username,
        password: command.password,
        captcha: command.captcha || '',
        execution: prepared.execution,
      });
      const durationMs = this.elapsed(loginStartedAt);

      if (!loginResult.success) {
        if (loginResult.needCaptcha) {
          return this.createCaptchaChallenge(
            prepared.session,
            loginResult.steps || [],
            durationMs,
            loginResult.message || '需要验证码',
          );
        }
        return this.failure('cas-failed', loginResult.message || '登录失败', durationMs, loginResult.steps || [], true);
      }

      let portalToken = loginResult.portalToken || null;
      let loginSteps = [...(loginResult.steps || [])];
      let jwResult: Awaited<ReturnType<CampusLoginPort['exchangeJwSession']>> = {
        success: false,
        steps: [],
      };
      let activationError: unknown = null;
      try {
        if (!portalToken) {
          const portalResult = await this.dependencies.campus.exchangePortalToken(prepared.session);
          portalToken = portalResult.token;
          loginSteps = [...loginSteps, ...portalResult.steps];
        }
        jwResult = await this.dependencies.campus.exchangeJwSession(prepared.session);
      } catch (cause) {
        activationError = cause;
      }
      const allSteps = [...loginSteps, ...jwResult.steps];

      const encryptedPassword = this.dependencies.cipher.encrypt(command.password);
      const cookieJar = this.dependencies.campus.snapshot(prepared.session);
      const user = await this.dependencies.identityStore.commitRealSchoolLogin({
        studentId: command.username,
        encryptedPassword,
        credentials: {
          casCookieJar: cookieJar,
          portalToken,
          jwCookieJar: jwResult.success ? cookieJar : null,
        },
        at: this.dependencies.runtime.now(),
      });

      if (activationError) throw activationError;
      if (!portalToken && !jwResult.success) {
        return this.failure('school-activation-failed', '学校系统激活失败', durationMs, allSteps, true);
      }

      let resolvedName = user.name?.trim() || undefined;
      let resolvedClassName = user.className?.trim() || '';
      if (portalToken && (!resolvedName || !resolvedClassName)) {
        try {
          const profile = await this.dependencies.profile.backfill(user.id, command.username);
          resolvedName = profile?.name?.trim() || resolvedName;
          resolvedClassName = profile?.className?.trim() || resolvedClassName;
        } catch {
          // Portal 资料是增强信息，不得反向破坏已经提交的认证事实。
        }
      }

      const token = await this.dependencies.token.issue({
        userId: user.id,
        studentId: command.username,
        name: resolvedName,
      });

      return {
        kind: 'success',
        mode: jwResult.success ? 'school' : 'portal-only',
        token,
        user: {
          id: user.id,
          studentId: command.username,
          name: resolvedName,
          className: resolvedClassName,
        },
        durationMs,
        steps: allSteps,
      };
    } catch (cause: any) {
      const timeout = cause?.message === 'REQUEST_TIMEOUT';
      return this.failure(
        timeout ? 'upstream-timeout' : 'exception',
        timeout ? '学校服务器超时' : '登录服务异常',
        this.elapsed(executeStartedAt),
        [],
        false,
        cause,
      );
    }
  }

  private async tryLocalLogin(
    command: LoginCommand,
    startedAt: number,
    observer: LoginApplicationObserver,
  ): Promise<LoginOutcome | null> {
    if (command.sessionId) return null;

    const user = await this.dependencies.identityStore.findByStudentId(command.username);
    if (!user) return null;
    if (await this.dependencies.recovery.requiresInteractiveLogin(user.id)) {
      observer.onLocalShortcutDisabled?.();
      return null;
    }
    if (!user.encryptedPassword || !this.dependencies.cipher.matches(user.encryptedPassword, command.password)) return null;

    await this.dependencies.identityStore.touchLocalLogin(user.id, this.dependencies.runtime.now());
    const resolvedName = user.name?.trim() || undefined;
    const token = await this.dependencies.token.issue({ userId: user.id, studentId: command.username, name: resolvedName });
    return {
      kind: 'success',
      mode: 'local',
      token,
      user: {
        id: user.id,
        studentId: command.username,
        name: resolvedName,
        className: user.className?.trim() || '',
      },
      durationMs: this.elapsed(startedAt),
      steps: [{ label: 'local', ok: true }],
    };
  }

  private async prepareCampusSession(command: LoginCommand, startedAt: number) {
    if (command.sessionId) {
      const saved = this.captchaSessions.get(command.sessionId);
      if (!saved) {
        return this.failure('captcha-session-missing', '验证码会话不存在或已过期，请重新获取验证码', this.elapsed(startedAt), [], true);
      }
      this.captchaSessions.delete(command.sessionId);
      if (!saved.execution) {
        return this.failure('captcha-session-invalid', '验证码会话已失效，请重新获取验证码', this.elapsed(startedAt), [], true);
      }
      return { session: this.dependencies.campus.restore(saved.snapshot), execution: saved.execution };
    }

    try {
      const prepared = await this.dependencies.campus.start();
      if (!prepared.execution) {
        return this.failure('missing-execution', '无法获取登录凭据', this.elapsed(startedAt), [], true);
      }
      return { session: prepared.session, execution: prepared.execution };
    } catch (cause) {
      return this.failure('execution-fetch-failed', '登录服务异常', this.elapsed(startedAt), [], false, cause);
    }
  }

  private async createCaptchaChallenge(
    session: Parameters<CampusLoginPort['snapshot']>[0],
    steps: LoginStep[],
    durationMs: number,
    message: string,
  ): Promise<LoginFailure> {
    try {
      const buffer = await this.dependencies.campus.getCaptcha(session);
      const execution = await this.dependencies.campus.getExecution(session);
      if (!execution) {
        return this.failure('captcha-session-init-failed', '需要验证码，但验证码会话初始化失败，请重试', durationMs, steps, true);
      }

      if (this.captchaSessions.size >= this.dependencies.config.maxCaptchaSessions) {
        const oldest = this.captchaSessions.keys().next().value;
        if (oldest) this.captchaSessions.delete(oldest);
      }
      const sessionId = this.dependencies.runtime.createId();
      this.captchaSessions.set(sessionId, {
        snapshot: this.dependencies.campus.snapshot(session),
        execution,
        createdAt: this.dependencies.runtime.now().getTime(),
      });
      return {
        ...this.failure('captcha-required', message, durationMs, steps, true),
        challenge: { sessionId, captchaImage: this.dependencies.runtime.encodeBase64(buffer) },
      };
    } catch {
      return this.failure('captcha-fetch-failed', '需要验证码，但获取失败', durationMs, steps, true);
    }
  }

  cleanupExpiredCaptchaSessions(): void {
    const now = this.dependencies.runtime.now().getTime();
    for (const [id, session] of this.captchaSessions) {
      if (now - session.createdAt > this.dependencies.config.captchaSessionTtlMs) this.captchaSessions.delete(id);
    }
  }

  private elapsed(startedAt: number): number {
    return this.dependencies.runtime.now().getTime() - startedAt;
  }

  private failure(
    reason: LoginFailure['reason'],
    message: string,
    durationMs: number,
    steps: LoginStep[],
    countsAsFailure: boolean,
    cause?: unknown,
  ): LoginFailure {
    return { kind: 'failure', reason, message, durationMs, steps, countsAsFailure, cause };
  }
}
