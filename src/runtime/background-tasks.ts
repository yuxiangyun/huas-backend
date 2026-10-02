/**
 * [INPUT]: 接收调用方拥有的完整后台工作 Promise，不接收等待者的限时包装
 * [OUTPUT]: 对外提供保留原结果的 trackBackgroundTask 与等待实际任务全部结束的 drainBackgroundTasks
 * [POS]: runtime 的进程内任务收尾登记器，不取消任务、不保存业务事实、不拒绝原任务的提交尾部
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

const tasks = new Set<Promise<unknown>>();

export function trackBackgroundTask<T>(task: Promise<T>): Promise<T> {
  tasks.add(task);
  const release = () => { tasks.delete(task); };
  // 两个结局均消费清理链，返回的仍是调用方原 Promise 与原成功/失败。
  void task.then(release, release);
  return task;
}

export async function drainBackgroundTasks(): Promise<void> {
  // 任务收尾可能登记下一个完整工作，不能只等待最初的一次快照。
  while (tasks.size > 0) {
    await Promise.allSettled([...tasks]);
  }
}
