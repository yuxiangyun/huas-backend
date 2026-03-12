import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAdminAnnouncementsQuery,
  useCreateAdminAnnouncementMutation,
  useDeleteAdminAnnouncementMutation,
  useUpdateAdminAnnouncementMutation,
} from '@/entities/admin/api/admin-queries';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type { AdminAnnouncement } from '@/entities/admin/model/admin-types';
import { useToastStore } from '@/app/state/toast-store';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ApiError } from '@/shared/api/http-client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';

const fieldClassName =
  'h-11 w-full rounded-[1rem] border border-line bg-white/86 px-3 text-sm text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10';

function beijingDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function AdminAnnouncementsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const { session, onUnauthorized } = useAdminOutletContext();

  const announcementsQuery = useAdminAnnouncementsQuery(session);
  const createMutation = useCreateAdminAnnouncementMutation(session);
  const updateMutation = useUpdateAdminAnnouncementMutation(session);
  const deleteMutation = useDeleteAdminAnnouncementMutation(session);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState(beijingDate());
  const [type, setType] = useState<'info' | 'warning' | 'error'>('info');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!(announcementsQuery.error instanceof ApiError) || announcementsQuery.error.httpStatus !== 401) return;
    onUnauthorized('管理员会话已失效，请重新登录');
  }, [announcementsQuery.error, onUnauthorized]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setContent('');
    setDate(beijingDate());
    setType('info');
  }

  const sortedItems = useMemo(() => announcementsQuery.data ?? [], [announcementsQuery.data]);

  function openEdit(item: AdminAnnouncement) {
    setEditingId(item.id);
    setTitle(item.title);
    setContent(item.content);
    setDate(item.date);
    setType(item.type);
  }

  async function invalidateAll() {
    await queryClient.invalidateQueries({ queryKey: adminQueryKeys.announcementsAll() });
    await queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboardAll() });
    await queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      title: title.trim(),
      content: content.trim(),
      date,
      type,
    };

    if (!payload.title || !payload.content) {
      setErrorMessage('标题和内容不能为空');
      return;
    }

    setErrorMessage(null);

    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload });
        pushToast({
          title: `公告 ${editingId} 已更新`,
          variant: 'success',
        });
      } else {
        const created = await createMutation.mutateAsync(payload);
        pushToast({
          title: `公告 ${created.id} 已创建`,
          variant: 'success',
        });
      }

      await invalidateAll();
      resetForm();
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        onUnauthorized('管理员会话已失效，请重新登录');
        return;
      }
      setErrorMessage(getErrorMessage(error, '保存公告失败'));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteMutation.mutateAsync({ id });
      await invalidateAll();
      if (editingId === id) {
        resetForm();
      }
      setPendingDeleteId(null);
      pushToast({
        title: `公告 ${id} 已删除`,
        variant: 'success',
      });
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        onUnauthorized('管理员会话已失效，请重新登录');
        return;
      }
      setErrorMessage(getErrorMessage(error, '删除公告失败'));
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <Card className="space-y-4 bg-card-strong">
        <div>
          <p className="text-base font-semibold text-ink">公告编辑器</p>
          <p className="text-sm leading-6 text-muted">支持新增、编辑和删除公告，保存后会立即生效。</p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            className={fieldClassName}
            placeholder="公告标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          <textarea
            className="min-h-[9rem] w-full rounded-[1rem] border border-line bg-white/86 px-3 py-3 text-sm leading-6 text-ink outline-none transition focus:border-transparent focus:ring-2 focus:ring-black/10"
            placeholder="公告内容"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={fieldClassName}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />

            <select
              className={fieldClassName}
              value={type}
              onChange={(event) => setType(event.target.value as 'info' | 'warning' | 'error')}
            >
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="error">error</option>
            </select>
          </div>

          {errorMessage ? (
            <div className="rounded-[1rem] bg-[#fde9e5] px-4 py-3 text-sm leading-6 text-[#8a342c] ring-1 ring-[#efc9c0]">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="md"
              type="submit"
              disabled={pending}
            >
              {pending ? '保存中...' : editingId ? '保存修改' : '新增公告'}
            </Button>
            <Button
              size="md"
              type="button"
              variant="ghost"
              onClick={() => {
                resetForm();
                setErrorMessage(null);
              }}
            >
              {editingId ? '取消编辑' : '重置表单'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden bg-card-strong p-0">
        <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
          <div>
            <p className="text-base font-semibold text-ink">公告列表</p>
            <p className="text-sm leading-6 text-muted">共 {sortedItems.length} 条</p>
          </div>
          <Button
            size="sm"
            type="button"
            variant="subtle"
            onClick={() => void announcementsQuery.refetch()}
          >
            刷新
          </Button>
        </div>

        <div className="max-h-[36rem] overflow-auto">
          <table className="min-w-full table-fixed text-left text-sm">
            <thead className="bg-white/72 text-muted">
              <tr>
                <th className="w-[14rem] px-4 py-3 font-medium">标题</th>
                <th className="w-[6rem] px-4 py-3 font-medium">类型</th>
                <th className="w-[8rem] px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr key={item.id} className="border-t border-line/70 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{item.content}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">{item.type}</td>
                  <td className="px-4 py-3 text-muted">{item.date}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="xs"
                        type="button"
                        variant="secondary"
                        onClick={() => openEdit(item)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="xs"
                        type="button"
                        variant="danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => setPendingDeleteId(item.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!announcementsQuery.isLoading && sortedItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-muted" colSpan={4}>暂无公告</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmSheet
        open={pendingDeleteId !== null}
        busy={deleteMutation.isPending}
        title={pendingDeleteId ? `确认删除公告 ${pendingDeleteId}？` : '确认删除该公告？'}
        description="删除后不可恢复。"
        confirmLabel="确认删除"
        tone="danger"
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (!pendingDeleteId) return;
          void handleDelete(pendingDeleteId);
        }}
      />
    </div>
  );
}
