import { DatePickerField } from '@/shared/ui/date-picker-field';
/**
 * [INPUT]: 依赖公告管理查询/变更、后台会话与 HeroUI 表单、表格及管理弹层
 * [OUTPUT]: 提供公告搜索、新增、编辑与删除，独立保留编辑草稿并在成功后刷新相关快照
 * [POS]: pages/admin 的公告管理页面；公告日期仅用于展示和排序，保存内容直接进入公开列表
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Input } from '@heroui/react/input';
import { Label } from '@heroui/react/label';
import { Table } from '@heroui/react/table';
import { TextArea } from '@heroui/react/textarea';
import { TextField } from '@heroui/react/textfield';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useAdminAnnouncementsQuery,
  useCreateAdminAnnouncementMutation,
  useDeleteAdminAnnouncementMutation,
  useUpdateAdminAnnouncementMutation,
} from '@/entities/admin/api/admin-queries';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type { AdminAnnouncement } from '@/entities/admin/model/admin-types';
import { SearchInput } from '@/shared/ui/search-input';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { beijingDateTime, operationError, OperationsSelect } from '@/pages/admin/operations-fields';
import { ApiError } from '@/shared/api/http-client';
import { AdminConfirm, AdminModal, AdminPage, AdminPanel, AdminState } from '@/shared/ui/admin';

const TYPE_OPTIONS = [
  { value: 'info', label: '通知' },
  { value: 'warning', label: '提醒' },
  { value: 'error', label: '警示' },
] as const;

type AnnouncementDraft = Pick<AdminAnnouncement, 'title' | 'content' | 'date' | 'type'> & { id?: string };

function newDraft(): AnnouncementDraft {
  return { title: '', content: '', date: beijingDateTime().slice(0, 10), type: 'info' };
}

export function AdminAnnouncementsPage() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const { session, onUnauthorized } = useAdminOutletContext();
  const query = useAdminAnnouncementsQuery(session);
  const createMutation = useCreateAdminAnnouncementMutation(session);
  const updateMutation = useUpdateAdminAnnouncementMutation(session);
  const deleteMutation = useDeleteAdminAnnouncementMutation(session);
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState<AnnouncementDraft | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const [creationChecked, setCreationChecked] = useState(false);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAnnouncement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const writeLock = useRef(false);
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || checking;
  const items = useMemo(() => {
    const search = keyword.trim().toLocaleLowerCase();
    return (query.data ?? []).filter((item) => !search || `${item.title}\n${item.content}`.toLocaleLowerCase().includes(search));
  }, [query.data, keyword]);

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.httpStatus === 401) {
      onUnauthorized('管理员会话已失效，请重新登录');
    }
  }, [query.error, onUnauthorized]);

  function invalidate() {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.announcementsAll() }),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboardAll() }),
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsAll() }),
    ]);
  }

  function closeEditor() {
    if (writeLock.current) return;
    setEditorOpen(false);
    if (!creationUncertain) setDraft(null);
  }

  async function checkCreation() {
    if (writeLock.current) return;
    writeLock.current = true;
    setChecking(true);
    try {
      await query.refetch({ throwOnError: true });
      setCreationChecked(true);
      setKeyword('');
      setEditorOpen(false);
    } catch (error) {
      setFormError(operationError(error, '列表刷新失败，请重试'));
    } finally {
      writeLock.current = false;
      setChecking(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || writeLock.current || creationUncertain) return;
    const payload = { title: draft.title.trim(), content: draft.content.trim(), date: draft.date, type: draft.type };
    if (!payload.title || !payload.content) {
      setFormError('请填写标题和正文');
      return;
    }
    writeLock.current = true;
    setFormError(null);
    try {
      if (draft.id) await updateMutation.mutateAsync({ id: draft.id, payload });
      else await createMutation.mutateAsync(payload);
      setDraft(null);
      setEditorOpen(false);
      pushToast({ title: '已保存', variant: 'success' });
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        onUnauthorized('管理员会话已失效，请重新登录');
      } else if (error instanceof ApiError && error.httpStatus === 404) {
        setDraft(null);
        setEditorOpen(false);
        invalidate();
        pushToast({ title: '公告已不存在', variant: 'error' });
      } else {
        const uncertain = !draft.id && (!(error instanceof ApiError) || error.httpStatus >= 500 || error.httpStatus < 300);
        if (uncertain) {
          setCreationUncertain(true);
          setCreationChecked(false);
        }
        setFormError(uncertain ? '创建结果未确认，请核对列表' : operationError(error));
      }
    } finally {
      writeLock.current = false;
    }
  }

  async function remove() {
    if (!deleteTarget || writeLock.current) return;
    writeLock.current = true;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id });
      setDeleteTarget(null);
      pushToast({ title: '已删除', variant: 'success' });
    } catch (error) {
      if (error instanceof ApiError && error.httpStatus === 401) {
        onUnauthorized('管理员会话已失效，请重新登录');
      } else if (error instanceof ApiError && error.httpStatus === 404) {
        setDeleteTarget(null);
        invalidate();
        pushToast({ title: '公告已不存在', variant: 'error' });
      } else {
        setDeleteError(operationError(error, '删除失败，请重试'));
      }
    } finally {
      writeLock.current = false;
    }
  }

  return (
    <AdminPage title="公告" actions={
      <Button onPress={() => { if (!draft) { setFormError(null); setDraft(newDraft()); } setEditorOpen(true); }} isDisabled={pending}>
        {draft ? '返回草稿' : '新增'}
      </Button>
    }>
      <AdminPanel>
        <div className="flex items-center gap-3">
          <SearchInput label="搜索公告" className="w-full sm:w-80" value={keyword} onChange={setKeyword} />
          <Button aria-label="刷新公告" variant="ghost" isDisabled={query.isFetching} onPress={() => { void query.refetch(); }}>
            刷新
          </Button>
        </div>
        <AdminState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch(); }} />
        {query.data ? (
          <Table variant="secondary" className="mt-4">
            <Table.ScrollContainer>
              <Table.Content aria-label="公告" className="min-w-[40rem] table-fixed">
                <Table.Header>
                  <Table.Column id="title" isRowHeader>标题</Table.Column>
                  <Table.Column id="type" className="w-20">类型</Table.Column>
                  <Table.Column id="date" className="w-32">显示日期</Table.Column>
                  <Table.Column id="actions" className="w-36">操作</Table.Column>
                </Table.Header>
                <Table.Body items={items} dependencies={[pending]} renderEmptyState={() => '暂无公告'}>
                  {(item) => (
                    <Table.Row id={item.id}>
                      <Table.Cell><span className="line-clamp-2 max-w-2xl font-medium [overflow-wrap:anywhere]">{item.title}</span></Table.Cell>
                      <Table.Cell>{TYPE_OPTIONS.find((option) => option.value === item.type)?.label}</Table.Cell>
                      <Table.Cell className="whitespace-nowrap tabular-nums">{item.date}</Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-1">
                          <Button aria-label={`编辑${item.title}`} size="sm" variant="ghost" isDisabled={pending} onPress={() => { setFormError(null); setCreationUncertain(false); setCreationChecked(false); setDraft({ ...item }); setEditorOpen(true); }}>编辑</Button>
                          <Button aria-label={`删除${item.title}`} size="sm" variant="ghost" isDisabled={pending} onPress={() => { setDeleteError(null); setDeleteTarget(item); }}>删除</Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        ) : null}
      </AdminPanel>
      <AdminModal isOpen={editorOpen && draft !== null} busy={pending} title={draft?.id ? '编辑公告' : '新增公告'} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        {draft ? (
          <Form className="space-y-5" onSubmit={(event) => { void save(event); }} aria-busy={pending}>
            <TextField isRequired isDisabled={pending} value={draft.title} onChange={(title) => setDraft({ ...draft, title })}>
              <Label>标题</Label><Input autoFocus />
            </TextField>
            <TextField isRequired isDisabled={pending} value={draft.content} onChange={(content) => setDraft({ ...draft, content })}>
              <Label>正文</Label><TextArea className="min-h-48 resize-y" />
            </TextField>
            <div className="grid gap-4 sm:grid-cols-2">
              <DatePickerField label="显示日期" value={draft.date} isRequired isDisabled={pending} onChange={(date) => setDraft({ ...draft, date })} />
              <OperationsSelect label="类型" value={draft.type} options={TYPE_OPTIONS} isDisabled={pending} onChange={(type) => setDraft({ ...draft, type })} />
            </div>
            {formError ? <p className="text-sm text-danger" role="alert">{formError}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" isDisabled={pending} onPress={() => {
                setDraft(null); setEditorOpen(false); setCreationUncertain(false); setCreationChecked(false);
              }}>{creationUncertain ? '放弃草稿' : '取消'}</Button>
              {creationUncertain ? (
                <>
                  <Button variant={creationChecked ? 'secondary' : 'primary'} isDisabled={pending} onPress={() => { void checkCreation(); }}>核对列表</Button>
                  {creationChecked ? <Button isDisabled={pending} onPress={() => setConfirmRetry(true)}>继续创建</Button> : null}
                </>
              ) : <Button type="submit" isDisabled={pending}>保存</Button>}
            </div>
          </Form>
        ) : null}
      </AdminModal>
      <AdminConfirm isOpen={confirmRetry} title="确认公告尚未创建？" confirmLabel="继续编辑" confirmVariant="primary" onOpenChange={setConfirmRetry} onConfirm={() => {
        setConfirmRetry(false); setCreationUncertain(false); setCreationChecked(false); setFormError(null);
      }} />
      <AdminConfirm isOpen={deleteTarget !== null} title="删除公告？" busy={pending} confirmLabel="删除" onOpenChange={(open) => { if (!open && !writeLock.current) setDeleteTarget(null); }} onConfirm={() => { void remove(); }}>
        <p className="break-words">{deleteTarget?.title}</p>
        {deleteError ? <p className="mt-3 text-sm text-danger" role="alert">{deleteError}</p> : null}
      </AdminConfirm>
    </AdminPage>
  );
}
