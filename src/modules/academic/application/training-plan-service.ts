/**
 * [INPUT]: 依赖具名 JW 双页读取端口、Academic 缓存端口与 OrderedCommit
 * [OUTPUT]: 对外提供按学期汇总、识别全程课程的 TrainingPlanApplicationService 及纯合并投影
 * [POS]: Academic 培养方案用例，按编号并核对名称合并学校事实、按完整方案覆盖范围标记全程课程并有序提交快照
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../../config';
import { OrderedCommit } from '../../../utils/ordered-commit';
import type { AcademicCache, AcademicRefreshFallback } from '../domain/ports';
import type {
  TrainingPlanData, TrainingPlanExecution, TrainingPlanSemester, TrainingPlanSemesterCourse, TrainingPlanSource,
} from '../domain/training-plan';

export interface TrainingPlanApplicationPorts {
  readTrainingPlan(userId: number): Promise<{ plan: TrainingPlanSource; executions: TrainingPlanExecution[] }>;
  cache: AcademicCache;
  refreshFallback: AcademicRefreshFallback;
}

const cacheWrites = new OrderedCommit();
const courseKey = (code: string, name: string) => `${code}\0${name.replace(/\s+/g, '')}`;

export function projectTrainingPlan(plan: TrainingPlanSource, executions: TrainingPlanExecution[]): TrainingPlanData {
  const executionByCourse = new Map<string, TrainingPlanExecution[]>();
  for (const record of executions) {
    const key = courseKey(record.courseCode, record.courseName);
    const list = executionByCourse.get(key) ?? [];
    list.push(record);
    executionByCourse.set(key, list);
  }

  const termsByIndex = new Map<number, Set<string>>();
  for (const course of plan.courses) {
    if (course.plannedSemesterIndexes.length !== 1) continue;
    const records = executionByCourse.get(courseKey(course.courseCode, course.courseName)) ?? [];
    const terms = [...new Set(records.map(record => record.term).filter(Boolean))];
    if (terms.length !== 1) continue;
    const index = course.plannedSemesterIndexes[0];
    const candidates = termsByIndex.get(index) ?? new Set<string>();
    candidates.add(terms[0]);
    termsByIndex.set(index, candidates);
  }
  const termByIndex = new Map<number, string>();
  for (const [index, terms] of termsByIndex) if (terms.size === 1) termByIndex.set(index, [...terms][0]);

  const lastSemesterIndex = Math.max(0, ...plan.courses.flatMap(course => course.plannedSemesterIndexes));
  const semesterIndexes = Array.from({ length: lastSemesterIndex }, (_, index) => index + 1);
  const semesters: TrainingPlanSemester[] = semesterIndexes.map(index => ({
    index, term: termByIndex.get(index) ?? null,
    plannedCourseCount: 0, completedCourseCount: 0, plannedCredits: 0, completedCredits: 0, courses: [],
  }));
  const semesterByIndex = new Map(semesters.map(semester => [semester.index, semester]));
  const unassignedCourses: TrainingPlanSemesterCourse[] = [];
  const matchedKeys = new Set<string>();

  for (const course of plan.courses) {
    const key = courseKey(course.courseCode, course.courseName);
    const records = executionByCourse.get(key) ?? [];
    if (records.length) matchedKeys.add(key);
    const plannedIndexes = new Set(course.plannedSemesterIndexes);
    const spansAllSemesters = lastSemesterIndex >= 2 && semesterIndexes.every(index => plannedIndexes.has(index));
    const project = (index: number | null): TrainingPlanSemesterCourse => {
      const term = index === null ? null : termByIndex.get(index);
      const execution = term ? records.find(record => record.term === term) ?? null : null;
      return { ...course, spansAllSemesters, execution, executionRecords: records, assessmentMethod: execution?.assessmentMethod ?? null };
    };
    if (!course.plannedSemesterIndexes.length) {
      unassignedCourses.push(project(null));
      continue;
    }
    for (const index of course.plannedSemesterIndexes) {
      const semester = semesterByIndex.get(index)!;
      semester.courses.push(project(index));
      semester.plannedCourseCount += 1;
      semester.plannedCredits += course.credits ?? 0;
      if (course.completion.status === 'completed') {
        semester.completedCourseCount += 1;
        semester.completedCredits += course.credits ?? 0;
      }
    }
  }

  return {
    title: plan.title, version: plan.version, objectives: plan.objectives, description: plan.description,
    groups: plan.groups, totalCredits: plan.totalCredits, totalHours: plan.totalHours,
    semesters, unassignedCourses,
    unmatchedExecutionRecords: executions.filter(record => !matchedKeys.has(courseKey(record.courseCode, record.courseName))),
  };
}

export class TrainingPlanApplicationService {
  constructor(private readonly ports: TrainingPlanApplicationPorts) {}

  async getTrainingPlan(userId: number, studentId: string, forceRefresh = false) {
    const cacheKey = `training-plan:${studentId}`;
    if (!forceRefresh) {
      const cached = await this.ports.cache.get<TrainingPlanData>(cacheKey, { touch: true });
      if (cached) return { data: cached.data, _meta: cached.meta };
    }

    let data: TrainingPlanData;
    try {
      data = await this.ports.cache.runSingleflight(cacheKey, forceRefresh, () =>
        cacheWrites.run(cacheKey, async () => {
          const { plan, executions } = await this.ports.readTrainingPlan(userId);
          return projectTrainingPlan(plan, executions);
        }, async fresh => {
          await this.ports.cache.set(cacheKey, fresh, config.cacheTtl.trainingPlan, 'jw');
        }),
      );
    } catch (error) {
      const fallback = await this.ports.refreshFallback<TrainingPlanData>({
        forceRefresh, cacheKey, error, source: 'jw', studentId,
      });
      if (fallback) return fallback;
      throw error;
    }
    return { data, _meta: { cached: false, source: 'jw' } };
  }
}
