/**
 * [INPUT]: 依赖 Discover 服务端稳定响应字段，不依赖 React 或传输实现
 * [OUTPUT]: 对外提供含 CommunityProfile 作者、幂等点赞、评论、分页与元数据类型
 * [POS]: entities/discover 的前端领域契约，由 API、查询缓存与展示组件共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { CommunityProfile } from '@/entities/community/model/community-types';

export const DISCOVER_CATEGORIES = ['1食堂', '2食堂', '3食堂', '5食堂', '校外', '其他'] as const;
export const DISCOVER_SORTS = ['latest', 'popular', 'recommended'] as const;

export type DiscoverCategory = typeof DISCOVER_CATEGORIES[number];
export type DiscoverSort = typeof DISCOVER_SORTS[number];

export interface DiscoverImage {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export interface DiscoverPost {
  id: number;
  title: string;
  storeName: string;
  priceText: string;
  content: string;
  category: DiscoverCategory;
  tags: string[];
  images: DiscoverImage[];
  coverUrl: string;
  imageCount: number;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  author: CommunityProfile;
  isMine: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverComment {
  id: number;
  postId: number;
  parentCommentId: number | null;
  content: string;
  author: CommunityProfile;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverLikeResult {
  postId: number;
  liked: boolean;
  likeCount: number;
}

export interface DiscoverListResponse {
  items: DiscoverPost[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface DiscoverCommentListResponse {
  items: DiscoverComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface DiscoverMeta {
  categories: DiscoverCategory[];
  commonTags: string[];
  limits: {
    maxImagesPerPost: number;
    maxTagsPerPost: number;
    maxTitleLength: number;
    maxTagLength: number;
    maxStoreNameLength: number;
    maxPriceTextLength: number;
    maxContentLength: number;
    maxCommentLength: number;
  };
  pagination: {
    defaultCommentPageSize: number;
    maxCommentPageSize: number;
  };
}
