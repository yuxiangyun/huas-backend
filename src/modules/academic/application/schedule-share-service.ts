import { AppError, ErrorCode } from '../../../utils/errors';
import type { ICourse } from '../../../types';
import type { PreferredScheduleSource } from '../domain/schedule-source-policy';
import type {
  ScheduleShareOwnerReader, ScheduleShareReader, ScheduleShareStore, ScheduleShareTokens, SharedSchedule,
} from '../domain/schedule-share';

function selectedWeek(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AppError(ErrorCode.PARAM_ERROR, '请选择有效日期，格式为 YYYY-MM-DD');
  }
  parsed.setUTCDate(parsed.getUTCDate() - (parsed.getUTCDay() + 6) % 7);
  const weekStartDate = parsed.toISOString().slice(0, 10);
  parsed.setUTCDate(parsed.getUTCDate() + 6);
  return { weekStartDate, weekEndDate: parsed.toISOString().slice(0, 10) };
}

/** 显式白名单投影防止 canonical 数据未来扩展后暴露学校账户信息。 */
function projectCourse(course: ICourse): ICourse {
  return {
    name: course.name, teacher: course.teacher, location: course.location,
    day: course.day, section: course.section,
    ...(course.date === undefined ? {} : { date: course.date }),
    ...(course.weekStr === undefined ? {} : { weekStr: course.weekStr }),
  };
}

export class ScheduleShareApplicationService {
  constructor(
    private readonly owners: ScheduleShareOwnerReader,
    private readonly schedules: ScheduleShareReader,
    private readonly store: ScheduleShareStore,
    private readonly tokens: ScheduleShareTokens,
  ) {}

  async create(userId: number, date: string, preferredSource?: PreferredScheduleSource): Promise<{ token: string; schedule: SharedSchedule }> {
    const range = selectedWeek(date);
    const owner = await this.owners.find(userId);
    if (!owner?.name) throw new AppError(ErrorCode.SCHEDULE_SHARE_UNAVAILABLE, '学校姓名尚未就绪，请稍后重试');
    const result = await this.schedules.getSchedule({ userId, studentId: owner.studentId, name: owner.name, date, preferredSource, forceRefresh: false });
    if (result._request.available !== true || result.data?.message === '当前日期不在教学周历内') {
      throw new AppError(ErrorCode.SCHEDULE_SHARE_UNAVAILABLE, '学校暂未提供所选周的课表，暂时无法分享');
    }
    if (!Array.isArray(result.data?.courses)) throw new AppError(ErrorCode.INTERNAL_ERROR, '课表数据异常');
    const timestamp = result._meta.updated_at ?? result._meta.cache_time;
    const schedule: SharedSchedule = {
      ownerName: owner.name,
      // 日期模式没有可靠教学周次，空串通知客户端改用所选日期范围。
      week: typeof result.data.week === 'string' && /^第\d+周$/.test(result.data.week) ? result.data.week : '',
      ...range,
      courses: result.data.courses.map(projectCourse),
      message: typeof result.data.message === 'string' ? result.data.message : '',
      dataUpdatedAt: timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null,
    };
    const token = this.tokens.create();
    await this.store.insert(this.tokens.hash(token), schedule);
    return { token, schedule };
  }

  async read(token: string | undefined): Promise<SharedSchedule> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new AppError(ErrorCode.SCHEDULE_SHARE_NOT_FOUND, '课表分享不存在或链接无效');
    }
    const schedule = await this.store.find(this.tokens.hash(token));
    if (!schedule) throw new AppError(ErrorCode.SCHEDULE_SHARE_NOT_FOUND, '课表分享不存在或链接无效');
    return schedule;
  }
}
