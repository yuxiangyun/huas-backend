/**
 * [INPUT]: 依赖后端管理接口与 Community/Messaging 公共 DTO
 * [OUTPUT]: 提供含时间筛选/排序的用户、账户概览、内容治理、早起运营、运行采样与兼容管理接口契约
 * [POS]: entities/admin 的协议模型边界，保证 Treehole 管理图片与其他后台 UI 不重新解释后端字段
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile } from '@/entities/community/model/community-types';
import type { DiscoverComment, DiscoverPost } from '@/entities/discover/model/discover-types';
import type { Message } from '@/entities/messaging/model/messaging-types';

export interface AdminServiceStatus {
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
  totalDiscoverLikes: number;
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
  likeCount: number;
  authorDisplayName: string;
  publishedAt: string | null;
}

export interface AdminDiscoverPanel {
  totalPosts: number;
  totalLikes: number;
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
  service: AdminServiceStatus;
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

export interface AdminAnalyticsOverview {
  days: 7 | 30 | 90;
  since: string;
  series: Array<Record<string, string | number>>;
}

export type AdminScheduleSourceMode = 'mobile-jw-first' | 'jw-first' | 'portal-first';

export interface AdminScheduleSourcePolicy {
  mode: AdminScheduleSourceMode;
  updatedAt: string;
  updatedBy: string;
}

export type AdminIndexPopupFrequency = 'once' | 'daily' | 'startup';
export type AdminIndexPopupActionType = 'public_account' | 'text' | 'none';

export interface AdminIndexPopupSettings {
  enabled: boolean;
  version: string | null;
  imageUrl: string | null;
  actionType: AdminIndexPopupActionType;
  actionText: string;
  frequency: AdminIndexPopupFrequency;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string | null;
}

export interface AdminIndexPopupSettingsPayload {
  enabled: boolean;
  actionType: AdminIndexPopupActionType;
  actionText: string;
  frequency: AdminIndexPopupFrequency;
  startsAt: string | null;
  endsAt: string | null;
  image?: File;
}

export interface AdminEarlyRisingSettings {
  profileEntryVisible: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminEarlyRisingSettingsPayload {
  profileEntryVisible: boolean;
}

export interface AdminTreeholeAuthor {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

export interface AdminTreeholeImage {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/webp';
}

export interface AdminTreeholePost {
  id: number;
  content: string;
  images: AdminTreeholeImage[];
  imageCount: number;
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
  parentCommentId: number | null;
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

export interface AdminMessagingConversation {
  id: number;
  participants: [CommunityProfile, CommunityProfile];
  lastMessage: Message | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminMessagingConversationListResponse {
  items: AdminMessagingConversation[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminMessagingConversationChangesResponse {
  items: AdminMessagingConversation[];
  afterMessageId: number;
  hasMore: boolean;
}

export interface AdminMessagingMessageListResponse {
  conversationId: number;
  items: Message[];
  beforeMessageId: number | null;
  afterMessageId: number | null;
  hasMore: boolean;
}

export interface AdminUsersParams {
  page?: number;
  search?: string;
  className?: string;
  grade?: string;
  timeField?: AdminUserTimeField;
  timeRange?: AdminUserTimeRange;
  from?: string;
  to?: string;
  sortBy?: AdminUserTimeField;
  sortOrder?: 'asc' | 'desc';
}

export type AdminUserTimeField = 'lastActiveAt' | 'lastLoginAt' | 'createdAt';
export type AdminUserTimeRange = 'all' | 'today' | '7d' | '30d' | 'before7d' | 'before30d' | 'custom';

export interface AdminUser extends AdminDashboardUser {
  lastActiveAt: string | null;
}

export interface AdminUsersResponse {
  items: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  options: { classes: Array<{ value: string; label: string }>; grades: string[] };
  filters: Required<Omit<AdminUsersParams, 'page'>>;
}

export interface AdminOverviewResponse {
  service: AdminServiceStatus;
  metrics: AdminMetrics;
  distributions: { byClass: AdminMajorDistributionItem[]; byGrade: AdminGradeDistributionItem[] };
}

export interface AdminDiscoverPostsParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
}

export type AdminDiscoverPostDetail = Omit<DiscoverPost, 'likedByMe' | 'isMine' | 'likeCount' | 'commentCount'> & {
  stats: { likeCount: number; commentCount: number };
};
export type AdminDiscoverComment = Omit<DiscoverComment, 'isMine'>;

export interface AdminDiscoverPostListResponse {
  summary: { totalPosts: number; totalComments: number; totalLikes: number };
  items: AdminDiscoverPostDetail[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  options: { categories: string[] };
}

export interface AdminDiscoverCommentListResponse {
  items: AdminDiscoverComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export type AdminEarlyRisingPeriod = 'today' | 'week' | 'month';
export type AdminTrendDays = 7 | 30 | 90;
export interface AdminEarlyRisingOverview {
  days: AdminTrendDays;
  range: { from: string; to: string };
  todayParticipants: number;
  totalParticipants: number;
  totalCheckins: number;
  series: Array<{ date: string; count: number }>;
}

export interface AdminEarlyRisingLeaderboard {
  period: AdminEarlyRisingPeriod;
  range: { from: string; to: string };
  generatedAt: string;
  items: Array<{
    rank: number;
    profile: CommunityProfile & { bio: string | null };
    currentStreak: number;
    checkedAt?: string;
    continuityScore?: number;
    validDays?: number;
  }>;
}

export interface AdminRuntimeSnapshot {
  databaseStatus: 'ok' | 'error';
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  uptimeSeconds: number;
  process: {
    ready: boolean;
    shuttingDown: boolean;
    shutdownSignal: string | null;
    deploySlot: string;
  };
  metrics: Array<{ name: string; labels: Record<string, string>; value: number }>;
}
