/**
 * [INPUT]: 依赖 EvaluationApplicationPorts、canonical EvaluationParser、config、Logger 与 AcademicHttpClient
 * [OUTPUT]: 对外提供 EvaluationApplicationService、EvaluationParser 与评教公开结果类型
 * [POS]: academic/application 的评教用例编排器，只选择一次有界目标，可恢复读取与一次性提交分离；已尝试 POST 仅凭列表增量确认成功，无增量或回查失败均保留 unknown
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
  error?: string;
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

async function fetchEvaluationRows(client: AcademicHttpClient, listUrl: string) {
  const response = await client.request(listUrl, { timeout: config.timeout.business });
  assertEvaluationResponse(response, 'EVALUATION_LIST');
  return EvaluationParser.extractListRows(await response.text());
}

type EvaluationRead = <T>(operation: (client: AcademicHttpClient) => Promise<T>) => Promise<T>;
type SubmitOptions = { dryRun?: boolean; comment?: string; batchSize?: number };

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
    return this.submitBatch((operation) => operation(client), listUrl, options);
  }

  private async submitBatch(read: EvaluationRead, listUrl: string, options: SubmitOptions): Promise<EvaluationSubmitResult> {
    const safeUrl = assertJwEvaluationListUrl(listUrl);
    const dryRun = options.dryRun ?? true;
    const comment = normalizeEvaluationText(options.comment || DEFAULT_COMMENT) || DEFAULT_COMMENT;
    const batchLimit = normalizeBatchSize(options.batchSize);
    const rows = await read((client) => fetchEvaluationRows(client, safeUrl));
    const actionableRows = rows.filter((row) => row.actionable);
    const targetRows = actionableRows.slice(0, batchLimit);
    const outcomes: Array<EvaluationSubmitItem | PendingVerification> = [];
    let attemptedCount = 0;

    for (const row of targetRows) {
      const baseItem = toPublicItem(row);
      let questionCount = 0;
      let fullScore = 0;
      let attempted = false;

      try {
        // 表单读取可以恢复凭证；返回同一客户端，确保一次性 POST 使用组参时的会话。
        const { form, client } = await read(async (client) => {
          const editResponse = await client.request(row.editUrl, { timeout: config.timeout.business });
          assertEvaluationResponse(editResponse, 'EVALUATION_FORM');
          return { form: EvaluationParser.buildFullScoreForm(await editResponse.text(), row.editUrl, comment), client };
        });
        questionCount = form.questionCount;
        fullScore = form.fullScore;

        if (dryRun) {
          outcomes.push({ ...baseItem, questionCount, fullScore, status: 'dry_run' });
          continue;
        }

        attempted = true;
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
        // 已发出的提交即使超时也可能生效，只能回查，不能重放。
        if (attempted) {
          outcomes.push({ target: row, item: baseItem, questionCount, fullScore, error: String(error?.message || 'SUBMIT_FAILED') });
          continue;
        }
        if (attemptedCount === 0 && String(error?.message || '') === 'SESSION_EXPIRED') throw error;
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
    let finalRows = rows;
    let verificationSucceeded = verificationRequests === 0;
    if (verificationRequests) {
      try {
        finalRows = await read((client) => fetchEvaluationRows(client, safeUrl));
        verificationSucceeded = true;
      } catch {
        // 校验耗尽只影响确认程度，不能丢失本批目标或重新选择下一批。
      }
    }
    const confirmedIncrements = new Map<string, number>();
    const results = outcomes.map((outcome): EvaluationSubmitItem => {
      if (!('target' in outcome)) return outcome;
      const identity = evaluationIdentity(outcome.target);
      const remaining = confirmedIncrements.get(identity)
        ?? Math.max(0, submittedCountForIdentity(finalRows, outcome.target) - submittedCountForIdentity(rows, outcome.target));
      const submitted = verificationSucceeded && remaining > 0;
      if (submitted) confirmedIncrements.set(identity, remaining - 1);
      return {
        ...outcome.item,
        questionCount: outcome.questionCount,
        fullScore: outcome.fullScore,
        // 列表读成功只证明取得快照；缺少增量不能证明已发出的 POST 未执行或不会稍后生效。
        status: submitted ? 'submitted' : 'unknown',
        ...(!submitted && { message: verificationSucceeded ? outcome.error || 'SUBMIT_NOT_CONFIRMED' : 'SUBMIT_RESULT_UNKNOWN' }),
      };
    });
    const status = toStatus(finalRows);
    const previewedCount = results.filter((item) => item.status === 'dry_run').length;
    const submittedCount = results.filter((item) => item.status === 'submitted').length;
    const failedCount = results.filter((item) => item.status === 'failed').length;
    const unconfirmedCount = results.filter((item) => item.status === 'unknown').length;

    Logger.operation(
      'Evaluation',
      dryRun ? '评教满分组参预检' : '评教满分提交',
      undefined,
      undefined,
      `available=${actionableRows.length}; target=${targetRows.length}; attempted=${attemptedCount}; previewed=${previewedCount}; submitted=${submittedCount}; failed=${failedCount}; unconfirmed=${unconfirmedCount}; verification_failed=${!verificationSucceeded}; remaining=${status.actionableCount}; blocked=${status.blockedCount}`,
    );

    return {
      dryRun,
      status,
      targetCount: targetRows.length,
      attemptedCount,
      previewedCount,
      submittedCount,
      failedCount,
      ...(unconfirmedCount > 0 && { unconfirmedCount }),
      batch: {
        limit: batchLimit,
        availableCount: actionableRows.length,
        selectedCount: targetRows.length,
        remainingCount: status.actionableCount,
        hasMore: status.actionableCount > 0,
        verificationRequests,
        ...(!verificationSucceeded && { verificationSucceeded: false as const }),
      },
      items: results,
    };
  }

  async submitFullScore(
    userId: number,
    listUrl: string,
    options: { dryRun?: boolean; comment?: string; batchSize?: number } = {},
  ) {
    return this.submitBatch(
      (operation) => this.ports.upstream(userId, 'jw', ({ client }) => operation(client)),
      listUrl,
      options,
    );
  }
}
