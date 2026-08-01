/**
 * [INPUT]: 依赖构造注入的活跃/排队上限与请求 AbortSignal
 * [OUTPUT]: 对外提供 TreeholeUploadGate，在 multipart 解析前限制占用大内存的发帖请求并发
 * [POS]: modules/treehole/http 的有界入口门禁，只保护请求体解析与压缩阶段，不承载业务事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export type TreeholeUploadLease = () => void;

interface WaitingUpload {
  resolve(lease: TreeholeUploadLease | null): void;
  signal?: AbortSignal;
  abort?: () => void;
}

export class TreeholeUploadGate {
  private active = 0;
  private readonly waiting: WaitingUpload[] = [];

  constructor(
    private readonly maxActive: number,
    private readonly maxQueued: number,
  ) {
    if (!Number.isSafeInteger(maxActive) || maxActive <= 0) {
      throw new RangeError('Treehole upload maxActive must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new RangeError('Treehole upload maxQueued must be a non-negative safe integer');
    }
  }

  acquire(signal?: AbortSignal): Promise<TreeholeUploadLease | null> {
    if (signal?.aborted) return Promise.resolve(null);
    if (this.active < this.maxActive) {
      this.active += 1;
      return Promise.resolve(this.createLease());
    }
    if (this.waiting.length >= this.maxQueued) return Promise.resolve(null);

    return new Promise((resolve) => {
      const waiting: WaitingUpload = { resolve, signal };
      if (signal) {
        waiting.abort = () => {
          const index = this.waiting.indexOf(waiting);
          if (index >= 0) this.waiting.splice(index, 1);
          resolve(null);
        };
        signal.addEventListener('abort', waiting.abort, { once: true });
      }
      this.waiting.push(waiting);
    });
  }

  private createLease(): TreeholeUploadLease {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.releaseNext();
    };
  }

  private releaseNext(): void {
    while (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      if (next.abort) next.signal?.removeEventListener('abort', next.abort);
      if (next.signal?.aborted) {
        next.resolve(null);
        continue;
      }
      next.resolve(this.createLease());
      return;
    }
    this.active -= 1;
  }
}
