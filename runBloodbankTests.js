const { startTdrServer, stopTdrServer } = require('./src/tdrServer');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const inputArg = process.argv[2] || '01';
const testDir = path.resolve(__dirname, 'bloodbank-tests', 'test');

// Map FR number (e.g. "1", "01", "fr01", "2", "02") to test file
function resolveTestFile(arg) {
  let numStr = arg.replace(/[^0-9]/g, '');
  if (numStr) {
    const padded = numStr.padStart(2, '0');
    const files = fs.readdirSync(testDir);
    const matched = files.find(f => f.startsWith(`fr${padded}`));
    if (matched) {
      return `test/${matched}`;
    }
  }

  // If already a path or glob
  if (arg.includes('test/') || arg.endsWith('.js') || arg.includes('*')) {
    return arg;
  }

  return `test/fr${arg.padStart(2, '0')}*.test.js`;
}

const targetFile = resolveTestFile(inputArg);

async function main() {
  console.log('Starting TDR Test Server on port 3000...');
  await startTdrServer(3000);
  console.log(`TDR Server ready. Running tests for: ${targetFile}\n`);

  const testProcess = spawn(
    'node',
    ['--test', '--test-concurrency=1', targetFile],
    {
      cwd: path.resolve(__dirname, 'bloodbank-tests'),
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, BASE_URL: 'http://localhost:3000' }
    }
  );

  testProcess.on('close', async (code) => {
    console.log(`\nTests finished with exit code: ${code}`);
    await stopTdrServer();
    process.exit(code);
  });
}

main().catch(async (err) => {
  console.error('Test runner failure:', err);
  await stopTdrServer();
  process.exit(1);
});
