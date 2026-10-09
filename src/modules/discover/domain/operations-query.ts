/**
 * [INPUT]: 依赖 DiscoverStoredImage 领域媒体 DTO
 * [OUTPUT]: 对外提供基于点赞口径的 DiscoverOperationsQueryPort、完整帖子/评论管理查询与只读 DTO
 * [POS]: discover/domain 的公开查询契约，向 Operations 隐藏 Discover 表与存储 JSON
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { DiscoverStoredImage, DiscoverPostResponse, DiscoverCommentResponse } from './discover';

export interface DiscoverOperationsPost {
  id: number;
  title: string;
  category: string;
  coverUrl: string;
  images: DiscoverStoredImage[];
  imageCount: number;
  likeCount: number;
  authorDisplayName: string;
  publishedAt: string | null;
}

export interface DiscoverOperationsSnapshot {
  totalPosts: number;
  totalLikes: number;
  items: DiscoverOperationsPost[];
}

export interface DiscoverOperationsQueryPort {
  getSummary(): Promise<AdminDiscoverSummary>;
  listPosts(options: AdminDiscoverListOptions): Promise<AdminDiscoverPostList>;
  getPost(postId: number): Promise<AdminDiscoverPost | null>;
  listComments(postId: number, options: { page?: number; pageSize?: number }): Promise<AdminDiscoverCommentList | null>;
  getSnapshot(limit: number): Promise<DiscoverOperationsSnapshot>;
}

export interface AdminDiscoverListOptions {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
}

export interface AdminDiscoverSummary {
  totalPosts: number;
  totalComments: number;
  totalLikes: number;
}

export type AdminDiscoverPost = Omit<DiscoverPostResponse,
  'likedByMe' | 'isMine' | 'likeCount' | 'commentCount'> & {
    stats: { likeCount: number; commentCount: number };
  };
export type AdminDiscoverComment = Omit<DiscoverCommentResponse, 'isMine'>;

export interface AdminDiscoverPostList {
  summary: AdminDiscoverSummary;
  items: AdminDiscoverPost[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  options: { categories: string[] };
}

export interface AdminDiscoverCommentList {
  items: AdminDiscoverComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
