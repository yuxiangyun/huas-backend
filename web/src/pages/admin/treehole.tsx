/**
 * [INPUT]: 依赖 Treehole 独立详情、正文查询、评论回复关系与共用 HeroUI 内容管理容器
 * [OUTPUT]: 提供树洞列表、稳定详情、Cookie 私有图片与帖子/单评删除交互
 * [POS]: pages/admin 的树洞管理路由，不以当前列表页或普通 Bearer 身份决定详情访问
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  useAdminTreeholeCommentsQuery,
  useAdminTreeholePostQuery,
  useAdminTreeholePostsQuery,
  useDeleteAdminTreeholeCommentMutation,
  useDeleteAdminTreeholePostMutation,
} from '@/entities/admin/api/admin-queries';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ContentManagement } from './content-management';
import { CONTENT_PAGE_SIZE, useContentNavigation } from './content-navigation';

export function AdminTreeholeSubPage() {
  const { session } = useAdminOutletContext();
  const navigation = useContentNavigation();
  const posts = useAdminTreeholePostsQuery(session, {
    page: navigation.page,
    pageSize: CONTENT_PAGE_SIZE,
    keyword: navigation.keyword || undefined,
  });
  const post = useAdminTreeholePostQuery(session, navigation.postId);
  const comments = useAdminTreeholeCommentsQuery(session, navigation.postId, { page: navigation.commentsPage, pageSize: CONTENT_PAGE_SIZE });
  const deletePost = useDeleteAdminTreeholePostMutation(session);
  const deleteComment = useDeleteAdminTreeholeCommentMutation(session);
  return <ContentManagement kind="treehole" navigation={{ ...navigation, category: '' }} posts={posts} post={post} comments={comments} onDeletePost={(postId) => deletePost.mutateAsync({ postId })} onDeleteComment={(commentId) => deleteComment.mutateAsync({ commentId })} />;
}
