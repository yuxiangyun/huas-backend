/**
 * [INPUT]: 依赖固定 JW 课表端点、节次模式、既有纯解析器及统一 JW 读取
 * [OUTPUT]: 对外提供内部 readJwSchedule，保持未公布与合法空课表的协议差异
 * [POS]: SchoolAccess 的 JW 周课表只读 POST；来源策略及缓存仍由 Academic 决定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { JW_SJMS_VALUE } from '../../../config';
import { URLS } from '../endpoints';
import { ScheduleParser } from '../jw/parsers/schedule-parser';
import { executeBaseRead } from './base-read';
import type { SchoolRequestContext } from './request-executor';

export function readJwSchedule(userId: number, input: { date: string; studentId: string; name?: string }, context: SchoolRequestContext) {
  return executeBaseRead(userId, 'jw_session', context, async ({ client }) => {
    const response = await client.request(URLS.kbApi, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: new URLSearchParams({ rq: input.date, sjmsValue: JW_SJMS_VALUE }),
    });
    if (!response.ok) throw new Error(`JW_SCHEDULE_HTTP_${response.status}`);
    return ScheduleParser.parse(await response.text(), input);
  });
}
