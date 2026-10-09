/**
 * [INPUT]: 依赖课表来源策略查询/变更、后台会话与 HeroUI 选择器、提示及管理确认弹层
 * [OUTPUT]: 提供课表来源顺序选择、保存确认和服务端快照回写，失败保留目标选择
 * [POS]: pages/admin/system 的独立课表策略页面，不清缓存或主动调用学校服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Button } from '@heroui/react/button';
import { Form } from '@heroui/react/form';
import { Label } from '@heroui/react/label';
import { Radio } from '@heroui/react/radio';
import { RadioGroup } from '@heroui/react/radio-group';
import { Tooltip } from '@heroui/react/tooltip';
import { useEffect, useRef, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import { useAdminScheduleSourcePolicyQuery, useUpdateAdminScheduleSourcePolicyMutation } from '@/entities/admin/api/admin-queries';
import type { AdminScheduleSourceMode, AdminScheduleSourcePolicy } from '@/entities/admin/model/admin-types';
import type { AdminSession } from '@/features/admin-treehole/model/admin-session';
import { isNewerSnapshot, operationError } from '@/pages/admin/operations-fields';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { AdminConfirm, AdminPage, AdminState } from '@/shared/ui/admin';

const MODE_OPTIONS = [
  { value: 'mobile-jw-first', label: '移动教务 → JW → Portal' },
  { value: 'jw-first', label: 'JW → Portal' },
  { value: 'portal-first', label: 'Portal → JW' },
] as const;
const STALE_ORDER: Record<AdminScheduleSourceMode, string> = {
  'mobile-jw-first': '移动教务 → JW → Portal',
  'jw-first': 'JW → Portal',
  'portal-first': 'JW → Portal',
};

function SchedulePolicyForm({ session, policy }: { session: AdminSession; policy: AdminScheduleSourcePolicy }) {
  const mutation = useUpdateAdminScheduleSourcePolicyMutation(session);
  const pushToast = useToastStore((state) => state.pushToast);
  const [snapshot, setSnapshot] = useState(policy);
  const [mode, setMode] = useState(policy.mode);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const writeLock = useRef(false);
  const dirty = mode !== snapshot.mode;

  useEffect(() => {
    if (!dirty && !mutation.isPending && isNewerSnapshot(policy.updatedAt, snapshot.updatedAt)) {
      setSnapshot(policy);
      setMode(policy.mode);
    }
  }, [policy, dirty, mutation.isPending, snapshot.updatedAt]);

  async function save() {
    if (writeLock.current || !dirty) return;
    writeLock.current = true;
    setError(null);
    try {
      const updated = await mutation.mutateAsync(mode);
      setSnapshot(updated);
      setMode(updated.mode);
      setConfirmOpen(false);
      pushToast({ title: '已保存', variant: 'success' });
    } catch (failure) {
      setError(operationError(failure));
    } finally {
      writeLock.current = false;
    }
  }

  return (
    <>
      <Form className="space-y-6" aria-busy={mutation.isPending} onSubmit={(event) => { event.preventDefault(); if (dirty && !writeLock.current) { setError(null); setConfirmOpen(true); } }}>
        <div className="flex flex-wrap items-start gap-3">
          <RadioGroup className="min-w-0 flex-1 gap-4" aria-label="课表来源顺序" value={mode} isDisabled={mutation.isPending} onChange={(value) => { const option = MODE_OPTIONS.find((item) => item.value === value); if (option) setMode(option.value); }}>
            {MODE_OPTIONS.map((option) => <Radio key={option.value} value={option.value}><Radio.Content><Radio.Control><Radio.Indicator /></Radio.Control><Label>{option.label}</Label></Radio.Content></Radio>)}
          </RadioGroup>
          <Tooltip>
            <Tooltip.Trigger>
              <Button aria-label="查看课表来源规则" size="sm" variant="ghost">规则</Button>
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-xs">
              依次读取所选来源，均失败后按 {STALE_ORDER[mode]} 尝试旧缓存。后续请求生效，不清理缓存。
            </Tooltip.Content>
          </Tooltip>
        </div>
        <Button type="submit" isDisabled={!dirty || mutation.isPending}>保存</Button>
      </Form>
      <AdminConfirm isOpen={confirmOpen} title="切换课表来源？" busy={mutation.isPending} confirmLabel="切换" confirmVariant="primary" onOpenChange={(open) => { if (!writeLock.current) setConfirmOpen(open); }} onConfirm={() => { void save(); }}>
        <p>{MODE_OPTIONS.find((option) => option.value === mode)?.label}</p>
        {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      </AdminConfirm>
    </>
  );
}

export function ScheduleSourcePolicySettings({ session, policyQuery }: {
  session: AdminSession;
  policyQuery: ReturnType<typeof useAdminScheduleSourcePolicyQuery>;
}) {
  return (
    <div className="max-w-lg">
      <AdminState loading={policyQuery.isLoading} error={policyQuery.error} onRetry={() => { void policyQuery.refetch(); }} />
      {policyQuery.data ? <SchedulePolicyForm session={session} policy={policyQuery.data} /> : null}
    </div>
  );
}

export function AdminSchedulePolicyPage() {
  const { session } = useAdminOutletContext();
  const query = useAdminScheduleSourcePolicyQuery(session);
  return <AdminPage title="课表策略"><ScheduleSourcePolicySettings session={session} policyQuery={query} /></AdminPage>;
}
