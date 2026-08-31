'use client';

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_PATH, SYSTEM_UPDATES_NAMESPACE, socketNamespaceUrl } from '../lib/realtime';

export function useSystemUpdateSocket<T>({ runId, after, onState, onReconnect }: { runId: string | null; after: number; onState: (state: T) => void; onReconnect: () => void }) {
  const stateRef = useRef(onState);
  const reconnectRef = useRef(onReconnect);
  const afterRef = useRef(after);
  stateRef.current = onState;
  reconnectRef.current = onReconnect;
  afterRef.current = after;
  useEffect(() => {
    if (!runId) return;
    const socket = io(socketNamespaceUrl(SYSTEM_UPDATES_NAMESPACE), { path: SOCKET_PATH, withCredentials: true, autoConnect: true });
    const subscribe = () => socket.emit('system:update:subscribe', { runId, after: afterRef.current });
    socket.on('connect', subscribe);
    socket.io.on('reconnect_attempt', () => reconnectRef.current());
    socket.on('system:update:state', (state: T) => stateRef.current(state));
    return () => { socket.off('connect', subscribe); socket.disconnect(); };
  }, [runId]);
}
