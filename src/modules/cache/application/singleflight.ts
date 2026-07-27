/**
 * [INPUT]: 依赖业务缓存 key、刷新意图、调用方提供的异步操作与可选合并观察器
 * [OUTPUT]: 对外提供 PerKeySingleflight，同联合键共享在途结果且成功失败后均释放
 * [POS]: cache/application 的并发协调原语，不感知 SQLite、上游协议或业务 DTO
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export type RefreshIntent = 'normal' | 'refresh';

export class PerKeySingleflight {
  private readonly flights = new Map<string, Promise<unknown>>();

  constructor(private readonly onMerge: () => void = () => {}) {}

  run<T>(businessKey: string, intent: RefreshIntent, operation: () => Promise<T>): Promise<T> {
    const flightKey = JSON.stringify([businessKey, intent]);
    const existing = this.flights.get(flightKey);
    if (existing) {
      try {
        this.onMerge();
      } catch {
        // 可观测性是旁路，不能改变共享业务 Promise。
      }
      return existing as Promise<T>;
    }

    let flight: Promise<T>;
    flight = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (this.flights.get(flightKey) === flight) this.flights.delete(flightKey);
      });
    this.flights.set(flightKey, flight);
    return flight;
  }
}
