/**
 * [INPUT]: 依赖 Early Rising 后台设置查询/变更、后台会话、Query cache、Toast 与基础按钮
 * [OUTPUT]: 提供 EarlyRisingSettings，控制小程序排行榜顶部个人资料入口及编辑面板是否显示
 * [POS]: pages/admin/settings 的单职展示开关区块，以服务端快照为事实源并保留明确保存动作
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import {
  useAdminEarlyRisingSettingsQuery,
  useUpdateAdminEarlyRisingSettingsMutation,
} from '@/entities/admin/api/admin-queries';
import type { AdminEarlyRisingSettings as AdminEarlyRisingSettingsModel } from '@/entities/admin/model/admin-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { Button } from '@/shared/ui/button';

function formatUpdatedAt(value: string | null) {
  if (!value) return '尚未修改';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function EarlyRisingSettingsForm({
  session,
  settings,
}: {
  session: AdminSession;
  settings: AdminEarlyRisingSettingsModel;
}) {
  const pushToast = useToastStore((state) => state.pushToast);
  const mutation = useUpdateAdminEarlyRisingSettingsMutation(session);
  const [profileEntryVisible, setProfileEntryVisible] = useState(settings.profileEntryVisible);
  const changed = profileEntryVisible !== settings.profileEntryVisible;

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.reset();
    try {
      await mutation.mutateAsync({ profileEntryVisible });
      pushToast({
        title: '早起打卡设置已保存',
        message: profileEntryVisible ? '个人资料入口已显示' : '个人资料入口已隐藏',
        variant: 'success',
      });
    } catch {
      // mutation.error 在当前区块内呈现。
    }
  }

  return (
    <form className="mt-5 space-y-4" onSubmit={(event) => void saveSettings(event)}>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.06] px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink">显示个人资料入口</span>
          <span className="mt-1 block text-xs leading-5 text-muted">
            控制小程序“早起打卡 → 排行榜”顶部的“编辑资料”入口和编辑面板。
          </span>
        </span>
        <input
          checked={profileEntryVisible}
          className="size-4 accent-black"
          disabled={mutation.isPending}
          type="checkbox"
          onChange={(event) => setProfileEntryVisible(event.currentTarget.checked)}
        />
      </label>

      <dl className="grid gap-2.5 sm:grid-cols-2">
        <div className="rounded-xl border border-black/[0.05] px-3 py-3">
          <dt className="text-xs text-muted">最后更新</dt>
          <dd className="mt-1 text-sm font-medium text-ink">{formatUpdatedAt(settings.updatedAt)}</dd>
        </div>
        <div className="rounded-xl border border-black/[0.05] px-3 py-3">
          <dt className="text-xs text-muted">操作人</dt>
          <dd className="mt-1 break-all text-sm font-medium text-ink">{settings.updatedBy ?? '-'}</dd>
        </div>
      </dl>

      {mutation.isError ? <p className="text-sm text-error" role="alert">保存失败，请重试</p> : null}

      <div className="flex justify-end">
        <Button disabled={mutation.isPending || !changed} size="sm" type="submit">
          {mutation.isPending ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </form>
  );
}

export function EarlyRisingSettings({
  session,
  settingsQuery,
}: {
  session: AdminSession;
  settingsQuery: ReturnType<typeof useAdminEarlyRisingSettingsQuery>;
}) {
  const settings = settingsQuery.data;

  return (
    <section className="rounded-[0.75rem] border border-line bg-white p-5" aria-busy={settingsQuery.isFetching}>
      <div>
        <h2 className="text-base font-semibold text-ink">早起打卡</h2>
        <p className="mt-1 text-sm leading-6 text-muted">控制排行榜中的个人资料编辑能力是否对小程序用户显示。</p>
      </div>

      {settingsQuery.isLoading && !settings ? (
        <div className="mt-5 space-y-3" aria-label="正在加载早起打卡设置">
          <div className="h-16 animate-pulse rounded-xl bg-black/[0.05]" />
          <div className="h-16 animate-pulse rounded-xl bg-black/[0.035]" />
        </div>
      ) : settings ? (
        <>
          <EarlyRisingSettingsForm
            key={`${settings.updatedAt}|${settings.profileEntryVisible}`}
            session={session}
            settings={settings}
          />
          {settingsQuery.isError ? (
            <div className="mt-4 flex flex-col gap-2 rounded-[0.625rem] bg-tint-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted">刷新失败，当前显示上次数据。</p>
              <Button
                size="xs"
                type="button"
                variant="subtle"
                disabled={settingsQuery.isFetching}
                onClick={() => void settingsQuery.refetch()}
              >
                {settingsQuery.isFetching ? '重试中…' : '重试'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-[0.625rem] bg-error-soft px-4 py-4" role="alert">
          <p className="text-sm text-error">加载失败，请重试</p>
          <Button
            className="mt-3"
            size="sm"
            type="button"
            variant="subtle"
            disabled={settingsQuery.isFetching}
            onClick={() => void settingsQuery.refetch()}
          >
            {settingsQuery.isFetching ? '重试中…' : '重试'}
          </Button>
        </div>
      )}
    </section>
  );
}
