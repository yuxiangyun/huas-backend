/**
 * [INPUT]: 依赖模块自有 SessionRepository、共享 CookieJar codec、可条件拒绝当前 JWT 的窄 PortalCredentialReader、AuthExchanger、HttpClient、PerKeySingleflight 与有界 retry
 * [OUTPUT]: 对外提供 MobileYxtSessionExecutor、mobileYxtSessionExecutor 与纯函数 isMobileYxtSessionExpired
 * [POS]: mobile-yxt 会话执行边界，消费 repository 已验证的最小 CookieJar，并集中落实明确 401、Portal-only 恢复、generation 条件失效与一次重建重试
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { PerKeySingleflight } from '../../cache/application/singleflight';
import { retryAsync } from '../http/retry';
import { HttpClient } from '../http/http-client';
import {
  MobileYxtAuthExchanger,
  type MobileYxtSessionExchangePort,
} from './auth-exchanger';
import {
  isMobileYxtCredentialRejected,
  mobileYxtCredentialRejected,
  normalizeMobileYxtTransportError,
} from './mobile-yxt-errors';
import {
  mobileYxtSessionRepository,
  type MobileYxtSessionRepository,
} from './session-repository';
import {
  portalCredentialReader,
  type PortalCredentialReader,
} from './portal-credential-reader';
import { requireMobileYxtCookieJar } from './session-cookie-codec';

export interface MobileYxtResult {
  response: Response;
  body: unknown;
}

interface ActiveSession {
  client: HttpClient;
  accessToken: string;
  generation: string;
}

const sessionFlights = new PerKeySingleflight();

export function isMobileYxtSessionExpired(response: Pick<Response, 'status'>, _body: unknown): boolean {
  // 当前证据只固定 HTTP 401。403/code/message 在真实 fixture 出现前不得扩张。
  return response.status === 401;
}

function isTransientRequestError(error: unknown): boolean {
  const message = String((error as any)?.message || '');
  return message === 'REQUEST_TIMEOUT'
    || /ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(message);
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class MobileYxtSessionExecutor {
  constructor(
    private readonly exchanger: MobileYxtSessionExchangePort = new MobileYxtAuthExchanger(),
    private readonly sessions: MobileYxtSessionRepository = mobileYxtSessionRepository,
    private readonly portalCredentials: PortalCredentialReader = portalCredentialReader,
  ) {}

  async post(
    userId: number,
    url: string,
    payload: unknown,
    deadlineAt = Date.now() + config.timeout.mobileYxtTotalBudget,
  ): Promise<MobileYxtResult> {
    let session = await this.resolveOrCreate(userId, deadlineAt);
    let result = await this.request(session, url, payload, deadlineAt);
    if (!isMobileYxtSessionExpired(result.response, result.body)) return result;

    await this.sessions.invalidateGeneration(userId, session.generation);
    session = await this.resolveOrCreate(userId, deadlineAt);
    result = await this.request(session, url, payload, deadlineAt);
    if (isMobileYxtSessionExpired(result.response, result.body)) {
      await this.sessions.invalidateGeneration(userId, session.generation);
      throw mobileYxtCredentialRejected();
    }
    return result;
  }

  private async resolveOrCreate(userId: number, deadlineAt: number): Promise<ActiveSession> {
    const existing = await this.resolveStored(userId, deadlineAt);
    if (existing) return existing;

    return sessionFlights.run(`mobile-yxt-session:${userId}`, 'normal', async () => {
      const concurrent = await this.resolveStored(userId, deadlineAt);
      if (concurrent) return concurrent;

      // Portal JWT 被 host/open 明确 401 拒绝时只条件失效当前值，并经窄端口恢复一次。
      // epoch 在交换期间变化时丢弃迟到结果，并只允许基于新登录上下文再交换一次。
      let portalRecoveryAttempted = false;
      let epochMismatchCount = 0;
      while (epochMismatchCount < 2) {
        const portal = await this.portalCredentials.readOrRestore(userId, deadlineAt);
        if (!portal) throw mobileYxtCredentialRejected();

        const portalClient = new HttpClient();
        portalClient.setDeadline(deadlineAt);
        let exchanged: Awaited<ReturnType<MobileYxtSessionExchangePort['exchange']>>;
        try {
          exchanged = await this.exchanger.exchange(portalClient, portal.portalJwt, deadlineAt);
        } catch (error) {
          if (isMobileYxtCredentialRejected(error) && !portalRecoveryAttempted) {
            portalRecoveryAttempted = true;
            await this.portalCredentials.rejectIfCurrent(userId, portal.portalJwt);
            continue;
          }
          throw error;
        }
        const created = await this.sessions.createIfLoginEpochMatches({
          userId,
          expectedLoginEpoch: portal.loginEpoch,
          accessToken: exchanged.accessToken,
          cookieJar: exchanged.cookieJar,
        });
        if (created) return {
          client: this.createClient(created.cookieJar, deadlineAt),
          accessToken: created.accessToken,
          generation: created.generation,
        };

        const concurrent = await this.resolveStored(userId, deadlineAt);
        if (concurrent) return concurrent;
        epochMismatchCount += 1;
      }
      throw mobileYxtCredentialRejected();
    });
  }

  private async resolveStored(userId: number, deadlineAt: number): Promise<ActiveSession | null> {
    const resolved = await this.sessions.read(userId);
    if (!resolved) return null;
    return {
      client: this.createClient(resolved.cookieJar, deadlineAt),
      accessToken: resolved.accessToken,
      generation: resolved.generation,
    };
  }

  private createClient(cookieJar: string, deadlineAt: number): HttpClient {
    const client = new HttpClient(requireMobileYxtCookieJar(cookieJar).jar);
    client.setDeadline(deadlineAt);
    return client;
  }

  private async request(
    session: ActiveSession,
    url: string,
    payload: unknown,
    deadlineAt: number,
  ): Promise<MobileYxtResult> {
    try {
      return await retryAsync(async () => {
        const response = await session.client.request(url, {
          method: 'POST',
          isAuthFlow: true,
          headers: {
            authorization: session.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        return { response, body: await readResponseBody(response) };
      }, {
        attempts: config.retry.businessMaxAttempts,
        baseDelayMs: config.retry.businessBaseDelayMs,
        maxDelayMs: config.retry.businessMaxDelayMs,
        jitterMs: config.retry.businessJitterMs,
        deadlineAt,
        createDeadlineError: () => new Error('REQUEST_TIMEOUT'),
        shouldRetry: isTransientRequestError,
      });
    } catch (error) {
      throw normalizeMobileYxtTransportError(error);
    }
  }
}

export const mobileYxtSessionExecutor = new MobileYxtSessionExecutor();
