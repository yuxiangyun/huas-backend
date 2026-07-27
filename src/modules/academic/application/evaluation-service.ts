/**
 * [INPUT]: 依赖 EvaluationApplicationPorts、canonical EvaluationParser、config、Logger 与 AcademicHttpClient
 * [OUTPUT]: 对外提供 EvaluationApplicationService、EvaluationParser 与评教公开结果类型
 * [POS]: academic/application 的评教用例编排器，负责批次控制和稳定业务字段提交确认
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import {
  assertJwEvaluationListUrl,
  assertSuccessfulEvaluationSubmitHtml,
  EvaluationParser,
  isEvaluationSubmitted,
  normalizeEvaluationText,
  safeJwUrl,
  type EvaluationListRow,
} from '../../campus-integrations/jw/parsers/evaluation-parser';
import { Logger } from '../../../utils/logger';
import type { AcademicHttpClient } from '../domain/ports';
import type {
  EvaluationApplicationPorts,
  EvaluationDiscoveryResult,
  EvaluationListItem,
  EvaluationStatusResult,
  EvaluationSubmitItem,
  EvaluationSubmitResult,
} from '../domain/evaluation';

export { EvaluationParser };
export type {
  EvaluationDiscoveryResult,
  EvaluationListItem,
  EvaluationStatusResult,
  EvaluationSubmitItem,
  EvaluationSubmitResult,
} from '../domain/evaluation';

interface PendingVerification {
  target: EvaluationListRow;
  item: EvaluationListItem;
  questionCount: number;
  fullScore: number;
}

const DEFAULT_COMMENT = '好';
const DEFAULT_BATCH_SIZE = 2;
const MAX_BATCH_SIZE = 3;

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

async function fetchEvaluationRows(client: AcademicHttpClient, listUrl: string) {
  const response = await client.request(listUrl, { timeout: config.timeout.business });
  assertEvaluationResponse(response, 'EVALUATION_LIST');
  return EvaluationParser.extractListRows(await response.text());
}

function rethrowSessionExpired(error: unknown) {
  if (String((error as any)?.message || '') === 'SESSION_EXPIRED') throw error;
}

export class EvaluationApplicationService {
  constructor(private readonly ports: EvaluationApplicationPorts) {}

  async discoverListUrlFromClient(client: AcademicHttpClient): Promise<EvaluationDiscoveryResult> {
    return this.ports.discoverEvaluation(client);
  }

  async discoverListUrl(userId: number) {
    return this.ports.upstream(userId, 'jw', ({ client }) => this.discoverListUrlFromClient(client));
  }

  async getStatus(userId: number, listUrl: string) {
    const safeUrl = assertJwEvaluationListUrl(listUrl);
    return this.ports.upstream(userId, 'jw', async ({ client }) => toStatus(await fetchEvaluationRows(client, safeUrl)));
  }

  async submitFullScoreFromClient(
    client: AcademicHttpClient,
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

  async submitFullScore(
    userId: number,
    listUrl: string,
    options: { dryRun?: boolean; comment?: string; batchSize?: number } = {},
  ) {
    return this.ports.upstream(userId, 'jw', ({ client }) => this.submitFullScoreFromClient(client, listUrl, options));
  }
}
