/**
 * [INPUT]: 依赖本模块相邻类型、API 与应用基础设施
 * [OUTPUT]: 提供 paths.ts 的公开前端契约与运行能力
 * [POS]: web 应用分层中的现有业务边界，被页面或上层模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const appRoutes = {
  root: '/',
  login: '/login',
  discover: '/discover',
  treehole: '/treehole',
  me: '/me',
  meDiscover: '/me/discover',
  meTreehole: '/me/treehole',
  adminRoot: '/admin',
  adminDashboard: '/admin/dashboard',
  adminUsers: '/admin/users',
  adminContent: '/admin/content',
  adminAnnouncements: '/admin/manage/announcements',
  adminDiscover: '/admin/manage/discover',
  adminTreehole: '/admin/manage/treehole',
  adminCompliance: '/admin/system/compliance',
  adminLogs: '/admin/system/logs',
} as const;
