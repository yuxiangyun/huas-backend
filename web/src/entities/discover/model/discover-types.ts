export const DISCOVER_CATEGORIES = ['1食堂', '2食堂', '3食堂', '5食堂', '校外', '其他'] as const;
export const DISCOVER_SORTS = ['latest', 'score', 'recommended'] as const;

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
  category: DiscoverCategory;
  tags: string[];
  images: DiscoverImage[];
  coverUrl: string;
  imageCount: number;
  rating: {
    average: number;
    count: number;
    total: number;
    userScore: number | null;
  };
  author: {
    id: number;
    label: string;
  };
  isMine: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoverListResponse {
  items: DiscoverPost[];
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
  };
}
