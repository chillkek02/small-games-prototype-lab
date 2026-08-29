const { spawnSync } = require('node:child_process');

const cli = require.resolve('playwright/cli');
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: '0'
  }
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
