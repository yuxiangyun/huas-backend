import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Link } from '@heroui/react/link';
import { SearchInput } from '@/shared/ui/search-input';
import { Table } from '@heroui/react/table';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import { useToastStore } from '@/app/state/toast-store';
import { ApiError } from '@/shared/api/http-client';
import { AdminConfirm, AdminModal, AdminPage, AdminPagination, AdminPanel, AdminState } from '@/shared/ui/admin';
import { ContentCommentsList, ContentImage, ContentPostBody } from './content-details';
import type { ContentComments, ContentKind, ContentPost, ContentQuery } from './content-details';
import { contentDate } from './content-navigation';
import type { ContentNavigation } from './content-navigation';
import { OperationsSelect } from './operations-fields';

interface ContentPosts {
  items: ContentPost[];
  page: number;
  pageSize: number;
  total: number;
}

interface ContentManagementProps {
  kind: ContentKind;
  navigation: ContentNavigation;
  posts: ContentQuery<ContentPosts>;
  post: ContentQuery<ContentPost>;
  comments: ContentQuery<ContentComments>;
  categories?: readonly string[];
  onDeletePost: (postId: number) => Promise<unknown>;
  onDeleteComment: (commentId: number) => Promise<unknown>;
}

type DeleteTarget = { kind: 'post' | 'comment'; id: number };

function isMissing(error: unknown) {
  return error instanceof ApiError && error.httpStatus === 404;
}

export function ContentManagement({ kind, navigation, posts, post, comments, categories, onDeletePost, onDeleteComment }: ContentManagementProps) {
  const { page, commentsPage, keyword, category, postId, update } = navigation;
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const [search, setSearch] = useState(keyword);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const deleteLock = useRef(false);
  const active = useRef(true);
  const currentPostId = useRef(postId);
  currentPostId.current = postId;
  const label = kind === 'discover' ? '好饭' : '树洞';
  const contentKey = kind === 'discover' ? adminQueryKeys.discoverAll() : adminQueryKeys.treeholeAll();

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => { setSearch(keyword); }, [keyword]);

  // Replace the actual query parameter when a deletion empties the last page.
  useEffect(() => {
    if (!posts.data) return;
    const lastPage = Math.max(1, Math.ceil(posts.data.total / posts.data.pageSize));
    if (page > lastPage) update({ page: lastPage }, true);
  }, [page, posts.data, update]);

  useEffect(() => {
    if (!comments.data || postId === null) return;
    const lastPage = Math.max(1, Math.ceil(comments.data.total / comments.data.pageSize));
    if (commentsPage > lastPage) update({ commentsPage: lastPage }, true);
  }, [commentsPage, comments.data, postId, update]);

  useEffect(() => {
    if (deleting || postId === null || currentPostId.current !== postId || (!isMissing(post.error) && !isMissing(comments.error))) return;
    update({ postId: null, commentsPage: null }, true);
    setTarget(null);
    void queryClient.invalidateQueries({ queryKey: kind === 'discover' ? adminQueryKeys.discoverAll() : adminQueryKeys.treeholeAll() });
    pushToast({ title: '帖子已不存在', variant: 'info' });
  }, [comments.error, deleting, kind, post.error, postId, pushToast, queryClient, update]);

  function chooseTarget(next: DeleteTarget) {
    setDeleteError(null);
    setTarget(next);
  }

  function closeDeletedPost(id: number) {
    // A browser navigation may change the selection or leave this route during the mutation.
    if (active.current && currentPostId.current === id) update({ postId: null, commentsPage: null }, true);
  }

  async function removeTarget() {
    if (!target || deleteLock.current) return;
    deleteLock.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (target.kind === 'post') {
        await onDeletePost(target.id);
        closeDeletedPost(target.id);
      } else {
        await onDeleteComment(target.id);
      }
      setTarget(null);
      pushToast({ title: target.kind === 'post' ? '帖子已删除' : '评论已删除', variant: 'success' });
    } catch (error) {
      if (isMissing(error)) {
        setTarget(null);
        if (target.kind === 'post') closeDeletedPost(target.id);
        await queryClient.invalidateQueries({ queryKey: contentKey });
        pushToast({ title: target.kind === 'post' ? '帖子已不存在' : '评论已不存在', variant: 'info' });
      } else {
        setDeleteError(error);
      }
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  }

  function refresh() {
    void posts.refetch();
    if (postId !== null) {
      void post.refetch();
      void comments.refetch();
    }
  }

  return (
    <AdminPage title={label} actions={<Button aria-label="刷新" variant="tertiary" isDisabled={posts.isFetching} onPress={refresh}>刷新</Button>}>
      <Form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); update({ keyword: search.trim(), page: 1 }); }}>
        <SearchInput label={kind === 'discover' ? '标题、正文或店名' : '搜索正文'} value={search} onChange={setSearch} className="w-full sm:w-80" />
        {categories ? <OperationsSelect hideLabel className="w-36" label="分类" value={category || 'all'} options={[{ value: 'all', label: '全部分类' }, ...categories.map((value) => ({ value, label: value }))]} onChange={(value) => update({ category: value === 'all' ? null : value, page: 1 })} /> : null}
        <div className="flex shrink-0 items-center gap-2">
          <Button type="submit" variant="secondary">搜索</Button>
          {keyword || category ? <Button variant="ghost" onPress={() => { setSearch(''); update({ keyword: null, category: null, page: 1 }); }}>重置</Button> : null}
        </div>
      </Form>

      <AdminPanel className="overflow-hidden">
        <AdminState loading={!posts.data && posts.isPending} error={posts.error} onRetry={() => { void posts.refetch(); }} />
        {posts.data ? (
          <>
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label={`${label}帖子`} className="min-w-[62rem] table-fixed">
                  <Table.Header>
                    <Table.Column id="content" isRowHeader>内容</Table.Column>
                    <Table.Column id="author" className="w-36">作者</Table.Column>
                    {kind === 'discover' ? <Table.Column id="category" className="w-24">分类</Table.Column> : null}
                    <Table.Column id="likes" className="w-20">点赞</Table.Column>
                    <Table.Column id="comments" className="w-20">评论</Table.Column>
                    <Table.Column id="date" className="w-40">发布时间</Table.Column>
                    <Table.Column id="actions" className="w-36">操作</Table.Column>
                  </Table.Header>
                  <Table.Body items={posts.data.items} dependencies={[deleting, update]} renderEmptyState={() => <AdminState empty emptyText="暂无帖子" />}>
                    {(item) => (
                      <Table.Row id={item.id}>
                        <Table.Cell>
                          <Link className="flex w-full items-center gap-3 whitespace-normal py-1 text-left text-foreground" aria-label={`查看${label} #${item.id}`} onPress={() => update({ postId: item.id, commentsPage: 1 })}>
                            {item.images[0] ? <ContentImage image={item.images[0]} kind={kind} alt="" className="size-12 min-h-0 shrink-0 rounded-md object-cover" /> : null}
                            <span className="min-w-0">
                              <span className="line-clamp-2 [overflow-wrap:anywhere] text-sm font-normal">{'title' in item && item.title ? item.title : item.content || `#${item.id}`}</span>
                              <span className="mt-1 block text-xs text-muted">#{item.id}</span>
                            </span>
                          </Link>
                        </Table.Cell>
                        <Table.Cell><span className="block max-w-32 truncate text-sm">{item.author.displayName}</span></Table.Cell>
                        {kind === 'discover' ? <Table.Cell className="[overflow-wrap:anywhere]">{'category' in item ? item.category : ''}</Table.Cell> : null}
                        <Table.Cell className="[overflow-wrap:anywhere]">{item.stats.likeCount}</Table.Cell>
                        <Table.Cell className="[overflow-wrap:anywhere]">{item.stats.commentCount}</Table.Cell>
                        <Table.Cell><time className="whitespace-nowrap text-xs text-muted" dateTime={item.publishedAt}>{contentDate(item.publishedAt)}</time></Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" aria-label={`查看帖子 #${item.id}`} onPress={() => update({ postId: item.id, commentsPage: 1 })}>查看</Button>
                            <Button size="sm" variant="ghost" aria-label={`删除帖子 #${item.id}`} isDisabled={deleting} onPress={() => chooseTarget({ kind: 'post', id: item.id })}>删除</Button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
            <div className="mt-4"><AdminPagination page={page} pageSize={posts.data.pageSize} total={posts.data.total} isPending={posts.isFetching} onPageChange={(next) => update({ page: next })} /></div>
          </>
        ) : null}
      </AdminPanel>

      <AdminModal
        isOpen={postId !== null}
        title={`${label} #${postId ?? ''}`}
        busy={deleting}
        onOpenChange={(open) => { if (!open) update({ postId: null, commentsPage: null }, true); }}
        footer={post.data ? <Button variant="danger" isDisabled={deleting} onPress={() => chooseTarget({ kind: 'post', id: post.data!.id })}>删除帖子</Button> : undefined}
      >
        <div className="space-y-6">
          <AdminState loading={!post.data && post.isPending} error={isMissing(post.error) ? null : post.error} onRetry={() => { void post.refetch(); }} />
          {post.data ? <ContentPostBody key={post.data.id} post={post.data} kind={kind} /> : null}
          <ContentCommentsList
            query={comments}
            page={commentsPage}
            onPageChange={(next) => update({ commentsPage: next })}
            busy={deleting}
            onDelete={(comment) => chooseTarget({ kind: 'comment', id: comment.id })}
          />
        </div>
      </AdminModal>

      <AdminConfirm
        isOpen={target !== null}
        onOpenChange={(open) => { if (!open) { setTarget(null); setDeleteError(null); } }}
        title={target?.kind === 'comment' ? `删除评论 #${target.id}？` : `删除帖子 #${target?.id ?? ''}？`}
        busy={deleting}
        onConfirm={removeTarget}
      >
        <p>{target?.kind === 'comment' ? '仅删除这条评论，保留回复。' : '帖子及其讨论将不可访问。'}</p>
        {deleteError ? <p className="mt-3 text-sm text-danger" role="alert">{deleteError instanceof Error ? deleteError.message : '删除失败，请重试'}</p> : null}
      </AdminConfirm>
    </AdminPage>
  );
}
