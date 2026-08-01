/**
 * [INPUT]: 依赖已经业务鉴权与引用校验的私有媒体 Blob
 * [OUTPUT]: 对外提供 privateMediaResponse，统一返回不缓存、禁止 MIME 嗅探的私有 WebP 响应
 * [POS]: utils 的无状态 HTTP 安全响应边界，被 Treehole/Messaging 的用户与管理媒体路由共享
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export function privateMediaResponse(data: Blob): Response {
  return new Response(data, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
