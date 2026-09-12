/**
 * [INPUT]: 依赖移动教务窄只读端口、严格周解析器与学校请求总预算
 * [OUTPUT]: 对外提供 MobileJwSemesterApplicationService，返回当前学期完整日期课程
 * [POS]: Academic 的整学期采集用例，复用当前周锚点串行读取其余周；完整性验证全部通过后才交给 Calendar 保存
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import type { ICourse } from '../../../types';
import { AppError, ErrorCode } from '../../../utils/errors';
import { protocolFailure } from '../../campus-integrations/mobile-jw/errors';
import { parseMobileJwWeek } from '../../campus-integrations/mobile-jw/schedule-parser';
import type { MobileJwSchedulePort } from '../domain/ports';

const WEEK_MS = 7 * 86_400_000;

export class MobileJwSemesterApplicationService {
  constructor(private readonly client: MobileJwSchedulePort) {}

  async getSemesterSchedule(userId: number) {
    const deadlineAt = Date.now() + config.timeout.mobileJwTotalBudget;
    const initial = parseMobileJwWeek((await this.client.current(userId, {}, deadlineAt)).data);
    if (!initial.semesterId || initial.maxWeek === null || initial.week > initial.maxWeek) throw protocolFailure();
    const start = Date.parse(initial.weekStartDate) - (initial.week - 1) * WEEK_MS;
    const courses: ICourse[] = [];
    for (let week = 1; week <= initial.maxWeek; week += 1) {
      if (Date.now() >= deadlineAt) throw new AppError(ErrorCode.UPSTREAM_TIMEOUT, '整学期课表获取超时');
      const result = week === initial.week ? initial
        : parseMobileJwWeek((await this.client.current(userId, { week }, deadlineAt)).data);
      // 指定周的 week 字段可能仍是当前周；以真实七天日期及学期元信息验证，不拼接跨学期或重复周。
      const expectedDate = new Date(start + (week - 1) * WEEK_MS).toISOString().slice(0, 10);
      if (result.weekStartDate !== expectedDate || result.semesterId !== initial.semesterId
        || result.maxWeek !== initial.maxWeek) throw protocolFailure();
      courses.push(...result.courses);
    }
    return { semesterId: initial.semesterId, startDate: new Date(start).toISOString().slice(0, 10), courses };
  }
}
