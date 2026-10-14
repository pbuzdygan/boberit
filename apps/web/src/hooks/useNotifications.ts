import { useEffect, useState } from 'react';
import { localDateKey } from '../format';
import type { UiNotification } from '../types';

const historyKey = 'boberit-ui-notifications';
const todayReadKey = 'boberit-today-notifications-read';

/**
 * The toast message, its history in the notifications menu, and the day on which today's
 * reminders were last read. History and read day are kept in browser storage when available.
 */
export function useNotifications() {
  const [message, setMessageValue] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<UiNotification[]>(() => {
    try {
      const stored = localStorage.getItem(historyKey);
      return stored ? (JSON.parse(stored) as UiNotification[]) : [];
    } catch {
      return [];
    }
  });
  const [todayReadOn, setTodayReadOn] = useState(() => {
    try {
      return localStorage.getItem(todayReadKey) ?? '';
    } catch {
      return '';
    }
  });

  function setMessage(next: string | null) {
    setMessageValue(next);
    if (!next) return;
    setNotifications((current) =>
      [
        { id: String(Date.now()) + '-' + String(Math.random()), message: next, createdAt: Date.now() },
        ...current,
      ].slice(0, 50),
    );
  }

  useEffect(() => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(notifications));
    } catch {
      /* Browser storage is optional. */
    }
  }, [notifications]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 3_000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  function markTodayRead() {
    const today = localDateKey();
    setTodayReadOn(today);
    try {
      localStorage.setItem(todayReadKey, today);
    } catch {
      /* Browser storage is optional. */
    }
  }

  return { message, setMessage, notifications, todayReadOn, markTodayRead };
}
