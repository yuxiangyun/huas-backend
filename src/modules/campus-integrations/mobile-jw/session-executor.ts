/**
 * [INPUT]: 依赖共享 Portal-only reader、模块会话仓储/SSO exchanger、HttpClient、singleflight、retry 与总预算
 * [OUTPUT]: 对外提供 MobileJwSessionExecutor，只执行白名单只读请求并无感恢复明确失效的学校会话
 * [POS]: mobile-jw 的认证编排边界，按 generation 删除、按 epoch 写入，恢复共享会话而不共享调用方客户端
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { PerKeySingleflight } from '../../cache/application/singleflight';
import { portalCredentialReader, type PortalCredentialReader } from '../credential-recovery/portal-credential-reader';
import { URLS } from '../endpoints';
import { HttpClient } from '../http/http-client';
import { retryAsync } from '../http/retry';
import { isTransientTransportError } from '../http/transport-errors';
import { MobileJwAuthExchanger, type MobileJwSessionExchangePort } from './auth-exchanger';
import { assertHttpSuccess, credentialRejected, isSessionExpired, isTemporaryCredentialFailure, MobileJwError, normalizeFailure } from './errors';
import { mobileJwSessionRepository, type MobileJwSession, type MobileJwSessionRepository } from './session-repository';

export interface MobileJwResponse { status: number; body: unknown }

// 不接受外部 URL；POST 的重放资格由这份只读操作清单显式限定。
export const MOBILE_JW_READ_PATHS = {
  semesters: '/semesterList',
  semesterDictionary: '/findDictionry',
  timeModes: '/Get_sjkbms',
  nodes: '/nodeLIst',
  current: '/student/curriculum',
  selected: '/student/getSycurriculum',
} as const;
export type MobileJwReadOperation = keyof typeof MOBILE_JW_READ_PATHS;

export class MobileJwSessionExecutor {
  private readonly flights = new PerKeySingleflight();

  constructor(
    private readonly exchanger: MobileJwSessionExchangePort = new MobileJwAuthExchanger(),
    private readonly sessions: MobileJwSessionRepository = mobileJwSessionRepository,
    private readonly portal: PortalCredentialReader = portalCredentialReader,
  ) {}

  async post(
    userId: number,
    operation: MobileJwReadOperation,
    params: Record<string, string>,
    deadlineAt = Date.now() + config.timeout.mobileJwTotalBudget,
  ): Promise<MobileJwResponse> {
    try {
      let session = await this.resolveOrCreate(userId, deadlineAt);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await this.request(session, operation, params, deadlineAt);
        if (!isSessionExpired(result.status, result.body)) return result;
        await this.sessions.invalidateGeneration(userId, session.generation);
        if (attempt === 0) session = await this.resolveOrCreate(userId, deadlineAt);
      }
      throw credentialRejected();
    } catch (error) {
      throw normalizeFailure(error);
    }
  }

  private async resolveOrCreate(userId: number, deadlineAt: number): Promise<MobileJwSession> {
    if (Date.now() >= deadlineAt) throw new Error('REQUEST_TIMEOUT');
    const stored = await this.sessions.read(userId);
    if (stored) return stored;
    return this.flights.run(`mobile-jw-session:${userId}`, 'normal', async () => {
      const concurrent = await this.sessions.read(userId);
      if (concurrent) return concurrent;
      let portalRecoveryAttempted = false;
      let epochMismatchCount = 0;
      while (epochMismatchCount < 2) {
        if (Date.now() >= deadlineAt) throw new Error('REQUEST_TIMEOUT');
        const portal = await this.retry(() => this.portal.readOrRestore(userId, deadlineAt), deadlineAt);
        if (!portal) throw credentialRejected();
        let token: string;
        try {
          token = await this.retry(() => this.exchanger.exchange(portal.portalJwt, deadlineAt), deadlineAt);
        } catch (error) {
          if (error instanceof MobileJwError && error.kind === 'credential') {
            // 第二次交换同样拒绝时也清理当前坏 Portal，但不继续登录循环。
            await this.portal.rejectIfCurrent(userId, portal.portalJwt);
            if (!portalRecoveryAttempted) {
              portalRecoveryAttempted = true;
              continue;
            }
          }
          throw error;
        }
        const created = await this.sessions.createIfLoginEpochMatches(userId, portal.loginEpoch, token);
        if (created) return created;
        const fresh = await this.sessions.read(userId);
        if (fresh) return fresh;
        epochMismatchCount += 1;
      }
      throw credentialRejected();
    });
  }

  private async request(
    session: MobileJwSession,
    operation: MobileJwReadOperation,
    params: Record<string, string>,
    deadlineAt: number,
  ): Promise<MobileJwResponse> {
    const url = new URL(URLS.mobileJwBase + MOBILE_JW_READ_PATHS[operation]);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const client = new HttpClient();
    client.setDeadline(deadlineAt);
    return this.retry(async () => {
      const response = await client.request(url.toString(), {
        method: 'POST', isAuthFlow: true,
        headers: { token: session.token, Accept: 'application/json' },
      });
      const text = await response.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = null; }
      // 认证错误必须先于普通 500 判定，否则会拿旧 token 反复重试而不恢复。
      if (!isSessionExpired(response.status, body) && [500, 502, 503, 504].includes(response.status)) {
        assertHttpSuccess(response.status);
      }
      return { status: response.status, body };
    }, deadlineAt);
  }

  private retry<T>(operation: () => Promise<T>, deadlineAt: number): Promise<T> {
    return retryAsync(operation, {
      attempts: config.retry.businessMaxAttempts,
      baseDelayMs: config.retry.businessBaseDelayMs,
      maxDelayMs: config.retry.businessMaxDelayMs,
      jitterMs: config.retry.businessJitterMs,
      deadlineAt,
      createDeadlineError: () => new Error('REQUEST_TIMEOUT'),
      shouldRetry: (error) => isTransientTransportError(error) || isTemporaryCredentialFailure(error)
        || (error instanceof MobileJwError && (error.kind === 'timeout' || error.kind === 'unavailable')),
    });
  }
}

export const mobileJwSessionExecutor = new MobileJwSessionExecutor();
