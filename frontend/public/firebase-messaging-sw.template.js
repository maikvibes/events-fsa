/* global importScripts, firebase */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '__VITE_FIREBASE_API_KEY__',
  authDomain: '__VITE_FIREBASE_AUTH_DOMAIN__',
  projectId: '__VITE_FIREBASE_PROJECT_ID__',
  storageBucket: '__VITE_FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__VITE_FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__VITE_FIREBASE_APP_ID__',
  measurementId: '__VITE_FIREBASE_MEASUREMENT_ID__',
});

const messaging = firebase.messaging();

// Explicit background handler so notifications reliably reach the OS tray
// (Windows action center / Android / iOS-PWA) regardless of payload shape,
// mirroring the webpush payload proven by scripts/send-direct.mjs.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || payload.data || {};
  const title = n.title || 'Notification';
  self.registration.showNotification(title, {
    body: n.body || '',
    icon: '/favicon.ico',
    data: { url: (payload.fcmOptions && payload.fcmOptions.link) || '/notifications' },
  });
});

// Focus or open the app when the user clicks the tray notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
