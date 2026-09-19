/**
 * [INPUT]: 依赖 EvaluationApplicationPorts、既有评教纯规则、具名学校操作与 Logger
 * [OUTPUT]: 对外提供 EvaluationApplicationService、EvaluationParser 与评教公开结果类型
 * [POS]: academic/application 的评教用例编排器，只选择一次有界目标，学校协议通过具名操作隔离，可恢复读取与一次性提交分离；已尝试 POST 仅凭列表增量确认成功，无增量或回查失败均保留 unknown
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { runtimeConfig } from '../../../runtime-config';
import { AppError, ErrorCode } from '../../../utils/errors';
import {
  assertJwEvaluationListUrl,
  EvaluationParser,
  isEvaluationSubmitted,
  normalizeEvaluationText,
  type EvaluationListRow,
} from '../../campus-integrations/jw/parsers/evaluation-parser';
import { Logger } from '../../../utils/logger';
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

function evaluationIdentity(row: EvaluationListRow) {
  return [row.teacherId, row.teacherName, row.college, row.category].join('\u0000');
}

function submittedCountForIdentity(rows: EvaluationListRow[], target: EvaluationListRow) {
  const identity = evaluationIdentity(target);
  return rows.filter((row) => evaluationIdentity(row) === identity && isEvaluationSubmitted(row.submitted)).length;
}

type SubmitOptions = { dryRun?: boolean; comment?: string; batchSize?: number };

export class EvaluationApplicationService {
  constructor(private readonly ports: EvaluationApplicationPorts) {}

  async discoverListUrl(userId: number) { return this.ports.discoverEvaluation(userId); }

  async getStatus(userId: number, listUrl: string) {
    return toStatus(await this.ports.readRows(userId, assertJwEvaluationListUrl(listUrl)));
  }

  private async submitBatch(userId: number, listUrl: string, options: SubmitOptions): Promise<EvaluationSubmitResult> {
    const deadlineAt = Date.now() + runtimeConfig.school.totalBudgetMs;
    const safeUrl = assertJwEvaluationListUrl(listUrl);
    const dryRun = options.dryRun ?? true;
    const comment = normalizeEvaluationText(options.comment || DEFAULT_COMMENT) || DEFAULT_COMMENT;
    const batchLimit = normalizeBatchSize(options.batchSize);
    const rows = await this.ports.readRows(userId, safeUrl, deadlineAt);
    const actionableRows = rows.filter((row) => row.actionable);
    const targetRows = actionableRows.slice(0, batchLimit);
    const outcomes: Array<EvaluationSubmitItem | PendingVerification> = [];
    let attemptedCount = 0;

    for (const row of targetRows) {
      const baseItem = toPublicItem(row);
      let questionCount = 0;
      let fullScore = 0;
      try {
        const result = await this.ports.evaluateItem(userId, { target: row, comment, dryRun }, deadlineAt);
        questionCount = result.questionCount;
        fullScore = result.fullScore;
        if (!result.attempted) {
          outcomes.push({ ...baseItem, questionCount, fullScore, status: 'dry_run' });
          continue;
        }
        attemptedCount += 1;
        outcomes.push({ target: row, item: baseItem, questionCount, fullScore, error: result.error });
      } catch (error) {
        // SchoolAccess 返回 attempted 后才可能有写入；准备失败不会被当成已提交或重放整批。
        if (attemptedCount === 0 && error instanceof AppError && error.code === ErrorCode.CREDENTIAL_EXPIRED) throw error;
        outcomes.push({ ...baseItem, questionCount, fullScore, status: 'failed', message: error instanceof Error ? error.message : 'SUBMIT_FAILED' });
      }
    }

    const verificationRequests = !dryRun && attemptedCount > 0 ? 1 : 0;
    let finalRows = rows;
    let verificationSucceeded = verificationRequests === 0;
    if (verificationRequests) {
      try {
        finalRows = await this.ports.readRows(userId, safeUrl, deadlineAt);
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
    return this.submitBatch(userId, listUrl, options);
  }
}
