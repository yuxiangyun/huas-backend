/**
 * [INPUT]: 依赖独立管理用户查询、URL 筛选与后台会话
 * [OUTPUT]: 提供学号姓名搜索、班级和推断年级筛选、活跃时间与稳定分页
 * [POS]: pages/admin 的账户只读页；空资料保持缺失语义，不提供用户写操作
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { ListBox } from '@heroui/react/list-box';
import { Select } from '@heroui/react/select';
import { Table } from '@heroui/react/table';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminUsersQuery } from '@/entities/admin/api/admin-queries';
import { formatBeijingDateTime } from '@/pages/admin/insights-ui';
import { SearchInput } from '@/shared/ui/search-input';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { AdminPage, AdminPanel, AdminPagination, AdminState } from '@/shared/ui/admin';

function UserFilter({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const items = [{ id: 'all', label: `全部${label}` }, ...options.map((item) => ({ id: `value:${item.value}`, label: item.label }))];
  if (value && !options.some((item) => item.value === value)) items.push({ id: `value:${value}`, label: value });
  return <Select aria-label={label} value={value ? `value:${value}` : 'all'} onChange={(key) => onChange(key === 'all' || key === null ? '' : String(key).slice(6))} className="min-w-0 w-full sm:w-40 sm:shrink-0">
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
  const [input, setInput] = useState(search);
  const query = useAdminUsersQuery(session, { page, search, className, grade });
  const users = query.data;

  useEffect(() => { setInput(search); }, [search]);
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

  return <AdminPage title="用户">
    <Form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); update({ search: input.trim(), page: '' }); }}>
      <SearchInput label="学号或姓名" value={input} onChange={setInput} className="w-full sm:w-60" />
      <UserFilter label="班级" value={className} options={users?.options.classes ?? []} onChange={(value) => update({ className: value, page: '' })} />
      <UserFilter label="推断年级" value={grade} options={(users?.options.grades ?? []).map((value) => ({ value, label: value }))} onChange={(value) => update({ grade: value, page: '' })} />
      <div className="flex shrink-0 items-center gap-2">
        <Button type="submit" variant="secondary">搜索</Button>
        {search || className || grade || input ? <Button type="button" variant="ghost" onPress={() => { setInput(''); update({ search: '', className: '', grade: '', page: '' }); }}>清空</Button> : null}
      </div>
    </Form>
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted tabular-nums">{users.total.toLocaleString('zh-CN')} 人</span><AdminPagination page={users.page} pageSize={users.pageSize} total={users.total} isPending={query.isFetching} onPageChange={(value) => update({ page: String(value) })} /></div>
    </AdminPanel> : null}
  </AdminPage>;
}
