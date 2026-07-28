/**
 * [INPUT]: 无运行时依赖，描述用户、课表、一卡通、成绩、响应与缓存元信息结构
 * [OUTPUT]: 对外提供业务 DTO、GradePassStatus 与 ApiResponse/CacheMeta（含课表策略观测）类型
 * [POS]: types 的共享契约源，被 parsers、services、routes 与客户端响应模型共同参照
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

// User Profile
export interface IUserInfo {
  name: string;
  studentId: string;
  className: string;
  identity: string;
  organizationCode: string;
}

// Course Schedule
export interface ICourse {
  name: string;
  teacher: string;
  location: string;
  day: number;
  section: string;
  weekStr?: string;
}

// ECARD
export interface IECard {
  balance: number;
  status: string;
  lastTime: string;
}

// Grades
export type GradePassStatus = 'passed' | 'failed' | 'unknown';

export interface IGradeItem {
  term: string;
  courseCode: string;
  courseName: string;
  groupName: string;
  score: number | null;
  scoreText: string;
  pass: boolean | null;
  passStatus: GradePassStatus;
  flag: string;
  credit: number | null;
  totalHours: number | null;
  gpa: number | null;
  retakeTerm: string;
  examMethod: string;
  examNature: string;
  courseAttribute: string;
  courseNature: string;
  courseCategory: string;
}

export interface IGradeSummary {
  totalCourses: number | null;
  totalCredits: number | null;
  averageGpa: number | null;
  averageScore: number | null;
}

export interface IGradeList {
  summary: IGradeSummary;
  items: IGradeItem[];
}

// API Response
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error_code?: number;
  error_message?: string;
  _meta?: CacheMeta;
}

// Cache Metadata
export interface CacheMeta {
  cached: boolean;
  cache_time?: string;
  updated_at?: string;
  expires_at?: string;
  source?: string;
  upstreamAccount?: string;
  stale?: boolean;
  refresh_failed?: boolean;
  last_error?: number;
  policy_mode?: 'jw-first' | 'portal-first';
  primary_source?: 'jw' | 'portal';
  fallback?: 'jw' | 'portal' | 'stale';
}
