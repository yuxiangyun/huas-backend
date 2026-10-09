/**
 * [INPUT]: 依赖 Web 与后台的稳定信息架构，以及独立运营、课表策略与运行观测路径
 * [OUTPUT]: 提供 appRoutes 全局路径常量，供路由、导航与重定向共享
 * [POS]: app/router 的路径命名源，防止页面和导航各自硬编码 URL
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const appRoutes = {
  root: '/',
  login: '/login',
  discover: '/discover',
  treehole: '/treehole',
  messages: '/messages',
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
  adminMessaging: '/admin/manage/messaging',
  adminSettings: '/admin/system/settings',
  adminIndexPopup: '/admin/operations/index-popup',
  adminSchedulePolicy: '/admin/system/schedule',
  adminLogs: '/admin/system/logs',
  adminEarlyRising: '/admin/operations/early-rising',
  adminRuntime: '/admin/system/runtime',
} as const;
