/**
 * [INPUT]: 依赖课表来源策略查询/变更、后台会话与设置区块
 * [OUTPUT]: 提供 AdminSettingsPage，承载课表数据源热切换
 * [POS]: pages/admin/system 的设置页，只组合仍有管理入口的 Academic 运行策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { useAdminScheduleSourcePolicyQuery } from '@/entities/admin/api/admin-queries';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ScheduleSourcePolicySettings } from '@/pages/admin/schedule-source-policy-settings';

export function AdminSettingsPage() {
  const { session } = useAdminOutletContext();
  const schedulePolicyQuery = useAdminScheduleSourcePolicyQuery(session);

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.025em]">设置</h1>
      <ScheduleSourcePolicySettings session={session} policyQuery={schedulePolicyQuery} />
    </div>
  );
}
