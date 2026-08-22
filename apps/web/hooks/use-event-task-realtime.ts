'use client';

import { useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  EVENT_TASKS_NAMESPACE,
  SOCKET_PATH,
  socketNamespaceUrl,
} from '../lib/realtime';

export type EventTaskChangedPayload = {
  eventId: string;
  communityId: string;
  reason: 'created' | 'updated' | 'moved' | 'reordered' | 'archived' | 'member-status-updated' | 'comment-added' | 'comment-archived' | 'attachment-added' | 'attachment-archived' | 'checklist-added' | 'checklist-updated' | 'checklist-toggled' | 'checklist-archived' | 'checklist-reordered';
  taskId?: string;
  changedAt: string;
};

export function useEventTaskRealtime(eventId: string, onChanged: (payload: EventTaskChangedPayload) => void) {
  const onChangedRef = useRef(onChanged);
  const socketUrl = useMemo(() => socketNamespaceUrl(EVENT_TASKS_NAMESPACE), []);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!eventId) return;
    const socket = io(socketUrl, {
      path: SOCKET_PATH,
      withCredentials: true,
      autoConnect: true,
    });
    let joined = false;

    function joinRoom() {
      if (!socket.connected || joined) return;
      socket.emit('event.tasks.join', { eventId });
    }

    function handleJoined(payload?: { eventId?: string }) {
      if (payload?.eventId === eventId) joined = true;
    }

    function handleDisconnect() {
      joined = false;
    }

    function handleChanged(payload: EventTaskChangedPayload) {
      if (payload?.eventId === eventId) onChangedRef.current(payload);
    }

    socket.on('connect', joinRoom);
    socket.on('disconnect', handleDisconnect);
    socket.on('event.tasks.joined', handleJoined);
    socket.on('event.tasks.changed', handleChanged);
    if (socket.connected) joinRoom();

    return () => {
      if (socket.connected) socket.emit('event.tasks.leave', { eventId });
      socket.off('connect', joinRoom);
      socket.off('disconnect', handleDisconnect);
      socket.off('event.tasks.joined', handleJoined);
      socket.off('event.tasks.changed', handleChanged);
      socket.disconnect();
    };
  }, [eventId, socketUrl]);
}
