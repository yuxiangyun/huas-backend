/**
 * [INPUT]: 依赖后台 dashboard 查询、后台会话上下文与管理路由
 * [OUTPUT]: 提供 AdminContentPage 内容规模与管理入口
 * [POS]: pages/admin 的内容洞察页，连接 Discover、Treehole 与公告管理
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Link } from 'react-router-dom';
import { useAdminDashboardQuery } from '@/entities/admin/api/admin-queries';
import { appRoutes } from '@/app/router/paths';
import { useAdminOutletContext } from '@/pages/admin/layout';

export function AdminContentPage() {
  const { session } = useAdminOutletContext();
  const query = useAdminDashboardQuery(session, { page: 1 });
  const metrics = query.data?.metrics;
  const entries = [
    { label: 'Discover 帖子', value: metrics?.totalDiscoverPosts ?? 0, to: appRoutes.adminDiscover },
    { label: 'Discover 评分', value: metrics?.totalDiscoverRatings ?? 0, to: appRoutes.adminDiscover },
    { label: '公告', value: query.data?.announcements.length ?? 0, to: appRoutes.adminAnnouncements },
  ];

  return <div className="space-y-4"><header><p className="text-xs font-medium tracking-[0.08em] text-muted">内容洞察</p><h1 className="mt-1 text-[1.8rem] font-semibold tracking-[-0.045em] text-ink">内容</h1><p className="mt-1 text-sm text-muted">当前有效内容与互动数据。</p></header><section className="grid gap-3 sm:grid-cols-3">{entries.map((entry) => <Link key={entry.label} to={entry.to} className="rounded-[1.4rem] border border-black/[0.06] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-sm text-muted">{entry.label}</p><p className="mt-3 text-3xl font-semibold tracking-[-0.04em] tabular-nums">{entry.value.toLocaleString()}</p><p className="mt-5 text-xs font-medium text-[#007aff]">查看管理</p></Link>)}</section><section className="rounded-[1.4rem] border border-black/[0.06] bg-white p-5"><h2 className="font-semibold">Treehole</h2><p className="mt-1 text-sm text-muted">帖子、评论与点赞趋势从分析接入日起累计。</p><Link className="mt-4 inline-block text-sm font-medium text-[#007aff]" to={appRoutes.adminTreehole}>查看内容</Link></section></div>;
}
