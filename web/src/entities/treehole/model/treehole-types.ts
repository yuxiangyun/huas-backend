/**
 * [INPUT]: 依赖 Treehole 服务端公共读模型，不依赖 React 或请求实现
 * [OUTPUT]: 对外提供社区资料、帖子、评论、通知、分页与元数据类型
 * [POS]: entities/treehole 的前端领域契约，隔离化名资料与校园真实身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface TreeholePost {
  id: number;
  content: string;
  avatarUrl: string | null;
  nickname: string | null;
  stats: {
    likeCount: number;
    commentCount: number;
  };
  viewer: {
    liked: boolean;
    isMine: boolean;
  };
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreeholeComment {
  id: number;
  postId: number;
  parentCommentId: number | null;
  content: string;
  avatarUrl: string | null;
  nickname: string | null;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityProfile {
  avatarUrl: string | null;
  nickname: string | null;
}

export type TreeholeAvatar = CommunityProfile;

export interface TreeholeUnreadNotificationCount {
  unreadCount: number;
}

export interface TreeholeReadAllNotificationsResult {
  readCount: number;
}

export interface TreeholeListResponse {
  items: TreeholePost[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface TreeholeCommentListResponse {
  items: TreeholeComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface TreeholeMeta {
  limits: {
    maxPostLength: number;
    maxCommentLength: number;
  };
  pagination: {
    defaultPageSize: number;
    maxPageSize: number;
    defaultCommentPageSize: number;
    maxCommentPageSize: number;
  };
}
