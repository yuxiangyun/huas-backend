/**
 * [INPUT]: 依赖 Vite 运行时环境变量中的可选 API 基地址
 * [OUTPUT]: 对外提供文理社区应用名、`/m` basename、API 基址与应用路径构造函数
 * [POS]: shared/config 的运行时配置源，隔离部署前缀与页面路由语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export const APP_NAME = '文理社区';
export const APP_BASENAME = '/m';
export const API_BASE_URL = rawApiBaseUrl.endsWith('/')
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl;

export function buildAppPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? `${APP_BASENAME}/` : `${APP_BASENAME}${normalized}`;
}
