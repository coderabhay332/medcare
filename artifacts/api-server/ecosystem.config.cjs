// PM2 Ecosystem Config — MediSafe API Server
// Uses CommonJS (.cjs) because the project is type:module

module.exports = {
  apps: [
    {
      name: 'medisafe-api',

      // Entry point — the compiled ESM bundle
      script: './dist/index.mjs',

      // Interpreter args passed to node
      node_args: '--enable-source-maps --env-file=.env',

      // Number of instances:
      //   1 = single process (safe default for MongoDB connection pooling)
      //   'max' = one per CPU core (use cluster mode, set exec_mode below)
      instances: 1,
      exec_mode: 'fork',   // change to 'cluster' if instances > 1

      // Auto-restart on crash
      autorestart: true,
      watch: false,        // never watch files in production
      max_memory_restart: '512M',

      // Log files on the EC2 instance
      error_file: '/home/ubuntu/logs/medisafe-api-error.log',
      out_file:   '/home/ubuntu/logs/medisafe-api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // ── Environment variables ────────────────────────────────────────────
      // These are the PRODUCTION values — set via EC2 server or override here.
      // For secrets, prefer setting them on the server with:
      //   pm2 set medisafe-api:ANTHROPIC_API_KEY sk-ant-...
      // or via a .env on the server (see setup script).
      env_production: {
        NODE_ENV:          'production',
        PORT:              '8080',
      },
    },
  ],
};
