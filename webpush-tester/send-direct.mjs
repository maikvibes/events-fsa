import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const token = argv[2];
const title = argv[3] || '🔔 Direct FCM test';
const body = argv[4] || 'If you see this, web push works end-to-end!';

if (!token) {
  console.error('ERROR: provide the FCM device token.\n' +
    '  node webpush-tester/send-direct.mjs <DEVICE_TOKEN> ["title"] ["body"]');
  exit(1);
}

const raw = readFileSync('.env', 'utf8');
function getVar(name) {
  const m = raw.match(new RegExp(`^${name}=("?)([\\s\\S]*?)\\1\\s*$`, 'm'));
  return m ? m[2] : undefined;
}

const projectId = getVar('FIREBASE_PROJECT_ID');
const clientEmail = getVar('FIREBASE_CLIENT_EMAIL');
const privateKey = getVar('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('ERROR: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY missing from .env');
  exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

console.log(`Project: ${projectId}`);
console.log(`Token:   …${token.slice(-12)}`);
console.log(`Sending: "${title}" / "${body}"\n`);

try {
  const messageId = await getMessaging().send({
    token,
    notification: { title, body },
    data: { source: 'send-direct', ts: String(Date.now()) },
    android: { priority: 'high', notification: { title, body } },
    webpush: {
      notification: { title, body, icon: '/favicon.ico' },
      fcmOptions: {},
    },
  });
  console.log('✓ Sent. FCM message id:', messageId);
  console.log('  Watch for the notification (PC: Windows action center / Chrome; phone: tray).');
  exit(0);
} catch (err) {
  console.error('✗ FCM send failed:', err?.errorInfo?.code || err?.code || err?.message || err);
  console.error('  Common causes: token expired (re-fetch on the page), or token from a different Firebase project.');
  exit(1);
}
