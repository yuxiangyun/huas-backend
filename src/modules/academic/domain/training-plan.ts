/**
 * [INPUT]: 依赖 JW 两张培养方案表的已解析事实，不依赖 HTTP 或校园会话
 * [OUTPUT]: 对外提供培养方案原始行、课程合并结果与含全程课程标记的学期展示 DTO
 * [POS]: Academic 的培养方案语言边界，保留学校原值并区分整门课程完成情况、覆盖学期与学期开课记录
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface TrainingPlanHours {
  theory: number | null;
  practice: number | null;
  computer: number | null;
  extracurricular: number | null;
  total: number | null;
}

export interface TrainingPlanCompletion {
  raw: string;
  status: 'completed' | 'failed' | 'unrecorded' | 'unknown';
  scoreText: string | null;
  score: number | null;
}

export interface TrainingPlanCourse {
  courseCode: string;
  courseName: string;
  curriculumGroup: string;
  selectionGroup: string | null;
  courseNature: string | null;
  courseAttribute: string | null;
  credits: number | null;
  creditsText: string;
  hours: TrainingPlanHours;
  plannedSemesterText: string;
  plannedSemesterIndexes: number[];
  completion: TrainingPlanCompletion;
}

export interface TrainingPlanGroup {
  name: string;
  raw: string;
  requiredCredits: number | null;
  requiredCreditsText: string | null;
  earnedCredits: number | null;
  earnedCreditsText: string | null;
  subtotalCredits: number | null;
  subtotalHours: TrainingPlanHours;
  courseCount: number;
}

export interface TrainingPlanExecution {
  sequence: number | null;
  term: string;
  courseCode: string;
  courseName: string;
  teachingUnit: string | null;
  credits: number | null;
  creditsText: string;
  totalHours: number | null;
  assessmentMethod: string | null;
  courseNature: string | null;
  courseAttribute: string | null;
  isExamText: string | null;
}

export interface TrainingPlanSource {
  title: string;
  version: string | null;
  objectives: string | null;
  description: string | null;
  groups: TrainingPlanGroup[];
  courses: TrainingPlanCourse[];
  totalCredits: number | null;
  totalHours: TrainingPlanHours;
}

export interface TrainingPlanSemesterCourse extends TrainingPlanCourse {
  spansAllSemesters: boolean;
  execution: TrainingPlanExecution | null;
  executionRecords: TrainingPlanExecution[];
  assessmentMethod: string | null;
}

export interface TrainingPlanSemester {
  index: number;
  term: string | null;
  plannedCourseCount: number;
  completedCourseCount: number;
  plannedCredits: number;
  completedCredits: number;
  courses: TrainingPlanSemesterCourse[];
}

export interface TrainingPlanData {
  title: string;
  version: string | null;
  objectives: string | null;
  description: string | null;
  groups: TrainingPlanGroup[];
  totalCredits: number | null;
  totalHours: TrainingPlanHours;
  semesters: TrainingPlanSemester[];
  unassignedCourses: TrainingPlanSemesterCourse[];
  unmatchedExecutionRecords: TrainingPlanExecution[];
}
