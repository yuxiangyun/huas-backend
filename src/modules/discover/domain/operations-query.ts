/**
 * [INPUT]: 依赖 DiscoverStoredImage 领域媒体 DTO
 * [OUTPUT]: 对外提供 DiscoverOperationsQueryPort 与管理仪表盘只读快照 DTO
 * [POS]: discover/domain 的公开查询契约，向 Operations 隐藏 Discover 表、join 与存储 JSON
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { DiscoverStoredImage } from './discover';

export interface DiscoverOperationsPost {
  id: number;
  title: string;
  category: string;
  coverUrl: string;
  images: DiscoverStoredImage[];
  imageCount: number;
  ratingAverage: number;
  ratingCount: number;
  authorLabel: string;
  publishedAt: string | null;
}

export interface DiscoverOperationsSnapshot {
  totalPosts: number;
  totalRatings: number;
  items: DiscoverOperationsPost[];
}

export interface DiscoverOperationsQueryPort {
  getSnapshot(limit: number): Promise<DiscoverOperationsSnapshot>;
}
