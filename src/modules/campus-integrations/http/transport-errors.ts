/**
 * [INPUT]: 依赖 Bun/Node Error 的 name/message/code/errno/syscall 与有界 cause 链
 * [OUTPUT]: 对外提供 errorFacts 与 isTransientTransportError，分类瞬态网络错误而不公开原始诊断
 * [POS]: 校园 HTTP 的无业务传输判定，被基础凭证恢复与 mobile-yxt/mobile-jw 用于独立错误映射、失败计数隔离及有限重试
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export function errorFacts(error: unknown): string {
  const facts: string[] = [];
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const record = current as Record<string, unknown>;
    for (const key of ['name', 'message', 'code', 'errno', 'syscall']) {
      const value = record[key];
      if (typeof value === 'string' || typeof value === 'number') facts.push(String(value));
    }
    current = record.cause;
  }

  return facts.join(' ');
}


export function isTransientTransportError(error: unknown): boolean {
  const facts = errorFacts(error);
  return /\bREQUEST_TIMEOUT\b/.test(facts) || (
    /ECONN(?:RESET|REFUSED|ABORTED)|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|EPIPE|UND_ERR_/i.test(facts)
    || /Connection(?:Refused|Reset|TimedOut|Closed)|Socket(?:Closed|NotConnected)|fetch(?:\(\))? failed/i.test(facts)
    || /unable to connect|network|socket|connection (?:closed|refused|reset|timed? ?out)|\b(?:TLS|SSL|certificate|DNS)\b/i.test(facts)
  );
}
