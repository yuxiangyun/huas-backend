export interface AdminBasicServiceStatus {
  status: string;
  timestamp: string;
}

export interface AdminMetrics {
  totalUsers: number;
  todayActiveUsers: number;
  activeUsers7d: number;
  newUsers7d: number;
  cacheEntries: number;
  credentialEntries: number;
  totalDiscoverPosts: number;
  totalDiscoverRatings: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  uptimeSeconds: number;
}

export interface AdminDistributionItem {
  count: number;
}

export interface AdminMajorDistributionItem extends AdminDistributionItem {
  className: string;
}

export interface AdminGradeDistributionItem extends AdminDistributionItem {
  grade: string;
}

export interface AdminDashboardUser {
  studentId: string;
  name: string;
  className: string;
  grade: string;
  createdAt: string | null;
  lastLoginAt: string | null;
}

export interface AdminDashboardUsers {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: {
    search: string;
    major: string;
    grade: string;
  };
  options: {
    majors: Array<{ value: string; label: string }>;
    grades: string[];
  };
  items: AdminDashboardUser[];
}

export interface AdminDiscoverImage {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export interface AdminDiscoverPost {
  id: number;
  title: string;
  category: string;
  coverUrl: string;
  images: AdminDiscoverImage[];
  imageCount: number;
  ratingAverage: number;
  ratingCount: number;
  authorLabel: string;
  publishedAt: string | null;
}

export interface AdminDiscoverPanel {
  totalPosts: number;
  totalRatings: number;
  items: AdminDiscoverPost[];
}

export interface AdminTerminalLogItem {
  source: 'out' | 'error';
  line: string;
}

export interface AdminTerminalLogResponse {
  limit: number;
  keyword: string;
  items: AdminTerminalLogItem[];
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  content: string;
  date: string;
  type: 'info' | 'warning' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardResponse {
  service: AdminBasicServiceStatus;
  metrics: AdminMetrics;
  distributions: {
    byMajor: AdminMajorDistributionItem[];
    byGrade: AdminGradeDistributionItem[];
  };
  users: AdminDashboardUsers;
  discover: AdminDiscoverPanel;
  logs: AdminTerminalLogResponse;
  announcements: AdminAnnouncement[];
}

export interface AdminTreeholeAuthor {
  id: number;
  studentId: string;
  name: string;
  className: string;
}

export interface AdminTreeholePost {
  id: number;
  content: string;
  stats: {
    likeCount: number;
    commentCount: number;
  };
  author: AdminTreeholeAuthor;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTreeholeComment {
  id: number;
  postId: number;
  content: string;
  author: AdminTreeholeAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTreeholeSummary {
  totalPosts: number;
  totalComments: number;
  totalLikes: number;
}

export interface AdminTreeholePostListResponse {
  summary: AdminTreeholeSummary;
  items: AdminTreeholePost[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminTreeholeCommentListResponse {
  items: AdminTreeholeComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminAnnouncementPayload {
  title: string;
  content: string;
  date?: string;
  type: 'info' | 'warning' | 'error';
}

export interface AdminAnnouncementUpdatePayload {
  title?: string;
  content?: string;
  date?: string;
  type?: 'info' | 'warning' | 'error';
}
