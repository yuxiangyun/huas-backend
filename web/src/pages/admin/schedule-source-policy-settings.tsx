/**
 * [INPUT]: 依赖课表来源策略查询/变更、后台会话、Query cache、ConfirmSheet 与全局 Toast
 * [OUTPUT]: 提供 ScheduleSourcePolicySettings，展示并热切换 移动教务/JW/Portal 课表优先策略
 * [POS]: pages/admin/settings 的单职运维区块，只保存待确认目标并以服务端快照更新界面
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useAdminScheduleSourcePolicyQuery,
  useUpdateAdminScheduleSourcePolicyMutation,
} from '@/entities/admin/api/admin-queries';
import type { AdminScheduleSourceMode } from '@/entities/admin/model/admin-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { Button } from '@/shared/ui/button';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';

const MODE_CONTENT: Record<AdminScheduleSourceMode, { label: string; path: string }> = {
  'mobile-jw-first': {
    label: '移动教务优先',
    path: '移动教务新数据 → 教务新数据 → Portal 新数据 → 移动教务旧缓存 → 教务旧缓存 → Portal 旧缓存',
  },
  'jw-first': {
    label: '教务优先',
    path: '教务新数据 → Portal 新数据 → 教务旧缓存 → Portal 旧缓存',
  },
  'portal-first': {
    label: 'Portal 优先',
    path: 'Portal 新数据 → 教务新数据 → 教务旧缓存 → Portal 旧缓存',
  },
};

const MODES = ['mobile-jw-first', 'jw-first', 'portal-first'] as const;

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ScheduleSourcePolicySettings({
  session,
  policyQuery,
}: {
  session: AdminSession;
  policyQuery: ReturnType<typeof useAdminScheduleSourcePolicyQuery>;
}) {
  const pushToast = useToastStore((state) => state.pushToast);
  const mutation = useUpdateAdminScheduleSourcePolicyMutation(session);
  const [pendingMode, setPendingMode] = useState<AdminScheduleSourceMode | null>(null);
  const policy = policyQuery.data;
  const pendingContent = pendingMode ? MODE_CONTENT[pendingMode] : null;

  function requestMode(mode: AdminScheduleSourceMode) {
    if (!policy || policy.mode === mode || mutation.isPending) return;
    mutation.reset();
    setPendingMode(mode);
  }

  async function confirmModeChange() {
    if (!policy || pendingMode === null || policy.mode === pendingMode) {
      setPendingMode(null);
      return;
    }

    const nextMode = pendingMode;
    try {
      const updated = await mutation.mutateAsync(nextMode);
      setPendingMode(null);
      pushToast({
        title: '课表数据源策略已切换',
        message: `当前为 ${MODE_CONTENT[updated.mode].label}`,
        variant: 'success',
      });
    } catch (error) {
      setPendingMode(null);
      pushToast({
        title: '课表数据源策略切换失败',
        message: getErrorMessage(error, '请稍后重试'),
        variant: 'error',
      });
    }
  }

  return (
    <section
      className="rounded-[0.75rem] border border-line bg-white p-5"
      aria-busy={policyQuery.isFetching || mutation.isPending}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">课表数据源</h2>
          <p className="mt-1 text-sm leading-6 text-muted">课表请求的数据源顺序。</p>
        </div>
        {policy ? (
          <p className="w-fit rounded-[0.5rem] bg-tint-soft px-3 py-1 text-xs font-medium text-ink" aria-live="polite">
            当前：{MODE_CONTENT[policy.mode].label}
          </p>
        ) : null}
      </div>

      {policyQuery.isLoading && !policy ? (
        <div className="mt-5 space-y-3" aria-label="正在加载课表数据源策略">
          <div className="h-10 animate-pulse rounded-xl bg-black/[0.05]" />
          <div className="h-20 animate-pulse rounded-xl bg-black/[0.035]" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-9 animate-pulse rounded-lg bg-black/[0.035]" />
            <div className="h-9 animate-pulse rounded-lg bg-black/[0.035]" />
          </div>
        </div>
      ) : policy ? (
        <div className="mt-5 space-y-4">
          <div>
            <p className="text-[0.72rem] font-medium tracking-[0.04em] text-muted">完整来源路径</p>
            <p className="mt-2 rounded-xl bg-black/[0.025] px-3 py-3 text-sm leading-6 text-ink">
              {MODE_CONTENT[policy.mode].path}
            </p>
          </div>

          <dl className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-black/[0.05] px-3 py-3">
              <dt className="text-xs text-muted">最后更新</dt>
              <dd className="mt-1 text-sm font-medium text-ink">{formatUpdatedAt(policy.updatedAt)}</dd>
            </div>
            <div className="rounded-xl border border-black/[0.05] px-3 py-3">
              <dt className="text-xs text-muted">操作人</dt>
              <dd className="mt-1 break-all text-sm font-medium text-ink">{policy.updatedBy}</dd>
            </div>
          </dl>

          <div>
            <p className="text-sm font-medium text-ink">切换运行策略</p>
            <div
              className="mt-2 grid gap-2 rounded-xl bg-black/[0.045] p-1 sm:grid-cols-3"
              role="group"
              aria-label="课表数据源优先策略"
            >
              {MODES.map((mode) => {
                const selected = policy.mode === mode;
                const switching = mutation.isPending && pendingMode === mode;
                return (
                  <button
                    key={mode}
                    className={`rounded-[0.5rem] px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/35 ${selected ? 'bg-white text-ink shadow-sm' : 'text-muted hover:bg-white/60'}`}
                    type="button"
                    aria-pressed={selected}
                    disabled={mutation.isPending || selected}
                    onClick={() => requestMode(mode)}
                  >
                    {switching ? '切换中…' : MODE_CONTENT[mode].label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="rounded-xl bg-[#f5f5f7] px-3 py-2.5 text-xs leading-5 text-muted">
            切换只影响随后开始的课表请求，不清理缓存；在途请求继续使用启动时的策略快照。
          </p>

          {mutation.isError ? (
            <p className="text-sm text-error" role="alert">切换失败，请重试</p>
          ) : null}

          {policyQuery.isError ? (
            <div className="flex flex-col gap-2 rounded-[0.625rem] bg-tint-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted">刷新失败，当前显示上次数据。</p>
              <Button
                size="xs"
                type="button"
                variant="subtle"
                disabled={policyQuery.isFetching}
                onClick={() => void policyQuery.refetch()}
              >
                {policyQuery.isFetching ? '重试中…' : '重试'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-[0.625rem] bg-error-soft px-4 py-4" role="alert">
          <p className="text-sm text-error">加载失败，请重试</p>
          <Button
            className="mt-3"
            size="sm"
            type="button"
            variant="subtle"
            disabled={policyQuery.isFetching}
            onClick={() => void policyQuery.refetch()}
          >
            {policyQuery.isFetching ? '重试中…' : '重试'}
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={pendingMode !== null}
        busy={mutation.isPending}
        title={pendingContent ? `确认切换为“${pendingContent.label}”？` : '确认切换课表数据源策略？'}
        description={policy && pendingContent
          ? `将从“${MODE_CONTENT[policy.mode].label}”切换为“${pendingContent.label}”。这只影响随后开始的课表请求，不清理缓存；在途请求继续使用原策略快照。`
          : undefined}
        confirmLabel={pendingContent ? `切换至${pendingContent.label}` : '确认切换'}
        onClose={() => {
          if (!mutation.isPending) setPendingMode(null);
        }}
        onConfirm={() => void confirmModeChange()}
      />
    </section>
  );
}
