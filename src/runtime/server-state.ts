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
