const fs = require('fs');
const path = require('path');

// Manually parse .env to guarantee PM2 injects it into the environment
let envConfig = {};
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    // Ignore comments and empty lines
    if (!line || line.trim().startsWith('#')) return;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      envConfig[match[1].trim()] = match[2].trim();
    }
  });
} catch (e) {
  console.log('No .env file found or error reading it', e);
}

module.exports = {
  apps: [
    {
      name: 'medisafe-api',
      script: './dist/index.mjs',
      node_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/home/ubuntu/logs/medisafe-api-error.log',
      out_file:   '/home/ubuntu/logs/medisafe-api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env_production: {
        NODE_ENV: 'production',
        PORT: '8080',
        ...envConfig
      },
    },
  ],
};
