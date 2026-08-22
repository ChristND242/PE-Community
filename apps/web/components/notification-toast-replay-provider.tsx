'use client';

import { createContext, useContext, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  createNotificationToastReplayState,
  type NotificationToastReplayState,
} from '../lib/notification-toast-replay';

const NotificationToastReplayContext =
  createContext<MutableRefObject<NotificationToastReplayState> | null>(null);

export function NotificationToastReplayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const replayStateRef = useRef(createNotificationToastReplayState());

  return (
    <NotificationToastReplayContext.Provider value={replayStateRef}>
      {children}
    </NotificationToastReplayContext.Provider>
  );
}

export function useNotificationToastReplayState() {
  const replayStateRef = useContext(NotificationToastReplayContext);
  if (!replayStateRef) {
    throw new Error('NotificationToastReplayProvider is required.');
  }
  return replayStateRef;
}
