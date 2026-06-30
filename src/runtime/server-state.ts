/**
 * [INPUT]: 依赖进程环境变量 DEPLOY_SLOT 与优雅停机信号
 * [OUTPUT]: 对外提供 serverState 单例，记录 ready/shuttingDown/shutdownSignal/deploySlot
 * [POS]: runtime 的进程态源，被入口和健康检查路由消费，不承载业务事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

let isReady = false;
let isShuttingDown = false;
let shutdownSignal: string | null = null;

export const serverState = {
  markReady() {
    isReady = true;
    isShuttingDown = false;
    shutdownSignal = null;
  },

  beginShutdown(signal: string) {
    isReady = false;
    isShuttingDown = true;
    shutdownSignal = signal;
  },

  status() {
    return {
      ready: isReady,
      shuttingDown: isShuttingDown,
      shutdownSignal,
      deploySlot: process.env.DEPLOY_SLOT || 'legacy',
    };
  },
};
