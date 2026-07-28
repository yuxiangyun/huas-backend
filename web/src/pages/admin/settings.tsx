/**
 * [INPUT]: 依赖 UGC 合规与课表来源策略的独立查询/变更、后台会话、Query cache 与 Toast
 * [OUTPUT]: 提供 AdminSettingsPage，组合课表数据源热切换与 Discover/Treehole 内容合规设置
 * [POS]: pages/admin/system 的通用设置页，并行启动两类查询并保持局部错误隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '@/app/state/toast-store';
import {
  useAdminComplianceQuery,
  useAdminScheduleSourcePolicyQuery,
  useUpdateAdminComplianceMutation,
} from '@/entities/admin/api/admin-queries';
import { adminQueryKeys } from '@/entities/admin/model/admin-query-keys';
import type { AdminComplianceStatus } from '@/entities/admin/model/admin-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ScheduleSourcePolicySettings } from '@/pages/admin/schedule-source-policy-settings';
import { Button } from '@/shared/ui/button';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
}

function ContentComplianceSettings({
  session,
  status,
}: {
  session: AdminSession;
  status: AdminComplianceStatus;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.pushToast);
  const mutation = useUpdateAdminComplianceMutation(session);
  const [mode, setMode] = useState(status.mode);
  const [discoverText, setDiscoverText] = useState(status.discoverMockText);
  const [treeholeText, setTreeholeText] = useState(status.treeholeMockText);

  async function save() {
    try {
      const updated = await mutation.mutateAsync({
        mode,
        discoverMockText: discoverText,
        treeholeMockText: treeholeText,
      });
      queryClient.setQueryData(adminQueryKeys.compliance(), updated);
      pushToast({
        title: '内容合规设置已保存',
        variant: 'success',
      });
    } catch (error) {
      pushToast({
        title: '内容合规设置保存失败',
        message: getErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    }
  }

  return (
    <section className="space-y-5 rounded-[1.4rem] border border-black/[0.06] bg-white p-5" aria-busy={mutation.isPending}>
      <div>
        <h2 className="text-base font-semibold text-ink">内容合规</h2>
        <p className="mt-1 text-sm leading-6 text-muted">控制 Discover 和 Treehole 的读取结果，写入操作不受影响。</p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/[0.045] p-1" role="group" aria-label="内容合规模式">
        {(['normal', 'compliance'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            disabled={mutation.isPending}
            onClick={() => setMode(value)}
            className={`rounded-[0.65rem] px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007aff]/35 ${mode === value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:bg-white/60'}`}
          >
            {value === 'normal' ? '正常模式' : '合规模式'}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="text-sm font-medium">Discover 文本</span>
        <textarea
          className="mt-2 min-h-28 w-full resize-y rounded-xl border border-black/[0.08] p-3 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/20"
          maxLength={400}
          value={discoverText}
          disabled={mutation.isPending}
          onChange={(event) => setDiscoverText(event.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Treehole 文本</span>
        <textarea
          className="mt-2 min-h-28 w-full resize-y rounded-xl border border-black/[0.08] p-3 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/20"
          maxLength={400}
          value={treeholeText}
          disabled={mutation.isPending}
          onChange={(event) => setTreeholeText(event.target.value)}
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs leading-5 text-muted">
          最后更新：{formatUpdatedAt(status.updatedAt)} · {status.updatedBy}
        </p>
        <Button type="button" disabled={mutation.isPending} onClick={() => void save()}>
          {mutation.isPending ? '保存中…' : '保存'}
        </Button>
      </div>

      {mutation.isError ? (
        <p className="rounded-xl bg-[#fff1f0] px-3 py-2.5 text-sm leading-6 text-[#a12b25]" role="alert">
          保存失败：{getErrorMessage(mutation.error, '请稍后重试')}
        </p>
      ) : null}
    </section>
  );
}

export function AdminSettingsPage() {
  const { session } = useAdminOutletContext();
  const complianceQuery = useAdminComplianceQuery(session);
  const schedulePolicyQuery = useAdminScheduleSourcePolicyQuery(session);

  return (
    <div className="max-w-4xl space-y-4">
      <header>
        <p className="text-xs font-medium tracking-[0.08em] text-muted">系统</p>
        <h1 className="mt-1 text-[1.8rem] font-semibold tracking-[-0.045em] text-ink">设置</h1>
        <p className="mt-1 text-sm leading-6 text-muted">管理课表数据源顺序和 UGC 读取的合规行为。</p>
      </header>

      <ScheduleSourcePolicySettings session={session} policyQuery={schedulePolicyQuery} />

      {complianceQuery.isLoading && !complianceQuery.data ? (
        <section className="space-y-4 rounded-[1.4rem] border border-black/[0.06] bg-white p-5" aria-label="正在加载内容合规设置">
          <div className="h-7 w-28 animate-pulse rounded-lg bg-black/[0.05]" />
          <div className="h-10 animate-pulse rounded-xl bg-black/[0.05]" />
          <div className="h-28 animate-pulse rounded-xl bg-black/[0.035]" />
          <div className="h-28 animate-pulse rounded-xl bg-black/[0.035]" />
        </section>
      ) : complianceQuery.data ? (
        <>
          <ContentComplianceSettings
            key={`${complianceQuery.data.updatedAt}-${complianceQuery.data.updatedBy}`}
            session={session}
            status={complianceQuery.data}
          />
          {complianceQuery.isError ? (
            <div className="flex flex-col gap-2 rounded-xl bg-[#fff8e8] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-[#805d16]">合规设置刷新失败，当前显示上一次成功加载的数据。</p>
              <Button
                size="xs"
                type="button"
                variant="subtle"
                disabled={complianceQuery.isFetching}
                onClick={() => void complianceQuery.refetch()}
              >
                {complianceQuery.isFetching ? '重试中…' : '重试'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <section className="rounded-[1.4rem] border border-black/[0.06] bg-white p-5" role="alert">
          <h2 className="text-base font-semibold text-ink">内容合规</h2>
          <p className="mt-2 text-sm leading-6 text-[#a12b25]">
            加载失败：{getErrorMessage(complianceQuery.error, '请稍后重试')}
          </p>
          <Button
            className="mt-3"
            size="sm"
            type="button"
            variant="subtle"
            disabled={complianceQuery.isFetching}
            onClick={() => void complianceQuery.refetch()}
          >
            {complianceQuery.isFetching ? '重试中…' : '重试'}
          </Button>
        </section>
      )}
    </div>
  );
}
