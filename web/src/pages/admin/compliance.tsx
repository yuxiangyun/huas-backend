/**
 * [INPUT]: 依赖 UGC 合规查询/更新、后台会话上下文与 QueryClient
 * [OUTPUT]: 提供 AdminCompliancePage 正常/合规模式和分域纯文本配置
 * [POS]: pages/admin/system 的高风险运行策略页面，与内容管理分离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminComplianceQuery, useUpdateAdminComplianceMutation } from '@/entities/admin/api/admin-queries';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { Button } from '@/shared/ui/button';

export function AdminCompliancePage() {
  const { session } = useAdminOutletContext();
  const queryClient = useQueryClient();
  const query = useAdminComplianceQuery(session);
  const mutation = useUpdateAdminComplianceMutation(session);
  const [mode, setMode] = useState<'normal' | 'compliance'>('normal');
  const [discoverText, setDiscoverText] = useState('');
  const [treeholeText, setTreeholeText] = useState('');

  useEffect(() => {
    if (!query.data) return;
    setMode(query.data.mode);
    setDiscoverText(query.data.discoverMockText);
    setTreeholeText(query.data.treeholeMockText);
  }, [query.data]);

  async function save() {
    await mutation.mutateAsync({ mode, discoverMockText: discoverText, treeholeMockText: treeholeText });
    await queryClient.invalidateQueries({ queryKey: adminQueryKeys.compliance() });
  }

  return <div className="max-w-3xl space-y-4"><header><p className="text-xs font-medium tracking-[0.08em] text-muted">系统</p><h1 className="mt-1 text-[1.8rem] font-semibold tracking-[-0.045em] text-ink">合规设置</h1><p className="mt-1 text-sm text-muted">控制 UGC 读取结果。写入操作不受影响。</p></header><section className="space-y-5 rounded-[1.4rem] border border-black/[0.06] bg-white p-5"><div className="grid grid-cols-2 gap-2 rounded-xl bg-black/[0.045] p-1">{(['normal', 'compliance'] as const).map((value) => <button key={value} type="button" onClick={() => setMode(value)} className={`rounded-[0.65rem] px-3 py-2 text-sm font-medium ${mode === value ? 'bg-white shadow-sm' : 'text-muted'}`}>{value === 'normal' ? '正常模式' : '合规模式'}</button>)}</div><label className="block"><span className="text-sm font-medium">Discover 文本</span><textarea className="mt-2 min-h-28 w-full resize-y rounded-xl border border-black/[0.08] p-3 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/20" maxLength={400} value={discoverText} onChange={(event) => setDiscoverText(event.target.value)} /></label><label className="block"><span className="text-sm font-medium">Treehole 文本</span><textarea className="mt-2 min-h-28 w-full resize-y rounded-xl border border-black/[0.08] p-3 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/20" maxLength={400} value={treeholeText} onChange={(event) => setTreeholeText(event.target.value)} /></label><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted">最后更新：{query.data?.updatedAt ?? '-'}</p><Button type="button" disabled={mutation.isPending} onClick={() => void save()}>{mutation.isPending ? '保存中…' : '保存'}</Button></div>{mutation.isError ? <p className="text-sm text-[#a12b25]">保存失败。</p> : null}</section></div>;
}
