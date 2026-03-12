import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminDiscoverQuery,
  useDeleteAdminDiscoverPostMutation,
} from '@/entities/admin/api/admin-queries';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type { AdminDiscoverPost } from '@/entities/admin/model/admin-types';
import { useToastStore } from '@/app/state/toast-store';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ApiError } from '@/shared/api/http-client';
import { buildMediaUrl } from '@/shared/api/media';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { ImageViewer } from '@/shared/ui/image-viewer';

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function AdminDiscoverPage() {
  const { session, onUnauthorized } = useAdminOutletContext();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);

  const discoverQuery = useAdminDiscoverQuery(session, { page: 1 });
  const deleteMutation = useDeleteAdminDiscoverPostMutation(session);

  const [previewPost, setPreviewPost] = useState<AdminDiscoverPost | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);
  const [pendingDeletePostId, setPendingDeletePostId] = useState<number | null>(null);

  useEffect(() => {
    if (!(discoverQuery.error instanceof ApiError) || discoverQuery.error.httpStatus !== 401) return;
    onUnauthorized('管理员会话已失效，请重新登录');
  }, [discoverQuery.error, onUnauthorized]);

  const previewItems = useMemo(
    () =>
      (previewPost?.images ?? []).map((item, index) => ({
        src: buildMediaUrl(item.url),
        alt: `Discover #${previewPost?.id ?? '-'} 第 ${index + 1} 张`,
        key: `${previewPost?.id ?? 'unknown'}-${index}`,
      })),
    [previewPost]
  );

  async function handleDelete(postId: number) {
    try {
      await deleteMutation.mutateAsync({ postId });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.discoverAll() });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboardAll() });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() });
      pushToast({
        title: `帖子 #${postId} 已删除`,
        variant: 'success',
      });

      if (previewPost?.id === postId) {
        setPreviewPost(null);
        setPreviewImageIndex(null);
      }
      setPendingDeletePostId(null);
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        onUnauthorized('管理员会话已失效，请重新登录');
        return;
      }
      pushToast({
        title: '删除 Discover 帖子失败',
        message: getErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 bg-card-strong sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-ink">Discover 管理</p>
          <p className="text-sm leading-6 text-muted">
            {discoverQuery.data
              ? `当前未删除帖子 ${discoverQuery.data.totalPosts} 条，累计评分 ${discoverQuery.data.totalRatings} 条`
              : '加载中...'}
          </p>
        </div>

        <Button
          size="sm"
          type="button"
          variant="subtle"
          onClick={() => void discoverQuery.refetch()}
        >
          刷新
        </Button>
      </Card>

      {discoverQuery.isError ? (
        <Card className="space-y-2 bg-card-strong">
          <p className="text-base font-semibold text-ink">Discover 列表加载失败</p>
          <p className="text-sm leading-6 text-muted">{getErrorMessage(discoverQuery.error, '请稍后重试')}</p>
        </Card>
      ) : null}

      <Card className="overflow-hidden bg-card-strong p-0">
        <div className="overflow-auto">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-white/72 text-muted">
              <tr>
                <th className="w-[5.5rem] px-4 py-3 font-medium">ID</th>
                <th className="w-[6.5rem] px-4 py-3 font-medium">图片</th>
                <th className="w-[12rem] px-4 py-3 font-medium">标题</th>
                <th className="w-[7rem] px-4 py-3 font-medium">分类</th>
                <th className="w-[9rem] px-4 py-3 font-medium">作者</th>
                <th className="w-[8rem] px-4 py-3 font-medium">评分</th>
                <th className="w-[10rem] px-4 py-3 font-medium">发布时间</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {(discoverQuery.data?.items ?? []).map((item) => (
                <tr key={item.id} className="border-t border-line/70">
                  <td className="px-4 py-3 font-mono text-ink">#{item.id}</td>
                  <td className="px-4 py-3">
                    <Button
                      size="xs"
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setPreviewPost(item);
                        setPreviewImageIndex(0);
                      }}
                    >
                      查看 ({item.imageCount})
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-ink">{item.title || '-'}</td>
                  <td className="px-4 py-3 text-muted">{item.category}</td>
                  <td className="px-4 py-3 text-muted">{item.authorLabel}</td>
                  <td className="px-4 py-3 text-muted">{item.ratingAverage} / {item.ratingCount}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(item.publishedAt)}</td>
                  <td className="px-4 py-3">
                    <Button
                      size="xs"
                      type="button"
                      variant="danger"
                      disabled={deleteMutation.isPending}
                      onClick={() => setPendingDeletePostId(item.id)}
                    >
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
              {!discoverQuery.isLoading && (discoverQuery.data?.items.length ?? 0) === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={8}>暂无帖子</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmSheet
        open={pendingDeletePostId !== null}
        busy={deleteMutation.isPending}
        title={pendingDeletePostId ? `确认删除 Discover 帖子 #${pendingDeletePostId}？` : '确认删除该帖子？'}
        description="删除后不可恢复。"
        confirmLabel="确认删除"
        tone="danger"
        onClose={() => setPendingDeletePostId(null)}
        onConfirm={() => {
          if (pendingDeletePostId === null) return;
          void handleDelete(pendingDeletePostId);
        }}
      />

      <ImageViewer
        index={previewImageIndex}
        items={previewItems}
        onClose={() => {
          setPreviewImageIndex(null);
          setPreviewPost(null);
        }}
        onIndexChange={(index) => setPreviewImageIndex(index)}
      />
    </div>
  );
}
