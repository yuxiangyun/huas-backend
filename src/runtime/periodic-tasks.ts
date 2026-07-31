/**
 * [INPUT]: 依赖注入的周期任务、时钟定时器与失败观察器
 * [OUTPUT]: 对外提供 PeriodicTaskRegistry，统一注册、启动、停止并阻止同一任务重叠执行
 * [POS]: runtime 的轻量周期任务协调器，承载可重建的后台维护工作而不保存业务事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface PeriodicTaskDefinition {
  name: string;
  intervalMs: number;
  run(): void | Promise<void>;
}

export interface PeriodicTaskFailure {
  name: string;
  error: unknown;
}

interface TimerHandle {
  unref?: () => void;
}

export interface PeriodicTaskClock {
  setInterval(callback: () => void, intervalMs: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

const systemClock: PeriodicTaskClock = {
  setInterval(callback, intervalMs) {
    return setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

export class PeriodicTaskRegistry {
  private readonly tasks = new Map<string, PeriodicTaskDefinition>();
  private readonly timers = new Map<string, TimerHandle>();
  private readonly executions = new Map<string, Promise<void>>();
  private started = false;

  constructor(
    private readonly onFailure: (failure: PeriodicTaskFailure) => void = () => undefined,
    private readonly clock: PeriodicTaskClock = systemClock,
  ) {}

  register(task: PeriodicTaskDefinition): void {
    const name = task.name.trim();
    if (!name) throw new Error('Periodic task name must not be empty.');
    if (!Number.isFinite(task.intervalMs) || task.intervalMs <= 0) {
      throw new Error(`Periodic task interval must be positive: ${name}`);
    }
    if (this.tasks.has(name)) throw new Error(`Periodic task already registered: ${name}`);

    this.tasks.set(name, { ...task, name });
    if (this.started) this.schedule(name);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const name of this.tasks.keys()) this.schedule(name);
  }

  async stop(): Promise<void> {
    if (!this.started && this.timers.size === 0 && this.executions.size === 0) return;
    this.started = false;
    for (const timer of this.timers.values()) this.clock.clearInterval(timer);
    this.timers.clear();
    await Promise.allSettled([...this.executions.values()]);
  }

  async runNow(name: string): Promise<boolean> {
    const task = this.tasks.get(name);
    if (!task) throw new Error(`Periodic task is not registered: ${name}`);
    if (this.executions.has(name)) return false;

    const execution = Promise.resolve()
      .then(() => task.run())
      .catch((error) => {
        try {
          this.onFailure({ name, error });
        } catch {
          // 观察器不能反向破坏任务协调器。
        }
      })
      .finally(() => {
        this.executions.delete(name);
      });
    this.executions.set(name, execution);
    await execution;
    return true;
  }

  private schedule(name: string): void {
    if (this.timers.has(name)) return;
    const task = this.tasks.get(name);
    if (!task) return;
    const timer = this.clock.setInterval(() => {
      void this.runNow(name);
    }, task.intervalMs);
    timer.unref?.();
    this.timers.set(name, timer);
  }
}
