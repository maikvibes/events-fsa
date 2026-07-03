/**
 * Generates frontend/public/firebase-messaging-sw.js from the template file,
 * substituting VITE_FIREBASE_* variables from frontend/.env.local (falling back to .env).
 *
 * Run via: node scripts/generate-sw.mjs
 * Hooked into `npm run dev` and `npm run build` inside frontend/package.json as prebuild/predev.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'frontend', 'public', 'firebase-messaging-sw.template.js');
const OUT = join(ROOT, 'frontend', 'public', 'firebase-messaging-sw.js');

function parseEnv(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=("?)([^]*?)\2\s*$/);
    if (m) vars[m[1].trim()] = m[3];
  }
  return vars;
}

const env = {
  ...parseEnv(join(ROOT, '.env')),
  ...parseEnv(join(ROOT, 'frontend', '.env')),
  ...parseEnv(join(ROOT, 'frontend', '.env.local')),
};

const VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID',
];

const missing = VARS.filter(k => !env[k]);
if (missing.length) {
  console.error(`generate-sw: missing env vars: ${missing.join(', ')}`);
  console.error('  Create frontend/.env.local from frontend/.env.example and fill in values.');
  process.exit(1);
}

let content = readFileSync(TEMPLATE, 'utf8');
for (const key of VARS) {
  content = content.replaceAll(`__${key}__`, env[key]);
}

writeFileSync(OUT, content, 'utf8');
console.log(`generate-sw: wrote ${OUT.replace(ROOT, '.')}`);
