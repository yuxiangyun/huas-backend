/**
 * [INPUT]: 依赖后台 dashboard 查询、URL 查询参数与后台会话上下文
 * [OUTPUT]: 提供 AdminUsersPage 用户分布、筛选与响应式用户列表
 * [POS]: pages/admin 的用户洞察页，与总览图表和内容洞察并列
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminDashboardQuery } from '@/entities/admin/api/admin-queries';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { Button } from '@/shared/ui/button';

const fieldClass = 'field-control h-10 min-h-10 py-1.5 text-sm';

function dateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AdminUsersPage() {
  const { session } = useAdminOutletContext();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') || 1));
  const search = params.get('search') || '';
  const major = params.get('major') || '';
  const grade = params.get('grade') || '';
  const [input, setInput] = useState(search);
  const query = useAdminDashboardQuery(session, { page, search, major, grade });
  const users = query.data?.users;

  function update(next: Record<string, string>) {
    const value = new URLSearchParams(params);
    for (const [key, entry] of Object.entries(next)) entry ? value.set(key, entry) : value.delete(key);
    setParams(value);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">用户</h1>
        <p className="text-sm text-muted">{users?.total ?? 0} 人</p>
      </header>

      <section className="grid gap-2 rounded-[0.75rem] border border-line bg-white p-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <input className={fieldClass} value={input} placeholder="学号或姓名" onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && update({ search: input.trim(), page: '' })} />
        <select className={fieldClass} value={major} onChange={(event) => update({ major: event.target.value, page: '' })}>
          <option value="">全部专业</option>
          {(users?.options.majors ?? []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className={fieldClass} value={grade} onChange={(event) => update({ grade: event.target.value, page: '' })}>
          <option value="">全部年级</option>
          {(users?.options.grades ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <Button size="sm" type="button" onClick={() => update({ search: input.trim(), page: '' })}>查询</Button>
      </section>

      <section className="overflow-hidden rounded-[0.75rem] border border-line bg-white">
        <div className="hidden overflow-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.025] text-muted"><tr><th className="px-4 py-3 font-medium">学号</th><th className="px-4 py-3 font-medium">姓名</th><th className="px-4 py-3 font-medium">专业</th><th className="px-4 py-3 font-medium">年级</th><th className="px-4 py-3 font-medium">最后登录</th></tr></thead>
            <tbody>{(users?.items ?? []).map((user) => <tr key={user.studentId} className="border-t border-line"><td className="px-4 py-3 font-mono">{user.studentId}</td><td className="px-4 py-3">{user.name || '-'}</td><td className="px-4 py-3 text-muted">{user.className}</td><td className="px-4 py-3 text-muted">{user.grade || '-'}</td><td className="px-4 py-3 text-muted">{dateTime(user.lastLoginAt)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="divide-y divide-line md:hidden">
          {(users?.items ?? []).map((user) => <article key={user.studentId} className="p-4"><div className="flex justify-between gap-3"><p className="font-medium text-ink">{user.name || '未填写姓名'}</p><p className="font-mono text-xs text-muted">{user.studentId}</p></div><p className="mt-2 text-sm text-muted">{user.className} · {user.grade || '年级未知'}</p><p className="mt-1 text-xs text-muted">最后登录 {dateTime(user.lastLoginAt)}</p></article>)}
        </div>
        <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <Button size="sm" variant="subtle" disabled={!users || users.page <= 1} onClick={() => update({ page: String(page - 1) })}>上一页</Button>
          <span>{users ? `${users.page} / ${users.totalPages}` : '-'}</span>
          <Button size="sm" variant="subtle" disabled={!users || users.page >= users.totalPages} onClick={() => update({ page: String(page + 1) })}>下一页</Button>
        </footer>
      </section>
    </div>
  );
}
