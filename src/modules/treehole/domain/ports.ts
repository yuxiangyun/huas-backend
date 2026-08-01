/**
 * [INPUT]: 依赖 Treehole 领域 DTO，不依赖具体数据库、图片库或文件系统
 * [OUTPUT]: 对外提供 TreeholePersistence、私有媒体写入生命周期与鉴权后读取边界端口
 * [POS]: modules/treehole/domain 的依赖倒置契约，约束 application 不感知 SQLite、图片处理、文件系统与公共作者投影实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  AdminTreeholeCommentListOptions,
  AdminTreeholeCommentListResponse,
  AdminTreeholePostListOptions,
  AdminTreeholePostListResponse,
  PersistTreeholeCommentInput,
  TreeholeCommentListResponse,
  TreeholeCommentResponse,
  TreeholeListResponse,
  TreeholePostResponse,
  StoredTreeholeMedia,
} from './treehole';

export interface DeletedTreeholePost {
  id: number;
  mediaKey: string | null;
}

export interface TreeholeMediaStorage {
  prepare(files: readonly File[]): Promise<StoredTreeholeMedia | null>;
  removeStorage(mediaKey: string | null): Promise<void>;
  cleanupOrphans(before: Date): Promise<number>;
}

export interface AdminTreeholeMedia {
  data: Blob;
  postId: number;
}

export interface TreeholeMediaReader {
  userUrlFor(mediaKey: string, fileName: string): string;
  adminUrlFor(mediaKey: string, fileName: string): string;
  getForUser(mediaKey: string, fileName: string): Promise<Blob | null>;
  getForAdmin(mediaKey: string, fileName: string): Promise<AdminTreeholeMedia | null>;
}

export interface TreeholePersistence {
  listPosts(options: { userId: number; page: number; pageSize: number }): Promise<TreeholeListResponse>;
  listUserPosts(options: {
    viewerUserId: number;
    authorUserId: number;
    page: number;
    pageSize: number;
  }): Promise<TreeholeListResponse>;
  createPost(input: {
    userId: number;
    content: string;
    media: StoredTreeholeMedia | null;
  }): Promise<TreeholePostResponse | null>;
  getPostDetail(userId: number, postId: number): Promise<TreeholePostResponse | null>;
  likePost(userId: number, postId: number): Promise<TreeholePostResponse | null>;
  unlikePost(userId: number, postId: number): Promise<TreeholePostResponse | null>;
  listComments(userId: number, postId: number, options: { page: number; pageSize: number }): Promise<TreeholeCommentListResponse | null>;
  createComment(input: PersistTreeholeCommentInput): Promise<TreeholeCommentResponse | null>;
  deletePost(postId: number, userId: number): Promise<DeletedTreeholePost | null>;
  deleteComment(commentId: number, userId: number): Promise<{ id: number; postId: number } | null>;
  adminListPosts(options: AdminTreeholePostListOptions & { page: number; pageSize: number }): Promise<AdminTreeholePostListResponse>;
  adminListComments(postId: number, options: { page: number; pageSize: number }): Promise<AdminTreeholeCommentListResponse | null>;
  adminDeletePost(postId: number): Promise<DeletedTreeholePost | null>;
  adminDeleteComment(commentId: number): Promise<{ id: number; postId: number } | null>;
}
