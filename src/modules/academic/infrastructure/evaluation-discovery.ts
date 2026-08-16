/**
 * [INPUT]: 依赖 AcademicHttpClient、canonical 评教/会话页解析器、端点与 config timeout
 * [OUTPUT]: 对外提供 discoverEvaluationListUrlFromClient，有限遍历评教入口并隔离已认证会话中的局部登录页
 * [POS]: academic/infrastructure 的评教发现适配器，被成绩门禁与评教用例共同复用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { URLS } from '../../campus-integrations/endpoints';
import {
  assertJwEvaluationListUrl,
  EVALUATION_LIST_PATH,
  EvaluationParser,
  safeJwUrl,
} from '../../campus-integrations/jw/parsers/evaluation-parser';
import { looksLikeAuthenticatedJwMainPage } from '../../campus-integrations/jw/parsers/session-page';
import type { AcademicHttpClient } from '../domain/ports';
import type { EvaluationDiscoveryResult } from '../domain/grade';

const MAX_DISCOVERY_PAGES = 8;
const DISCOVERY_ENTRY_URLS = [URLS.jwMain, URLS.jwIndex, `${URLS.jwBase}/`];

function isSessionExpired(error: unknown): boolean {
  return error instanceof Error && error.message === 'SESSION_EXPIRED';
}

function assertDiscoveryResponse(response: Response, allowRedirect = false) {
  if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
  if (response.status >= 200 && response.status < 300) return;
  if (allowRedirect && response.status >= 300 && response.status < 400 && response.headers.get('location')) return;
  throw new Error(`EVALUATION_DISCOVERY_HTTP_${response.status}`);
}

export async function discoverEvaluationListUrlFromClient(
  client: AcademicHttpClient,
): Promise<EvaluationDiscoveryResult> {
  const queue = [...DISCOVERY_ENTRY_URLS];
  const visited = new Set<string>();
  let authenticatedSessionObserved = false;

  while (queue.length > 0 && visited.size < MAX_DISCOVERY_PAGES) {
    const pageUrl = queue.shift();
    if (!pageUrl || visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    const response = await client.request(pageUrl, { timeout: config.timeout.business });
    assertDiscoveryResponse(response, true);
    const location = response.headers.get('location');
    if (location) {
      const nextUrl = safeJwUrl(location, pageUrl);
      if (nextUrl) {
        const listUrl = new URL(nextUrl).pathname === EVALUATION_LIST_PATH
          ? assertJwEvaluationListUrl(nextUrl)
          : null;
        if (listUrl) return { evaluationRequired: true, listUrl };
        if (!visited.has(nextUrl)) queue.unshift(nextUrl);
      }
      continue;
    }

    const html = await response.text();
    authenticatedSessionObserved ||= looksLikeAuthenticatedJwMainPage(html);

    try {
      const listUrl = EvaluationParser.extractEvaluationListUrl(html, pageUrl);
      if (listUrl) return { evaluationRequired: true, listUrl };

      for (const entryUrl of EvaluationParser.extractEvaluationEntryUrls(html, pageUrl)) {
        if (!visited.has(entryUrl)) queue.unshift(entryUrl);
      }
      for (const navUrl of EvaluationParser.extractJwNavigationUrls(html, pageUrl)) {
        if (!visited.has(navUrl)) queue.push(navUrl);
      }
    } catch (error) {
      // JW 的部分旧入口会独立返回登录页；已确认主框架有效后，这只是候选不可用，
      // 不能删除整个用户共享的 jw_session 并把小程序踢回登录页。
      if (authenticatedSessionObserved && isSessionExpired(error)) continue;
      throw error;
    }
  }

  return { evaluationRequired: false, listUrl: null };
}
