/**
 * [INPUT]: 依赖后台 dashboard 查询、后台会话上下文与内容管理路由
 * [OUTPUT]: 提供 AdminContentPage，展示内容规模并进入对应管理页
 * [POS]: pages/admin 的内容索引页，连接好饭、树洞与公告管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';
import { useAdminDashboardQuery } from '@/entities/admin/api/admin-queries';
import { useAdminOutletContext } from '@/pages/admin/layout';

export function AdminContentPage() {
  const { session } = useAdminOutletContext();
  const query = useAdminDashboardQuery(session, { page: 1 });
  const metrics = query.data?.metrics;
  const entries = [
    { label: '好饭内容', value: metrics?.totalDiscoverPosts ?? 0, to: appRoutes.adminDiscover },
    { label: '好饭评分', value: metrics?.totalDiscoverRatings ?? 0, to: appRoutes.adminDiscover },
    { label: '公告', value: query.data?.announcements.length ?? 0, to: appRoutes.adminAnnouncements },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-[-0.025em]">内容</h1>
      <section className="grid gap-3 sm:grid-cols-3">
        {entries.map((entry) => (
          <Link key={entry.label} to={entry.to} className="rounded-[0.75rem] border border-line bg-white p-4 hover:border-[#d4d4d4]">
            <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted">{entry.label}</p><ChevronRight aria-hidden="true" className="size-4 text-muted" /></div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{entry.value.toLocaleString()}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
