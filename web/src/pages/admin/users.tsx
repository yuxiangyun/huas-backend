/**
 * [INPUT]: 依赖独立管理用户查询、URL 筛选与后台会话
 * [OUTPUT]: 提供单行账户筛选栏、时间筛选弹窗、按后台账号记忆的时间排序、刷新与稳定分页
 * [POS]: pages/admin 的账户只读页；空资料保持缺失语义，不提供用户写操作
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { Table } from '@heroui/react/table';
import { parseDate } from '@internationalized/date';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminUsersQuery } from '@/entities/admin/api/admin-queries';
import type { AdminUserTimeField, AdminUserTimeRange } from '@/entities/admin/model/admin-types';
import { formatBeijingDateTime } from '@/pages/admin/insights-ui';
import { beijingDateTime, OperationsSelect } from '@/pages/admin/operations-fields';
import { SearchInput } from '@/shared/ui/search-input';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { AdminModal, AdminPage, AdminPanel, AdminPagination, AdminState } from '@/shared/ui/admin';
import { DatePickerField } from '@/shared/ui/date-picker-field';

const TIME_FIELDS: ReadonlyArray<{ value: AdminUserTimeField; label: string }> = [
  { value: 'lastActiveAt', label: '最近活跃' },
  { value: 'lastLoginAt', label: '最近认证' },
  { value: 'createdAt', label: '创建时间' },
];
const TIME_RANGES: ReadonlyArray<{ value: AdminUserTimeRange; label: string }> = [
  { value: 'all', label: '不限时间' }, { value: 'today', label: '今天' },
  { value: '7d', label: '近 7 天' }, { value: '30d', label: '近 30 天' },
  { value: 'before7d', label: '早于 7 天前' }, { value: 'before30d', label: '早于 30 天前' },
  { value: 'custom', label: '自定义日期' },
];
const SORT_ORDERS = [{ value: 'desc', label: '从新到旧' }, { value: 'asc', label: '从旧到新' }] as const;
const SORT_OPTIONS = TIME_FIELDS.flatMap((field) => SORT_ORDERS.map((order) => ({
  value: `${field.value}:${order.value}`, label: `${field.label} · ${order.label}`,
  sortBy: field.value, sortOrder: order.value,
})));

function sortStorageKey(username: string) { return `huas.admin.users.sort:${encodeURIComponent(username)}`; }

function readSavedSort(username: string) {
  try {
    const value = localStorage.getItem(sortStorageKey(username));
    if (SORT_OPTIONS.some((option) => option.value === value)) return value!;
  } catch { /* 存储不可用时仍可在当前页面排序。 */ }
  return 'lastActiveAt:desc';
}

interface TimeFilterDraft {
  timeField: AdminUserTimeField;
  timeRange: AdminUserTimeRange;
  from: string;
  to: string;
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  try { return parseDate(value).toString() === value ? value : ''; } catch { return ''; }
}

function UserFilter({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const items = [{ id: 'all', label: `全部${label}` }, ...options.map((item) => ({ id: `value:${item.value}`, label: item.label }))];
  if (value && !options.some((item) => item.value === value)) items.push({ id: `value:${value}`, label: value });
  return <Select aria-label={label} value={value ? `value:${value}` : 'all'} onChange={(key) => onChange(key === 'all' || key === null ? '' : String(key).slice(6))} className="w-36 shrink-0">
    <Select.Trigger className="h-10 items-center md:h-9"><Select.Value className="truncate" /><Select.Indicator /></Select.Trigger>
    <Select.Popover><ListBox items={items}>{(item) => <ListBox.Item id={item.id} textValue={item.label}><span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span><ListBox.ItemIndicator /></ListBox.Item>}</ListBox></Select.Popover>
  </Select>;
}

export function AdminUsersPage() {
  const { session } = useAdminOutletContext();
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const search = (params.get('search') || '').trim();
  const className = (params.get('className') || '').trim();
  const rawGrade = params.get('grade') || '';
  const grade = /^(19|20)\d{2}$/.test(rawGrade) ? rawGrade : '';
  const timeField = TIME_FIELDS.find((item) => item.value === params.get('timeField'))?.value ?? 'lastActiveAt';
  const timeRange = TIME_RANGES.find((item) => item.value === params.get('timeRange'))?.value ?? 'all';
  const [savedSort, setSavedSort] = useState(() => readSavedSort(session.username));
  const saved = SORT_OPTIONS.find((option) => option.value === savedSort) ?? SORT_OPTIONS[0]!;
  const sortBy = TIME_FIELDS.find((item) => item.value === params.get('sortBy'))?.value ?? saved.sortBy;
  const sortOrder = SORT_ORDERS.find((item) => item.value === params.get('sortOrder'))?.value ?? saved.sortOrder;
  const from = timeRange === 'custom' ? validDate(params.get('from')) : '';
  const to = timeRange === 'custom' ? validDate(params.get('to')) : '';
  const [input, setInput] = useState(search);
  const [timeDraft, setTimeDraft] = useState<TimeFilterDraft | null>(null);
  const [filterError, setFilterError] = useState('');
  const query = useAdminUsersQuery(session, { page, search, className, grade, timeField, timeRange, from, to, sortBy, sortOrder });
  const users = query.data;

  useEffect(() => { setInput(search); }, [search]);
  useEffect(() => {
    const value = `${sortBy}:${sortOrder}`;
    setSavedSort(value);
    try { localStorage.setItem(sortStorageKey(session.username), value); } catch { /* 记忆失败不阻断查询。 */ }
  }, [sortBy, sortOrder, session.username]);
  useEffect(() => {
    if (!users || (users.page === page && rawPage === page)) return;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (users.page === 1) next.delete('page'); else next.set('page', String(users.page));
      return next;
    }, { replace: true });
  }, [users, page, rawPage, setParams]);

  function update(changes: Record<string, string>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value); else next.delete(key);
      }
      next.delete('major');
      return next;
    });
  }

  function applyTimeFilter() {
    if (!timeDraft) return;
    if (timeDraft.timeRange === 'custom') {
      if (!timeDraft.from && !timeDraft.to) { setFilterError('至少选择一个日期'); return; }
      if (timeDraft.from && timeDraft.to && timeDraft.from > timeDraft.to) { setFilterError('开始日期不能晚于结束日期'); return; }
    }
    update({ ...timeDraft, from: timeDraft.timeRange === 'custom' ? timeDraft.from : '', to: timeDraft.timeRange === 'custom' ? timeDraft.to : '', page: '' });
    setTimeDraft(null);
  }

  const hasFilters = search || className || grade || input || timeRange !== 'all';
  const timeFilterLabel = timeRange === 'all' ? '时间筛选'
    : `${TIME_FIELDS.find((item) => item.value === timeField)?.label} · ${TIME_RANGES.find((item) => item.value === timeRange)?.label}`;

  return <AdminPage title="用户">
    <Form className="flex flex-nowrap items-center gap-2 overflow-x-auto py-1" onSubmit={(event) => { event.preventDefault(); update({ search: input.trim(), page: '' }); }}>
      <SearchInput label="学号或姓名" value={input} onChange={setInput} className="w-48 shrink-0" />
      <UserFilter label="班级" value={className} options={users?.options.classes ?? []} onChange={(value) => update({ className: value, page: '' })} />
      <UserFilter label="推断年级" value={grade} options={(users?.options.grades ?? []).map((value) => ({ value, label: value }))} onChange={(value) => update({ grade: value, page: '' })} />
      <Button type="button" variant={timeRange === 'all' ? 'secondary' : 'primary'} className="shrink-0" aria-label="时间筛选" onPress={() => { setFilterError(''); setTimeDraft({ timeField, timeRange, from, to }); }}>{timeFilterLabel}</Button>
      <OperationsSelect label="用户排序" hideLabel value={`${sortBy}:${sortOrder}`} options={SORT_OPTIONS} onChange={(value) => {
        const next = SORT_OPTIONS.find((option) => option.value === value)!;
        update({ sortBy: next.sortBy, sortOrder: next.sortOrder, page: '' });
      }} className="w-48" />
      <div className="flex shrink-0 items-center gap-2">
        <Button type="submit" variant="secondary">搜索</Button>
        {hasFilters ? <Button type="button" variant="ghost" onPress={() => { setInput(''); update({ search: '', className: '', grade: '', timeField: '', timeRange: '', from: '', to: '', page: '' }); }}>清空</Button> : null}
      </div>
    </Form>
    <AdminModal title="时间筛选" isOpen={timeDraft !== null} onOpenChange={(open) => { if (!open) setTimeDraft(null); }}>
      {timeDraft ? <Form className="space-y-5" onSubmit={(event) => { event.preventDefault(); applyTimeFilter(); }}>
        <div className="grid grid-cols-2 gap-4">
          <OperationsSelect label="筛选时间" value={timeDraft.timeField} options={TIME_FIELDS} onChange={(value) => setTimeDraft({ ...timeDraft, timeField: value })} />
          <OperationsSelect label="时间范围" value={timeDraft.timeRange} options={TIME_RANGES} onChange={(value) => {
            const today = beijingDateTime().slice(0, 10);
            setTimeDraft({ ...timeDraft, timeRange: value, from: timeDraft.from || today, to: timeDraft.to || today });
            setFilterError('');
          }} />
          {timeDraft.timeRange === 'custom' ? <>
            <DatePickerField label="开始日期（北京）" value={timeDraft.from} onChange={(value) => { setTimeDraft({ ...timeDraft, from: value }); setFilterError(''); }} />
            <DatePickerField label="结束日期（北京）" value={timeDraft.to} onChange={(value) => { setTimeDraft({ ...timeDraft, to: value }); setFilterError(''); }} />
          </> : null}
        </div>
        {filterError ? <p role="alert" className="text-sm text-danger">{filterError}</p> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onPress={() => setTimeDraft(null)}>取消</Button><Button type="submit">应用筛选</Button></div>
      </Form> : null}
    </AdminModal>
    <AdminState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch(); }} />
    {users ? <AdminPanel>
      <Table variant="secondary"><Table.ScrollContainer><Table.Content aria-label="用户列表" className="min-w-[68rem] table-fixed">
        <Table.Header>
          <Table.Column id="studentId" className="w-40" isRowHeader>学号</Table.Column><Table.Column id="name" className="w-32">姓名</Table.Column><Table.Column id="className" className="w-52">班级</Table.Column><Table.Column id="grade" className="w-24">推断年级</Table.Column><Table.Column id="createdAt">创建时间</Table.Column><Table.Column id="lastLoginAt">最近认证</Table.Column><Table.Column id="lastActiveAt">最近活跃</Table.Column>
        </Table.Header>
        <Table.Body items={users.items} renderEmptyState={() => <AdminState empty emptyText="没有匹配的用户" />}>
          {(user) => <Table.Row id={user.studentId}>
            <Table.Cell className="font-mono [overflow-wrap:anywhere]">{user.studentId}</Table.Cell><Table.Cell className="[overflow-wrap:anywhere]">{user.name || '—'}</Table.Cell><Table.Cell className="[overflow-wrap:anywhere]">{user.className || '—'}</Table.Cell><Table.Cell>{user.grade || '—'}</Table.Cell><Table.Cell className="whitespace-nowrap tabular-nums">{formatBeijingDateTime(user.createdAt)}</Table.Cell><Table.Cell className="whitespace-nowrap tabular-nums">{formatBeijingDateTime(user.lastLoginAt)}</Table.Cell><Table.Cell className="whitespace-nowrap tabular-nums">{formatBeijingDateTime(user.lastActiveAt)}</Table.Cell>
          </Table.Row>}
        </Table.Body>
      </Table.Content></Table.ScrollContainer></Table>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="text-sm text-muted tabular-nums">{users.total.toLocaleString('zh-CN')} 人</span><Button size="sm" variant="ghost" isDisabled={query.isFetching} onPress={() => { void query.refetch(); }}>刷新</Button></div><AdminPagination page={users.page} pageSize={users.pageSize} total={users.total} isPending={query.isFetching} onPageChange={(value) => update({ page: String(value) })} /></div>
    </AdminPanel> : null}
  </AdminPage>;
}
