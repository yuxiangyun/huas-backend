export interface TreeholePost {
  id: number;
  content: string;
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
  content: string;
  isMine: boolean;
  createdAt: string;
  updatedAt: string;
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
