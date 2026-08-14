self.addEventListener("push", (event) => {
  let payload = { title: "AI 연인", body: "새 메시지가 왔어요." };
  try {
    payload = event.data.json();
  } catch {
    // JSON이 아니면 기본값 사용
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon.png",
      tag: "ai-lover-reconnect",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
