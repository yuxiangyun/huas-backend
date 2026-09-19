/**
 * [INPUT]: 依赖 SchoolAccess 评教读取与提交尝试类型 与成绩模块共享的评教发现结果
 * [OUTPUT]: 对外提供评教任务、状态、提交 DTO 以及 EvaluationApplicationPorts
 * [POS]: academic/domain 的评教稳定契约，分离本批提交计数与列表累计完成计数；unknown 表达已尝试但未确认，verificationSucceeded=false 单独表达回查失败及旧列表快照
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { EvaluationDiscoveryResult } from './grade';
import type { SchoolEvaluationRow, EvaluationItemAttempt } from '../../campus-integrations/school-access/school-access';

export type { EvaluationDiscoveryResult } from './grade';

export interface EvaluationListItem {
  index: string;
  teacherId: string;
  teacherName: string;
  college: string;
  category: string;
  totalScore: string;
  evaluated: string;
  submitted: string;
  pending: boolean;
  actionable: boolean;
  blocked: boolean;
  state: 'pending' | 'completed' | 'blocked';
}

export interface EvaluationSubmitItem extends EvaluationListItem {
  questionCount: number;
  fullScore: number;
  status: 'dry_run' | 'submitted' | 'failed' | 'unknown';
  message?: string;
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
  unconfirmedCount?: number;
  batch: {
    limit: number;
    availableCount: number;
    selectedCount: number;
    remainingCount: number;
    hasMore: boolean;
    verificationRequests: number;
    verificationSucceeded?: false;
  };
  items: EvaluationSubmitItem[];
}

export interface EvaluationApplicationPorts {
  discoverEvaluation(userId: number): Promise<EvaluationDiscoveryResult>;
  readRows(userId: number, listUrl: string, deadlineAt?: number): Promise<SchoolEvaluationRow[]>;
  evaluateItem(userId: number, input: { target: SchoolEvaluationRow; comment: string; dryRun: boolean }, deadlineAt: number): Promise<EvaluationItemAttempt>;
}
