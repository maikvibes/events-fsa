// k6 launcher used by the `npm run k6:*` scripts.
//
// Why this exists: k6 does not read .env files, but it does inherit the OS
// environment. The npm scripts invoke this file with
// `node --env-file-if-exists=.env --env-file-if-exists=.env.local`, which loads
// those files into process.env; we then spawn k6 inheriting that environment.
// This lets local secrets (ADMIN_EMAIL / ADMIN_PASSWORD) live in the gitignored
// .env.local instead of the tracked k6/helpers.js.
//
// Usage: node scripts/run-k6.mjs <k6-script> [<k6-script> ...]
// Runs each script sequentially and stops on the first non-zero exit.
import { spawnSync } from 'node:child_process';

const scripts = process.argv.slice(2);
if (scripts.length === 0) {
  console.error('usage: node scripts/run-k6.mjs <k6-script> [<k6-script> ...]');
  process.exit(1);
}

for (const script of scripts) {
  const { status, error } = spawnSync('k6', ['run', script], {
    stdio: 'inherit',
    env: process.env,
  });
  if (error) {
    console.error(
      `Failed to launch k6 (is it installed and on PATH?): ${error.message}`,
    );
    process.exit(1);
  }
  if (status !== 0) process.exit(status ?? 1);
}
