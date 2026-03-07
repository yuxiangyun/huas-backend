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
export interface IGradeItem {
  term: string;
  courseCode: string;
  courseName: string;
  groupName: string;
  score: number | null;
  scoreText: string;
  pass: boolean | null;
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
}
