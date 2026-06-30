/* global importScripts, firebase */
// Service worker required by FCM web push. Must live at the origin root so its
// scope covers the page. Kept minimal: it initializes messaging so Chrome
// auto-displays `notification` payloads while the page is backgrounded.

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBM1lvq73MR0EH95LaP1MTh1pouUZ9UCo8',
  authDomain: 'test-836e1.firebaseapp.com',
  projectId: 'test-836e1',
  storageBucket: 'test-836e1.firebasestorage.app',
  messagingSenderId: '916952965378',
  appId: '1:916952965378:web:f28bd80ed4471fbf58621b',
  measurementId: 'G-9BL3BSZ5T5',
});

// Initializing messaging in the SW is enough for background notifications.
// We intentionally do NOT define onBackgroundMessage with showNotification —
// the backend sends a `notification` payload that Chrome displays automatically,
// and adding a handler here would double-show it.
firebase.messaging();
