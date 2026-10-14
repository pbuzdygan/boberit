import { useEffect, useState } from 'react';
import { localDateKey } from '../format';
import type { ToastTone, UiNotification } from '../types';

const historyKey = 'boberit-ui-notifications';
const todayReadKey = 'boberit-today-notifications-read';

/**
 * The toast message, its history in the notifications menu, and the day on which today's
 * reminders were last read. History and read day are kept in browser storage when available.
 * Errors stay visible longer than confirmations, so there is time to read them.
 */
export function useNotifications() {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
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

  function setMessage(next: string | null, tone: ToastTone = 'info') {
    setToast(next ? { message: next, tone } : null);
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

  function showError(next: string) {
    setMessage(next, 'error');
  }

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setMessage(null), toast.tone === 'error' ? 6_000 : 3_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function markTodayRead() {
    const today = localDateKey();
    setTodayReadOn(today);
    try {
      localStorage.setItem(todayReadKey, today);
    } catch {
      /* Browser storage is optional. */
    }
  }

  return { toast, setMessage, showError, notifications, todayReadOn, markTodayRead };
}
