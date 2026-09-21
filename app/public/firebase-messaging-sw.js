// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.4.0/firebase-messaging-compat.js');

// 알림 클릭 시 이동 경로가 없을 때의 기본값 (랜딩 `/`가 아닌 앱 진입점)
const DEFAULT_NOTIFICATION_URL = '/app';

/**
 * 알림에 실린 데이터에서 이동할 절대 URL 추출
 * FCM SDK가 띄운 알림은 `data.FCM_MSG.data`, 직접 띄운 알림은 `data`에 페이로드 데이터가 위치
 * @param {Notification} notification 클릭된 알림
 * @returns {string} 같은 origin으로 한정한 이동 URL
 */
const getNotificationUrl = (notification) => {
  const data = notification.data || {};
  const payloadData = (data.FCM_MSG && data.FCM_MSG.data) || data;
  const url = new URL(payloadData.url || DEFAULT_NOTIFICATION_URL, self.location.origin);
  // 외부 origin 이동 차단
  return url.origin === self.location.origin
    ? url.href
    : new URL(DEFAULT_NOTIFICATION_URL, self.location.origin).href;
};

/**
 * 열려 있는 앱 창이 있으면 포커스 후 이동, 없으면 새 창 열기
 * @param {string} url 이동할 절대 URL
 */
const openAppWindow = async (url) => {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const sameOriginClients = windowClients.filter(
    (client) => new URL(client.url).origin === self.location.origin
  );
  const exactClient = sameOriginClients.find((client) => client.url === url);
  if (exactClient) {
    return exactClient.focus();
  }
  const appClient = sameOriginClients.find((client) =>
    new URL(client.url).pathname.startsWith(DEFAULT_NOTIFICATION_URL)
  ) || sameOriginClients[0];
  if (appClient) {
    const focused = await appClient.focus();
    return 'navigate' in focused ? focused.navigate(url) : focused;
  }
  return self.clients.openWindow(url);
};

// 알림 클릭 처리
// FCM SDK의 클릭 리스너는 링크(`fcmOptions.link`)가 없으면 이벤트 전파만 막고 아무 동작도 하지 않으므로,
// SDK 초기화(`firebase.messaging()`)보다 먼저 등록해 SDK 리스너보다 앞서 처리
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil(openAppWindow(getNotificationUrl(event.notification)));
});

// Firebase 설정
const firebaseConfig = {
  apiKey: "your_api_key",
  authDomain: "your_project.firebaseapp.com",
  projectId: "your_project_id",
  storageBucket: "your_project.appspot.com",
  messagingSenderId: "your_sender_id",
  appId: "your_app_id"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// 백그라운드 메시지 처리
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message ', payload);

  // `notification` 페이로드가 있으면 SDK가 이미 알림을 표시하므로 중복 표시 생략
  if (payload.notification) {
    return;
  }

  const notificationTitle = (payload.data && payload.data.title) || 'CodeRecall';
  const notificationOptions = {
    body: payload.data && payload.data.body,
    icon: '/android-chrome-192x192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
