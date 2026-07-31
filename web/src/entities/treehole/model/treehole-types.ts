/**
 * [INPUT]: 依赖 Treehole 服务端公共读模型，不依赖 React 或请求实现
 * [OUTPUT]: 对外提供含 CommunityProfile 作者的帖子、评论、点赞结果、分页与元数据类型
 * [POS]: entities/treehole 的前端领域契约，不拥有公共资料或活动通知事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile } from '@/entities/community/model/community-types';

export interface TreeholePost {
  id: number;
  content: string;
  author: CommunityProfile;
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
  author: CommunityProfile;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TreeholeLikeResult {
  postId: number;
  liked: boolean;
  likeCount: number;
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
