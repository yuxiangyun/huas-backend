/**
 * [INPUT]: 依赖 EvaluationParser、config、upstream、Logger 与 HttpClient 上游响应
 * [OUTPUT]: 对外提供 EvaluationService、EvaluationParser 兼容出口以及评教状态、发现与有界批次提交结果类型
 * [POS]: services/academic 的评教用例编排器，负责上游请求、批次控制和稳定业务字段提交确认
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../config';
import type { HttpClient } from '../../core/http-client';
import { URLS } from '../../core/url-config';
import {
  assertJwEvaluationListUrl,
  assertSuccessfulEvaluationSubmitHtml,
  EVALUATION_LIST_PATH,
  EvaluationParser,
  isEvaluationSubmitted,
  normalizeEvaluationText,
  safeJwUrl,
  type EvaluationListItem,
  type EvaluationListRow,
} from '../../parsers/academic/evaluation-parser';
import { Logger } from '../../utils/logger';
import { upstream } from '../infra/upstream';

export { EvaluationParser };
export type { EvaluationListItem };

export interface EvaluationSubmitItem extends EvaluationListItem {
  questionCount: number;
  fullScore: number;
  status: 'dry_run' | 'submitted' | 'failed';
  message?: string;
}

export interface EvaluationDiscoveryResult {
  evaluationRequired: boolean;
  listUrl: string | null;
}

export interface EvaluationStatusResult {
  total: number;
  pendingCount: number;
  actionableCount: number;
  blockedCount: number;
  completedCount: number;
  items: EvaluationListItem[];
}

export interface EvaluationSubmitResult {
  dryRun: boolean;
  status: EvaluationStatusResult;
  targetCount: number;
  attemptedCount: number;
  previewedCount: number;
  submittedCount: number;
  failedCount: number;
  batch: {
    limit: number;
    availableCount: number;
    selectedCount: number;
    remainingCount: number;
    hasMore: boolean;
    verificationRequests: number;
  };
  items: EvaluationSubmitItem[];
}

interface PendingVerification {
  target: EvaluationListRow;
  item: EvaluationListItem;
  questionCount: number;
  fullScore: number;
}

const DEFAULT_COMMENT = '好';
const MAX_DISCOVERY_PAGES = 8;
const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 3;
const DISCOVERY_ENTRY_URLS = [URLS.jwMain, URLS.jwIndex, `${URLS.jwBase}/`];

function toPublicItem(row: EvaluationListRow): EvaluationListItem {
  const { editUrl: _editUrl, ...item } = row;
  return item;
}

function toStatus(rows: EvaluationListRow[]): EvaluationStatusResult {
  const items = rows.map(toPublicItem);
  return {
    total: items.length,
    pendingCount: items.filter((item) => item.pending).length,
    actionableCount: items.filter((item) => item.actionable).length,
    blockedCount: items.filter((item) => item.blocked).length,
    completedCount: items.filter((item) => isEvaluationSubmitted(item.submitted)).length,
    items,
  };
}

function normalizeBatchSize(rawBatchSize: number | undefined) {
  if (!Number.isFinite(rawBatchSize)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(rawBatchSize!)));
}

function assertEvaluationResponse(response: Response, operation: string, allowRedirect = false) {
  if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
  if (response.status >= 200 && response.status < 300) return;
  if (allowRedirect && response.status >= 300 && response.status < 400 && response.headers.get('location')) return;
  throw new Error(`${operation}_HTTP_${response.status}`);
}

function assertSubmitResponse(response: Response, html: string, actionUrl: string) {
  if (response.status === 401 || response.status === 403) throw new Error('SESSION_EXPIRED');
  if (response.status < 200 || response.status >= 400) throw new Error(`SUBMIT_HTTP_${response.status}`);

  if (!html.trim()) {
    const location = response.headers.get('location');
    if (location && safeJwUrl(location, actionUrl)) return;
    throw new Error('SUBMIT_RESPONSE_EMPTY');
  }
  assertSuccessfulEvaluationSubmitHtml(html);
}

function evaluationIdentity(row: EvaluationListRow) {
  return [row.teacherId, row.teacherName, row.college, row.category].join('\u0000');
}

function submittedCountForIdentity(rows: EvaluationListRow[], target: EvaluationListRow) {
  const identity = evaluationIdentity(target);
  return rows.filter((row) => evaluationIdentity(row) === identity && isEvaluationSubmitted(row.submitted)).length;
}

function isConfirmedSubmitted(initialRows: EvaluationListRow[], finalRows: EvaluationListRow[], target: EvaluationListRow) {
  return submittedCountForIdentity(finalRows, target) > submittedCountForIdentity(initialRows, target);
}

async function fetchEvaluationRows(client: HttpClient, listUrl: string) {
  const response = await client.request(listUrl, { timeout: config.timeout.business });
  assertEvaluationResponse(response, 'EVALUATION_LIST');
  return EvaluationParser.extractListRows(await response.text());
}

function rethrowSessionExpired(error: unknown) {
  if (String((error as any)?.message || '') === 'SESSION_EXPIRED') throw error;
}

export class EvaluationService {
  static async discoverListUrlFromClient(client: HttpClient): Promise<EvaluationDiscoveryResult> {
    const queue = [...DISCOVERY_ENTRY_URLS];
    const visited = new Set<string>();

    while (queue.length > 0 && visited.size < MAX_DISCOVERY_PAGES) {
      const pageUrl = queue.shift();
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);

      const response = await client.request(pageUrl, { timeout: config.timeout.business });
      assertEvaluationResponse(response, 'EVALUATION_DISCOVERY', true);
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
      const listUrl = EvaluationParser.extractEvaluationListUrl(html, pageUrl);
      if (listUrl) return { evaluationRequired: true, listUrl };

      for (const entryUrl of EvaluationParser.extractEvaluationEntryUrls(html, pageUrl)) {
        if (!visited.has(entryUrl)) queue.unshift(entryUrl);
      }
      for (const navUrl of EvaluationParser.extractJwNavigationUrls(html, pageUrl)) {
        if (!visited.has(navUrl)) queue.push(navUrl);
      }
    }

    return { evaluationRequired: false, listUrl: null };
  }

  static async discoverListUrl(userId: number) {
    return upstream(userId, 'jw', ({ client }) => this.discoverListUrlFromClient(client));
  }

  static async getStatus(userId: number, listUrl: string) {
    const safeUrl = assertJwEvaluationListUrl(listUrl);
    return upstream(userId, 'jw', async ({ client }) => toStatus(await fetchEvaluationRows(client, safeUrl)));
  }

  static async submitFullScoreFromClient(
    client: HttpClient,
    listUrl: string,
    options: { dryRun?: boolean; comment?: string; batchSize?: number } = {},
  ): Promise<EvaluationSubmitResult> {
    const safeUrl = assertJwEvaluationListUrl(listUrl);
    const dryRun = options.dryRun ?? true;
    const comment = normalizeEvaluationText(options.comment || DEFAULT_COMMENT) || DEFAULT_COMMENT;
    const batchLimit = normalizeBatchSize(options.batchSize);
    const rows = await fetchEvaluationRows(client, safeUrl);
    const actionableRows = rows.filter((row) => row.actionable);
    const targetRows = actionableRows.slice(0, batchLimit);
    const outcomes: Array<EvaluationSubmitItem | PendingVerification> = [];
    let attemptedCount = 0;

    for (const row of targetRows) {
      const baseItem = toPublicItem(row);
      let questionCount = 0;
      let fullScore = 0;

      try {
        const editResponse = await client.request(row.editUrl, { timeout: config.timeout.business });
        assertEvaluationResponse(editResponse, 'EVALUATION_FORM');
        const form = EvaluationParser.buildFullScoreForm(await editResponse.text(), row.editUrl, comment);
        questionCount = form.questionCount;
        fullScore = form.fullScore;

        if (dryRun) {
          outcomes.push({ ...baseItem, questionCount, fullScore, status: 'dry_run' });
          continue;
        }

        attemptedCount += 1;
        const submitResponse = await client.request(form.actionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: row.editUrl },
          body: form.body,
          timeout: config.timeout.business,
        });
        assertSubmitResponse(submitResponse, await submitResponse.text(), form.actionUrl);
        outcomes.push({ target: row, item: baseItem, questionCount, fullScore });
      } catch (error: any) {
        rethrowSessionExpired(error);
        outcomes.push({
          ...baseItem,
          questionCount,
          fullScore,
          status: 'failed',
          message: String(error?.message || 'SUBMIT_FAILED'),
        });
      }
    }

    const verificationRequests = !dryRun && attemptedCount > 0 ? 1 : 0;
    const finalRows = verificationRequests ? await fetchEvaluationRows(client, safeUrl) : rows;
    const results = outcomes.map((outcome): EvaluationSubmitItem => {
      if (!('target' in outcome)) return outcome;
      const submitted = isConfirmedSubmitted(rows, finalRows, outcome.target);
      return {
        ...outcome.item,
        questionCount: outcome.questionCount,
        fullScore: outcome.fullScore,
        status: submitted ? 'submitted' : 'failed',
        ...(!submitted && { message: 'SUBMIT_NOT_CONFIRMED' }),
      };
    });
    const status = toStatus(finalRows);
    const previewedCount = results.filter((item) => item.status === 'dry_run').length;
    const submittedCount = results.filter((item) => item.status === 'submitted').length;
    const failedCount = results.filter((item) => item.status === 'failed').length;

    Logger.operation(
      'Evaluation',
      dryRun ? '评教满分组参预检' : '评教满分提交',
      undefined,
      undefined,
      `available=${actionableRows.length}; target=${targetRows.length}; attempted=${attemptedCount}; previewed=${previewedCount}; submitted=${submittedCount}; failed=${failedCount}; remaining=${status.actionableCount}; blocked=${status.blockedCount}`,
    );

    return {
      dryRun,
      status,
      targetCount: targetRows.length,
      attemptedCount,
      previewedCount,
      submittedCount,
      failedCount,
      batch: {
        limit: batchLimit,
        availableCount: actionableRows.length,
        selectedCount: targetRows.length,
        remainingCount: status.actionableCount,
        hasMore: status.actionableCount > 0,
        verificationRequests,
      },
      items: results,
    };
  }

  static async submitFullScore(
    userId: number,
    listUrl: string,
    options: { dryRun?: boolean; comment?: string; batchSize?: number } = {},
  ) {
    return upstream(userId, 'jw', ({ client }) => this.submitFullScoreFromClient(client, listUrl, options));
  }
}
