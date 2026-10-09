import { useState } from 'react';
import { Avatar } from '@heroui/react/avatar';
import { Button } from '@heroui/react/button';
import type { AdminDiscoverPostDetail, AdminTreeholeComment, AdminTreeholePost } from '@/entities/admin/model/admin-types';
import { buildMediaUrl } from '@/shared/api/media';
import { AdminModal, AdminPagination, AdminState } from '@/shared/ui/admin';
import { PrivateMediaImage } from '@/shared/ui/private-media-image';
import { contentDate } from './content-navigation';

export type ContentPost = AdminDiscoverPostDetail | AdminTreeholePost;
export type ContentKind = 'discover' | 'treehole';
export interface ContentQuery<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}
export interface ContentComments {
  items: AdminTreeholeComment[];
  page: number;
  pageSize: number;
  total: number;
}

export function ContentAuthor({ author }: { author: ContentPost['author'] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar size="sm">
        {author.avatarUrl ? <Avatar.Image src={buildMediaUrl(author.avatarUrl)} alt="" /> : null}
        <Avatar.Fallback>{author.displayName.slice(0, 1)}</Avatar.Fallback>
      </Avatar>
      <span className="truncate text-sm">{author.displayName}</span>
    </span>
  );
}

export function ContentImage({ image, kind, alt, className }: {
  image: ContentPost['images'][number];
  kind: ContentKind;
  alt: string;
  className: string;
}) {
  return kind === 'treehole' ? (
    <PrivateMediaImage authMode="admin" src={image.url} alt={alt} className={className} width={image.width} height={image.height} />
  ) : (
    <img src={buildMediaUrl(image.url)} alt={alt} className={className} width={image.width} height={image.height} loading="lazy" />
  );
}

function ContentImages({ post, kind }: { post: ContentPost; kind: ContentKind }) {
  const [preview, setPreview] = useState<number | null>(null);
  const image = preview === null ? null : post.images[preview];
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {post.images.map((item, index) => (
          <Button
            key={item.url}
            aria-label={`查看第 ${index + 1} 张图片`}
            className="aspect-square h-auto w-full min-w-0 overflow-hidden rounded-lg p-0"
            variant="tertiary"
            onPress={() => setPreview(index)}
          >
            <ContentImage image={item} kind={kind} alt={`帖子 #${post.id} 第 ${index + 1} 张图片`} className="size-full min-h-0 object-cover" />
          </Button>
        ))}
      </div>
      <AdminModal
        isOpen={image !== null && image !== undefined}
        onOpenChange={(open) => { if (!open) setPreview(null); }}
        title={`图片 ${(preview ?? 0) + 1} / ${post.images.length}`}
        className="max-w-5xl"
        footer={post.images.length > 1 ? (
          <>
            <Button aria-label="上一张图片" variant="tertiary" isDisabled={preview === 0} onPress={() => setPreview((current) => Math.max(0, (current ?? 0) - 1))}>上一张</Button>
            <Button aria-label="下一张图片" variant="tertiary" isDisabled={preview === post.images.length - 1} onPress={() => setPreview((current) => Math.min(post.images.length - 1, (current ?? 0) + 1))}>下一张</Button>
          </>
        ) : undefined}
      >
        {image ? <ContentImage image={image} kind={kind} alt={`帖子 #${post.id} 第 ${(preview ?? 0) + 1} 张图片`} className="max-h-[70dvh] w-full min-h-0 object-contain" /> : null}
      </AdminModal>
    </>
  );
}

export function ContentPostBody({ post, kind }: { post: ContentPost; kind: ContentKind }) {
  return (
    <article className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ContentAuthor author={post.author} />
        <time className="text-xs text-muted" dateTime={post.publishedAt}>{contentDate(post.publishedAt)}</time>
      </div>
      {'title' in post ? (
        <div className="space-y-2">
          {post.title ? <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">{post.title}</h2> : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted [overflow-wrap:anywhere]">
            {post.storeName ? <span>{post.storeName}</span> : null}
            {post.priceText ? <span>{post.priceText}</span> : null}
            <span>{post.category}</span>
          </div>
          {post.tags.length > 0 ? <div className="flex flex-wrap gap-2 text-sm text-muted [overflow-wrap:anywhere]">{post.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
        </div>
      ) : null}
      {post.content ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-7">{post.content}</p> : null}
      {post.images.length > 0 ? <ContentImages post={post} kind={kind} /> : null}
      <div className="flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5" aria-label={`${post.stats.likeCount} 次点赞`}>点赞 {post.stats.likeCount}</span>
        <span className="flex items-center gap-1.5" aria-label={`${post.stats.commentCount} 条评论`}>评论 {post.stats.commentCount}</span>
      </div>
    </article>
  );
}

export function ContentCommentsList({ query, page, onPageChange, onDelete, busy }: {
  query: ContentQuery<ContentComments>;
  page: number;
  onPageChange: (page: number) => void;
  onDelete: (comment: AdminTreeholeComment) => void;
  busy: boolean;
}) {
  const comments = query.data?.items ?? [];
  const parents = new Map(comments.map((comment) => [comment.id, comment]));
  return (
    <section className="space-y-4 border-t border-separator pt-5">
      <h2 className="text-base font-semibold">评论</h2>
      <AdminState loading={!query.data && query.isPending} error={query.error} onRetry={() => { void query.refetch(); }} empty={Boolean(query.data && comments.length === 0)} emptyText="暂无评论" />
      {comments.length > 0 ? (
        <ol className="divide-y divide-separator">
          {comments.map((comment) => {
            const parent = comment.parentCommentId === null ? undefined : parents.get(comment.parentCommentId);
            return (
              <li key={comment.id} className="space-y-3 py-4 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <ContentAuthor author={comment.author} />
                  <Button aria-label={`删除评论 #${comment.id}`} size="sm" variant="ghost" isDisabled={busy} onPress={() => onDelete(comment)}>删除</Button>
                </div>
                {comment.parentCommentId !== null ? <p className="border-l-2 border-separator pl-3 text-xs text-muted">回复 {parent ? <span className="mr-2">{parent.author.displayName}</span> : null}#{comment.parentCommentId}{parent ? <span className="mt-1 block line-clamp-2 [overflow-wrap:anywhere]">{parent.content}</span> : null}</p> : null}
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-6">{comment.content}</p>
                <div className="flex items-center gap-3 text-xs text-muted"><span>#{comment.id}</span><time dateTime={comment.createdAt}>{contentDate(comment.createdAt)}</time></div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {query.data ? <AdminPagination page={page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={onPageChange} isPending={query.isFetching || busy} /> : null}
    </section>
  );
}
