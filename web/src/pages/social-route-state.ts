/**
 * [INPUT]: 依赖 Social 页面可变 URLSearchParams 与目标帖子 ID
 * [OUTPUT]: 对外提供 selectSocialPost 与 selectMessageTarget，原子维护详情/资料互斥及私信单一目标
 * [POS]: pages 的共享路由状态规则，统一 Social 弹层互斥与 userId 唯一聊天深链不变量
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export function selectSocialPost(params: URLSearchParams, postId: number) {
  params.set('postId', String(postId));
  params.delete('profileUserId');
}

export function selectMessageTarget(params: URLSearchParams, userId: number) {
  params.set('userId', String(userId));
  params.delete('conversationId');
}
