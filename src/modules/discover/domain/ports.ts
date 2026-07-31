/**
 * [INPUT]: 依赖 Discover 领域 DTO，不依赖任何具体数据库、资料或文件实现
 * [OUTPUT]: 对外提供 DiscoverPersistence 与 DiscoverMediaStorage 两个真实外部边界端口
 * [POS]: modules/discover/domain 的依赖倒置契约，隔离 application 与 SQLite/媒体副作用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  DiscoverCommentListResponse,
  DiscoverCommentResponse,
  DiscoverListResponse,
  DiscoverPostResponse,
  ListOptions,
  PersistDiscoverCommentInput,
  PersistDiscoverPostInput,
  StoredDiscoverMedia,
} from './discover';

export interface DeletedDiscoverPost {
  id: number;
  storageKey: string;
}

export interface DiscoverPersistence {
  createPost(input: PersistDiscoverPostInput): Promise<number>;
  getPostDetail(userId: number, postId: number): Promise<DiscoverPostResponse | null>;
  listPosts(sort: 'latest' | 'popular', options: ListOptions): Promise<DiscoverListResponse>;
  listUserPosts(targetUserId: number, options: ListOptions): Promise<DiscoverListResponse>;
  listRecommendedPosts(options: ListOptions): Promise<DiscoverListResponse>;
  likePost(userId: number, postId: number): Promise<DiscoverPostResponse | null>;
  unlikePost(userId: number, postId: number): Promise<DiscoverPostResponse | null>;
  listComments(userId: number, postId: number, options: { page?: number; pageSize?: number }): Promise<DiscoverCommentListResponse | null>;
  createComment(input: PersistDiscoverCommentInput): Promise<DiscoverCommentResponse | null>;
  deleteComment(commentId: number, userId: number): Promise<{ id: number; postId: number } | null>;
  deletePost(postId: number, userId?: number): Promise<DeletedDiscoverPost | null>;
}

export interface DiscoverMediaStorage {
  storeImages(files: File[]): Promise<StoredDiscoverMedia>;
  removeStorage(storageKey: string): Promise<void>;
}
