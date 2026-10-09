/**
 * [INPUT]: 依赖历史设置页 section 参数及独立业务路径
 * [OUTPUT]: 将旧首页弹窗、早起和课表设置链接替换为各自业务入口
 * [POS]: pages/admin 的旧 URL 兼容层，不再聚合无关配置或启动重复查询
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Navigate, useSearchParams } from 'react-router-dom';
import { appRoutes } from '@/app/router/paths';

export function AdminSettingsPage() {
  const [params] = useSearchParams();
  const section = params.get('section');
  const target = section === 'schedule' ? appRoutes.adminSchedulePolicy
    : section === 'early-rising' ? appRoutes.adminEarlyRising
    : appRoutes.adminIndexPopup;
  return <Navigate replace to={target} />;
}
