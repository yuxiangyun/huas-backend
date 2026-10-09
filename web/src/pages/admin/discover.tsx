/**
 * [INPUT]: 依赖好饭独立管理查询、评论删除、URL 筛选与共用 HeroUI 内容管理容器
 * [OUTPUT]: 提供完整好饭列表、稳定详情、评论与单条删除交互
 * [POS]: pages/admin 的好饭管理路由，仅使用管理员 Cookie API 与公共媒体边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  useAdminDiscoverCommentsQuery,
  useAdminDiscoverPostQuery,
  useAdminDiscoverPostsQuery,
  useDeleteAdminDiscoverCommentMutation,
  useDeleteAdminDiscoverPostMutation,
} from '@/entities/admin/api/admin-queries';
import { DISCOVER_CATEGORIES } from '@/entities/discover/model/discover-types';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ContentManagement } from './content-management';
import { CONTENT_PAGE_SIZE, useContentNavigation } from './content-navigation';

export function AdminDiscoverPage() {
  const { session } = useAdminOutletContext();
  const navigation = useContentNavigation();
  const category = DISCOVER_CATEGORIES.find((value) => value === navigation.category) ?? '';
  const posts = useAdminDiscoverPostsQuery(session, {
    page: navigation.page,
    pageSize: CONTENT_PAGE_SIZE,
    keyword: navigation.keyword || undefined,
    category: category || undefined,
  });
  const post = useAdminDiscoverPostQuery(session, navigation.postId);
  const comments = useAdminDiscoverCommentsQuery(session, navigation.postId, { page: navigation.commentsPage, pageSize: CONTENT_PAGE_SIZE });
  const deletePost = useDeleteAdminDiscoverPostMutation(session);
  const deleteComment = useDeleteAdminDiscoverCommentMutation(session);
  return <ContentManagement kind="discover" navigation={{ ...navigation, category }} posts={posts} post={post} comments={comments} categories={posts.data?.options.categories ?? DISCOVER_CATEGORIES} onDeletePost={(postId) => deletePost.mutateAsync({ postId })} onDeleteComment={(commentId) => deleteComment.mutateAsync({ commentId })} />;
}
