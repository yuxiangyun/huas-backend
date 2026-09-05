/**
 * [INPUT]: 依赖调用方提供的资源键、异步读取与提交操作
 * [OUTPUT]: 对外提供 OrderedCommit，允许并发读取并按开始代次保护同键提交
 * [POS]: utils 的进程内并发协调器，较新成功提交阻止旧结果覆盖，失败读取不取消旧结果，空闲后释放状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export class OrderedCommit {
  private readonly keys = new Map<string, {
    sequence: number;
    committed: number;
    active: number;
    tail: Promise<void>;
  }>();

  async run<T>(key: string, read: () => Promise<T>, commit: (value: T) => Promise<void>): Promise<T> {
    let state = this.keys.get(key);
    if (!state) {
      state = { sequence: 0, committed: 0, active: 0, tail: Promise.resolve() };
      this.keys.set(key, state);
    }
    const current = state;
    const sequence = ++current.sequence;
    current.active += 1;
    try {
      const value = await read();
      const write = current.tail.then(async () => {
        if (sequence <= current.committed) return;
        await commit(value);
        current.committed = sequence;
      });
      current.tail = write.catch(() => {});
      await write;
      return value;
    } finally {
      current.active -= 1;
      if (current.active === 0) this.keys.delete(key);
    }
  }
}
