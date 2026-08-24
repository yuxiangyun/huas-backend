/**
 * [INPUT]: 依赖课表来源、首页弹窗与 Early Rising 的独立查询、后台会话及对应设置区块
 * [OUTPUT]: 提供 AdminSettingsPage，承载首页展示、早起打卡个人资料入口与课表数据源热切换
 * [POS]: pages/admin/system 的设置页，并发启动互不依赖的两类展示配置和 Academic 运行策略查询
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  useAdminEarlyRisingSettingsQuery,
  useAdminIndexPopupSettingsQuery,
  useAdminScheduleSourcePolicyQuery,
} from '@/entities/admin/api/admin-queries';
import { IndexPopupSettings } from '@/pages/admin/index-popup-settings';
import { EarlyRisingSettings } from '@/pages/admin/early-rising-settings';
import { useAdminOutletContext } from '@/pages/admin/layout';
import { ScheduleSourcePolicySettings } from '@/pages/admin/schedule-source-policy-settings';

export function AdminSettingsPage() {
  const { session } = useAdminOutletContext();
  const indexPopupQuery = useAdminIndexPopupSettingsQuery(session);
  const earlyRisingQuery = useAdminEarlyRisingSettingsQuery(session);
  const schedulePolicyQuery = useAdminScheduleSourcePolicyQuery(session);

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-[-0.025em]">设置</h1>
      <IndexPopupSettings session={session} settingsQuery={indexPopupQuery} />
      <EarlyRisingSettings session={session} settingsQuery={earlyRisingQuery} />
      <ScheduleSourcePolicySettings session={session} policyQuery={schedulePolicyQuery} />
    </div>
  );
}
