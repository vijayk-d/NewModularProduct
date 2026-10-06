import { spawn } from 'node:child_process';
import process from 'node:process';

const child = spawn(
  process.execPath,
  [
    '--test',
    '--test-reporter=tap',
    '--test-reporter-destination=stdout',
    'tests/**/*.test.js'
  ],
  {
    shell: false,
    stdio: ['inherit', 'pipe', 'inherit']
  }
);

let output = '';

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});

child.on('close', (code) => {
  if (code !== 0) {
    console.log(output);
    console.error(`\n✖ Node test suite failed (exit code ${code}).`);
    process.exit(code);
  }

    const summary = output
    .split('\n')
    .filter((line) =>
        /^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+\d+/.test(line)
    )
    .join('\n');
    console.log(summary || 'ℹ Node test summary unavailable.');
    console.log('\n✔ All Node tests passed.');
});