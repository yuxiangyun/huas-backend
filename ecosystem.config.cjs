module.exports = {
  apps: [{
    name: 'huas-server',
    script: 'src/index.ts',
    interpreter: 'bun',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    // Log config
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
