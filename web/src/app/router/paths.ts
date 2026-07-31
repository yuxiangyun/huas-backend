/**
 * [INPUT]: 依赖 Web 与后台的稳定信息架构与设置页 canonical 路径
 * [OUTPUT]: 提供 appRoutes 全局路径常量，供路由、导航与重定向共享
 * [POS]: app/router 的路径命名源，防止页面和导航各自硬编码 URL
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
  adminSettings: '/admin/system/settings',
  adminLogs: '/admin/system/logs',
} as const;
