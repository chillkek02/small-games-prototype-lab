const { spawnSync } = require('node:child_process');

const isWindows = process.platform === 'win32';
const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npx';
const args = isWindows
  ? ['/d', '/s', '/c', 'npx playwright install chromium']
  : ['playwright', 'install', 'chromium'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: '0'
  }
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
