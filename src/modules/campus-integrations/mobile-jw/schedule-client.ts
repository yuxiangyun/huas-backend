/**
 * [INPUT]: 依赖 mobile-jw 无感会话执行器、统一参数错误与严格成功 envelope 判定
 * [OUTPUT]: 对外提供 MobileJwScheduleClient 的学期、节次、当前周与指定学期周只读能力
 * [POS]: mobile-jw 的内部课表协议入口，保留真实上游 data 供后续 Academic DTO 映射，不向客户端透传令牌或任意 URL
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AppError, ErrorCode } from '../../../utils/errors';
import { assertHttpSuccess, businessFailure, protocolFailure } from './errors';
import { mobileJwSessionExecutor, type MobileJwSessionExecutor, type MobileJwReadOperation } from './session-executor';

export interface MobileJwReadResult { data: unknown; message: string | null }

function weekParam(week?: number): string {
  if (week === undefined) return '';
  if (!Number.isSafeInteger(week) || week < 1 || week > 53) {
    throw new AppError(ErrorCode.PARAM_ERROR, '教学周必须为 1 至 53 的整数');
  }
  return String(week);
}

function modeParam(mode?: string): string {
  if (mode === undefined || mode === '') return '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(mode)) throw new AppError(ErrorCode.PARAM_ERROR, '节次模式无效');
  return mode;
}

export class MobileJwScheduleClient {
  constructor(private readonly executor: Pick<MobileJwSessionExecutor, 'post'> = mobileJwSessionExecutor) {}

  semesters(userId: number, deadlineAt?: number) {
    return this.read(userId, 'semesters', {}, deadlineAt);
  }

  semesterDictionary(userId: number, deadlineAt?: number) {
    return this.read(userId, 'semesterDictionary', { zzdtype: 'xnxq' }, deadlineAt);
  }

  timeModes(userId: number, deadlineAt?: number) {
    return this.read(userId, 'timeModes', {}, deadlineAt);
  }

  nodes(userId: number, deadlineAt?: number) {
    return this.read(userId, 'nodes', {}, deadlineAt);
  }

  current(userId: number, input: { week?: number; timeModeId?: string } = {}, deadlineAt?: number) {
    return this.read(userId, 'current', { week: weekParam(input.week), kbjcmsid: modeParam(input.timeModeId) }, deadlineAt);
  }

  selected(userId: number, input: { semester: string; week: number; timeModeId?: string }, deadlineAt?: number) {
    if (!/^\d{4}-\d{4}-[1-3]$/.test(input.semester)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '学期格式无效');
    }
    return this.read(userId, 'selected', {
      week: weekParam(input.week), kbjcmsid: modeParam(input.timeModeId), xnxqid: input.semester,
    }, deadlineAt);
  }

  private async read(userId: number, operation: MobileJwReadOperation, params: Record<string, string>, deadlineAt?: number): Promise<MobileJwReadResult> {
    const { status, body } = await this.executor.post(userId, operation, params, deadlineAt);
    assertHttpSuccess(status);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw protocolFailure();
    const envelope = body as Record<string, unknown>;
    if (envelope.code === '0' || envelope.code === 0) throw businessFailure();
    if ((envelope.code !== '1' && envelope.code !== 1) || !Object.hasOwn(envelope, 'data')) throw protocolFailure();
    if (envelope.data === null || typeof envelope.data !== 'object') throw protocolFailure();
    // 内部协议结果；正式 DTO 必须另做字段投影，不能原样暴露上游扩展字段。
    return {
      data: envelope.data,
      message: typeof envelope.Msg === 'string' ? envelope.Msg : typeof envelope.msg === 'string' ? envelope.msg : null,
    };
  }
}
