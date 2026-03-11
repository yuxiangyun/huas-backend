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

export interface AdminTerminalLogItem {
  source: 'out' | 'error';
  line: string;
}

export interface AdminTerminalLogResponse {
  limit: number;
  keyword: string;
  items: AdminTerminalLogItem[];
}
