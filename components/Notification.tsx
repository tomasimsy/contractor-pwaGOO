"use client";

import { useEffect, useState } from "react";

export function useBrowserNotification() {
  const [permission, setPermission] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission === 'granted');
    }
  }, []);

  const requestPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((perm) => {
        setPermission(perm === 'granted');
      });
    }
  };

  const sendNotification = (title: string, options?: NotificationOptions) => {
    if (permission && 'Notification' in window) {
      new Notification(title, options);
    }
  };

  return { sendNotification, requestPermission, permission };
}