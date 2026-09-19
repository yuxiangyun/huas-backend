/**
 * [INPUT]: 依赖两个派生会话恢复器/仓储、固定学校端点、最小 Cookie codec 与协议失效证据
 * [OUTPUT]: 对外提供内部移动教务六类读取、三类交易分页及电费配置/账户具名操作
 * [POS]: SchoolAccess 的 mobile 单次只读协议；共享快照后为每个调用独立建客户端，由统一执行器恢复重放
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import type { ElectricityAccountQuery } from '../mobile-yxt/electricity-parser';
import { URLS } from '../endpoints';
import { HttpClient } from '../http/http-client';
import { assertHttpSuccess, isSessionExpired } from '../mobile-jw/errors';
import { mobileJwSessionRepository } from '../mobile-jw/session-repository';
import { mobileYxtSessionRepository } from '../mobile-yxt/session-repository';
import { requireMobileYxtCookieJar } from '../mobile-yxt/session-cookie-codec';
import { assertMobileYxtHttpSuccess, mobileYxtCredentialRejected, mobileYxtTimeout, mobileYxtUnavailable } from '../mobile-yxt/mobile-yxt-errors';
import { mobileJwRecovery, mobileYxtRecovery } from './derived-recovery';
import { SchoolAccessError, sessionRejected } from './errors';
import { schoolRequestExecutor, type SchoolRequestContext } from './request-executor';

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function jwRead(path: string) {
  return (userId: number, params: Record<string, string>, context: SchoolRequestContext) => schoolRequestExecutor.operation(context, {
    resolve: () => mobileJwRecovery.ensure(userId, context),
    invalidate: session => mobileJwSessionRepository.invalidateGeneration(userId, session.generation),
    run: async session => {
      const client = new HttpClient();
      client.setDeadline(context.deadlineAt);
      const url = new URL(URLS.mobileJwBase + path);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      const response = await client.request(url.toString(), {
        method: 'POST', headers: { token: session.token, Accept: 'application/json' },
      });
      const body = await responseBody(response);
      if (isSessionExpired(response.status, body)) throw sessionRejected();
      assertHttpSuccess(response.status);
      return { status: response.status, body };
    },
    replayable: true,
  });
}

// 仅注册只读路径；指定学期端点保留内部能力，不作为正式课表来源。
export const mobileJwReads = {
  'mobileJw.semesters': jwRead('/semesterList'),
  'mobileJw.semesterDictionary': jwRead('/findDictionry'),
  'mobileJw.timeModes': jwRead('/Get_sjkbms'),
  'mobileJw.nodes': jwRead('/nodeLIst'),
  'mobileJw.current': jwRead('/student/curriculum'),
  'mobileJw.selected': jwRead('/student/getSycurriculum'),
};

export interface MobileYxtResponse { status: number; contentType: string | null; body: unknown }
async function yxtRead(userId: number, url: string, payload: object, context: SchoolRequestContext): Promise<MobileYxtResponse> {
  try {
    return await schoolRequestExecutor.operation(context, {
      resolve: () => mobileYxtRecovery.ensure(userId, context),
      invalidate: session => mobileYxtSessionRepository.invalidateGeneration(userId, session.generation),
      run: async session => {
        const client = new HttpClient(requireMobileYxtCookieJar(session.cookieJar).jar);
        client.setDeadline(context.deadlineAt);
        const response = await client.request(url, {
          method: 'POST', headers: { authorization: session.accessToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        // 只认已验证的 HTTP 401；403、业务 code 和正文不能扩张会话失效判定。
        if (response.status === 401) throw sessionRejected();
        assertMobileYxtHttpSuccess(response.status);
        return { status: response.status, contentType: response.headers.get('content-type'), body: await responseBody(response) };
      },
      replayable: true,
    });
  } catch (error) {
    // 业务缓存沿用既有 stale 资格；明确交互与协议失败原样传播。
    if (error instanceof SchoolAccessError) {
      if (error.kind === 'timeout') throw mobileYxtTimeout();
      if (error.kind === 'unavailable') throw error.retryable ? mobileYxtUnavailable() : mobileYxtCredentialRejected();
    }
    throw error;
  }
}

export function readTradePage(userId: number, input: { pageSize: string; tradeType: string; fromDate: string; toDate: string; pageNo: number }, context: SchoolRequestContext) {
  return yxtRead(userId, URLS.mobileYxtTradeList, input, context);
}
export function readElectricityConfig(userId: number, _input: Record<string, never>, context: SchoolRequestContext) {
  return yxtRead(userId, URLS.mobileYxtElectricityConfig, { utilityType: 'electric' }, context);
}
export function readElectricityAccount(userId: number, input: ElectricityAccountQuery, context: SchoolRequestContext) {
  return yxtRead(userId, URLS.mobileYxtElectricityAccount, input, context);
}
