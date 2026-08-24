'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  CHAT_NAMESPACE,
  SOCKET_PATH,
  socketNamespaceUrl,
} from '../lib/realtime';

export type ChatRealtimeStatus = 'connected' | 'reconnecting' | 'offline';
export type ChatJoinStatus = 'idle' | 'joining' | 'joined' | 'error';

export type ChatRealtimeMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  encryptedPayload?: string;
  encryptionNonce?: string;
  encryptionAlgorithmVersion: string;
  encryptionKeyVersion?: string | null;
  senderKeyVersionId?: string | null;
  recipientKeyVersionId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deliveredAt?: string | null;
  deletedForEveryoneAt?: string | null;
  deletedById?: string | null;
  reactions?: ChatReactionSummary[];
};

export type ChatReactionSummary = {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
  userIds?: string[];
};

export type ChatReactionUpdate = {
  conversationId: string;
  messageId: string;
  reactions: ChatReactionSummary[];
};

export type ChatEncryptedSendPayload = {
  encryptedPayload: string;
  encryptionNonce: string;
  encryptionAlgorithmVersion: string;
  encryptionKeyVersion?: string | null;
  senderKeyVersionId?: string | null;
  recipientKeyVersionId?: string | null;
};

export type ChatTypingUpdate = {
  conversationId: string;
  userId: string;
  isTyping: boolean;
};

export type ChatPresenceUpdate = {
  conversationId?: string;
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
};

export type ChatSeenUpdate = {
  conversationId: string;
  userId: string;
  seenAt: string;
  messageId?: string | null;
};

export type ChatDeliveredUpdate = {
  conversationId: string;
  messageId: string;
  deliveredAt: string;
};

type ChatErrorPayload = {
  code?: string;
  message?: string;
  conversationId?: string;
};

type ChatJoinedPayload = {
  conversationId?: string;
};

type ChatEditAck = {
  message?: ChatRealtimeMessage;
  error?: string;
};

export type ChatSendResult =
  | { ok: true; message: ChatRealtimeMessage }
  | { ok: false; error: string };

type ChatSendAck = {
  message?: ChatRealtimeMessage;
  error?: string;
};

type ChatReactionAck = {
  reaction?: ChatReactionUpdate;
  error?: string;
};

export function useChatSocket({
  conversationId,
  currentUserId,
  enabled,
  onMessage,
  onMessageDeleted,
  onMessageEdited,
  onMessageReaction,
  onConversationActivity,
}: {
  conversationId?: string;
  currentUserId?: string;
  enabled?: boolean;
  onMessage: (message: ChatRealtimeMessage) => void;
  onMessageDeleted?: (message: ChatRealtimeMessage) => void;
  onMessageEdited?: (message: ChatRealtimeMessage) => void;
  onMessageReaction?: (update: ChatReactionUpdate) => void;
  onConversationActivity?: (conversationId: string) => void;
}) {
  const socketRef = useRef<Socket | null>(null);
  const joinedConversationRef = useRef<string | null>(null);
  const requestedConversationRef = useRef<string | undefined>(conversationId);
  const currentUserIdRef = useRef<string | undefined>(currentUserId);
  const onMessageRef = useRef(onMessage);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  const onMessageEditedRef = useRef(onMessageEdited);
  const onMessageReactionRef = useRef(onMessageReaction);
  const onConversationActivityRef = useRef(onConversationActivity);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [status, setStatus] = useState<ChatRealtimeStatus>('offline');
  const [joinStatus, setJoinStatus] = useState<ChatJoinStatus>('idle');
  const [joinedConversationId, setJoinedConversationId] = useState<string | null>(null);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [typingUpdates, setTypingUpdates] = useState<ChatTypingUpdate[]>([]);
  const [presenceUpdates, setPresenceUpdates] = useState<ChatPresenceUpdate[]>([]);
  const [seenUpdates, setSeenUpdates] = useState<ChatSeenUpdate[]>([]);
  const [deliveredUpdates, setDeliveredUpdates] = useState<ChatDeliveredUpdate[]>([]);
  const [lastError, setLastError] = useState('');
  const socketUrl = useMemo(() => socketNamespaceUrl(CHAT_NAMESPACE), []);

  useEffect(() => {
    requestedConversationRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onMessageDeletedRef.current = onMessageDeleted;
  }, [onMessageDeleted]);

  useEffect(() => {
    onMessageEditedRef.current = onMessageEdited;
  }, [onMessageEdited]);

  useEffect(() => {
    onMessageReactionRef.current = onMessageReaction;
  }, [onMessageReaction]);

  useEffect(() => {
    onConversationActivityRef.current = onConversationActivity;
  }, [onConversationActivity]);

  const clearTypingTimer = useCallback((conversationIdValue: string, userIdValue: string) => {
    const key = typingKey(conversationIdValue, userIdValue);
    const timer = typingTimersRef.current.get(key);
    if (!timer) return;
    clearTimeout(timer);
    typingTimersRef.current.delete(key);
  }, []);

  const clearTypingForConversation = useCallback((conversationIdValue: string) => {
    typingTimersRef.current.forEach((timer, key) => {
      if (!key.startsWith(`${conversationIdValue}:`)) return;
      clearTimeout(timer);
      typingTimersRef.current.delete(key);
    });
    setTypingUpdates((current) => current.filter((item) => item.conversationId !== conversationIdValue));
  }, []);

  const leaveConversation = useCallback((conversationIdValue: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('chat:conversation:leave', { conversationId: conversationIdValue });
    joinedConversationRef.current = null;
    setJoinedConversationId(null);
    setJoinStatus(requestedConversationRef.current ? 'joining' : 'idle');
    clearTypingForConversation(conversationIdValue);
  }, [clearTypingForConversation]);

  const joinConversation = useCallback((nextConversationId = requestedConversationRef.current) => {
    const socket = socketRef.current;
    if (!socket || !nextConversationId) {
      setJoinStatus(nextConversationId ? 'joining' : 'idle');
      return false;
    }
    if (!socket.connected) {
      setJoinStatus('joining');
      return false;
    }
    const previousConversationId = joinedConversationRef.current;
    if (previousConversationId && previousConversationId !== nextConversationId) {
      socket.emit('chat:conversation:leave', { conversationId: previousConversationId });
      clearTypingForConversation(previousConversationId);
    }
    setLastError('');
    setJoinStatus('joining');
    socket.emit('chat:conversation:join', { conversationId: nextConversationId });
    return true;
  }, [clearTypingForConversation]);

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      setJoinStatus('idle');
      setJoinedConversationId(null);
      setTypingUpdates([]);
      return;
    }
    const socket = io(socketUrl, {
      path: SOCKET_PATH,
      withCredentials: true,
      autoConnect: true,
    });
    socketRef.current = socket;

    function handleConnect() {
      setStatus('connected');
      setConnectionRevision((current) => current + 1);
      joinConversation();
    }
    function handleDisconnect() {
      setStatus('offline');
      setJoinStatus(requestedConversationRef.current ? 'joining' : 'idle');
      joinedConversationRef.current = null;
      setJoinedConversationId(null);
    }
    function handleConnectError() {
      setStatus('offline');
    }
    function handleReconnectAttempt() {
      setStatus('reconnecting');
    }
    function handleMessage(message: ChatRealtimeMessage) {
      if (message.conversationId === joinedConversationRef.current) {
        onMessageRef.current(message);
        if (!currentUserIdRef.current || message.senderId !== currentUserIdRef.current) socket.emit('chat:message:delivered', { conversationId: message.conversationId, messageId: message.id });
        return;
      }
      onConversationActivityRef.current?.(message.conversationId);
    }
    function handleDeletedMessage(message: ChatRealtimeMessage) {
      if (message.conversationId === joinedConversationRef.current) {
        onMessageDeletedRef.current?.(message);
        return;
      }
      onConversationActivityRef.current?.(message.conversationId);
    }
    function handleEditedMessage(message: ChatRealtimeMessage) {
      if (message.conversationId === joinedConversationRef.current) {
        onMessageEditedRef.current?.(message);
        return;
      }
      onConversationActivityRef.current?.(message.conversationId);
    }
    function handleReaction(update: ChatReactionUpdate) {
      if (update.conversationId === joinedConversationRef.current) {
        onMessageReactionRef.current?.(update);
        return;
      }
      onConversationActivityRef.current?.(update.conversationId);
    }
    function handleJoined(payload: ChatJoinedPayload) {
      const joinedId = typeof payload.conversationId === 'string' ? payload.conversationId : requestedConversationRef.current;
      if (!joinedId) return;
      if (joinedId !== requestedConversationRef.current) return;
      joinedConversationRef.current = joinedId;
      setJoinedConversationId(joinedId);
      setJoinStatus('joined');
      setLastError('');
    }
    function handleTyping(update: ChatTypingUpdate) {
      if (update.userId === currentUserIdRef.current) return;
      if (update.conversationId !== requestedConversationRef.current && update.conversationId !== joinedConversationRef.current) return;
      clearTypingTimer(update.conversationId, update.userId);
      setTypingUpdates((current) => {
        const filtered = current.filter((item) => !(item.conversationId === update.conversationId && item.userId === update.userId));
        return update.isTyping ? [...filtered, update] : filtered;
      });
      if (update.isTyping) {
        const key = typingKey(update.conversationId, update.userId);
        const timer = setTimeout(() => {
          typingTimersRef.current.delete(key);
          setTypingUpdates((current) => current.filter((item) => !(item.conversationId === update.conversationId && item.userId === update.userId)));
        }, 3500);
        typingTimersRef.current.set(key, timer);
      }
    }
    function handlePresence(update: ChatPresenceUpdate) {
      setPresenceUpdates((current) => {
        const previous = current.find((item) => item.conversationId === update.conversationId && item.userId === update.userId);
        const filtered = current.filter((item) => !(item.conversationId === update.conversationId && item.userId === update.userId));
        return [...filtered, { ...update, lastSeenAt: update.lastSeenAt ?? previous?.lastSeenAt ?? null }];
      });
    }
    function handleSeen(update: ChatSeenUpdate) {
      setSeenUpdates((current) => {
        const filtered = current.filter((item) => !(item.conversationId === update.conversationId && item.userId === update.userId));
        return [...filtered, update];
      });
    }
    function handleDelivered(update: ChatDeliveredUpdate) {
      setDeliveredUpdates((current) => {
        const filtered = current.filter((item) => item.messageId !== update.messageId);
        return [...filtered, update];
      });
    }
    function handleError(payload?: ChatErrorPayload) {
      setLastError(payload?.code ?? 'chat-error');
      if (payload?.conversationId && payload.conversationId === requestedConversationRef.current) {
        setJoinStatus('error');
        setJoinedConversationId(null);
        joinedConversationRef.current = null;
      }
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('chat:conversation:joined', handleJoined);
    socket.on('chat:message:new', handleMessage);
    socket.on('chat:message:deleted', handleDeletedMessage);
    socket.on('chat:message:edited', handleEditedMessage);
    socket.on('chat:message:reaction', handleReaction);
    socket.on('chat:typing:update', handleTyping);
    socket.on('presence:update', handlePresence);
    socket.on('chat:message:seen', handleSeen);
    socket.on('chat:message:delivered', handleDelivered);
    socket.on('chat:error', handleError);

    return () => {
      if (joinedConversationRef.current) socket.emit('chat:conversation:leave', { conversationId: joinedConversationRef.current });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('chat:conversation:joined', handleJoined);
      socket.off('chat:message:new', handleMessage);
      socket.off('chat:message:deleted', handleDeletedMessage);
      socket.off('chat:message:edited', handleEditedMessage);
      socket.off('chat:message:reaction', handleReaction);
      socket.off('chat:typing:update', handleTyping);
      socket.off('presence:update', handlePresence);
      socket.off('chat:message:seen', handleSeen);
      socket.off('chat:message:delivered', handleDelivered);
      socket.off('chat:error', handleError);
      socket.disconnect();
      socketRef.current = null;
      joinedConversationRef.current = null;
      setJoinedConversationId(null);
    };
  }, [clearTypingForConversation, clearTypingTimer, enabled, joinConversation, socketUrl]);

  useEffect(() => {
    requestedConversationRef.current = conversationId;
    const previousConversationId = joinedConversationRef.current;
    if (previousConversationId && previousConversationId !== conversationId) {
      leaveConversation(previousConversationId);
    }
    if (!conversationId) {
      setJoinStatus('idle');
      setJoinedConversationId(null);
      return;
    }
    if (previousConversationId === conversationId) {
      setJoinStatus('joined');
      setJoinedConversationId(conversationId);
      return;
    }
    joinConversation(conversationId);
  }, [conversationId, joinConversation, leaveConversation]);

  const markSeen = useCallback((messageId?: string) => {
    const socket = socketRef.current;
    const activeConversationId = joinedConversationRef.current;
    if (!socket || !activeConversationId) return;
    socket.emit('chat:message:seen', { conversationId: activeConversationId, messageId });
  }, []);

  const sendTypingStart = useCallback(() => {
    const socket = socketRef.current;
    const activeConversationId = joinedConversationRef.current;
    if (!socket || !activeConversationId || !socket.connected) return;
    socket.emit('chat:typing:start', { conversationId: activeConversationId });
  }, []);

  const sendTypingStop = useCallback(() => {
    const socket = socketRef.current;
    const activeConversationId = joinedConversationRef.current;
    if (!socket || !activeConversationId || !socket.connected) return;
    socket.emit('chat:typing:stop', { conversationId: activeConversationId });
  }, []);

  const sendEncryptedMessage = useCallback((payload: ChatEncryptedSendPayload) => {
    const socket = socketRef.current;
    const activeConversationId = joinedConversationRef.current;
    if (!socket || !activeConversationId || !socket.connected) return Promise.resolve<ChatSendResult>({ ok: false, error: 'socket_unavailable' });
    setLastError('');
    return new Promise<ChatSendResult>((resolve) => {
      socket.timeout(8000).emit('chat:message:send', { conversationId: activeConversationId, ...payload }, (error: Error | null, response?: ChatSendAck) => {
        if (error) {
          setLastError('message_send_timeout');
          resolve({ ok: false, error: 'message_send_timeout' });
          return;
        }
        if (response?.error || !response?.message) {
          const code = response?.error ?? 'message_rejected';
          setLastError(code);
          resolve({ ok: false, error: code });
          return;
        }
        resolve({ ok: true, message: response.message });
      });
    });
  }, []);

  const deleteMessageForEveryone = useCallback((messageId: string) => {
    const socket = socketRef.current;
    const activeConversationId = joinedConversationRef.current;
    if (!socket || !activeConversationId || !socket.connected) return false;
    setLastError('');
    socket.emit('chat:message:delete-for-everyone', { conversationId: activeConversationId, messageId });
    return true;
  }, []);

  const editMessage = useCallback((messageId: string, payload: ChatEncryptedSendPayload) => {
    const socket = socketRef.current;
    const activeConversationId = joinedConversationRef.current;
    if (!socket || !activeConversationId || !socket.connected) return Promise.resolve(null);
    setLastError('');
    return new Promise<ChatRealtimeMessage | null>((resolve) => {
      socket.timeout(8000).emit('chat:message:edit', { conversationId: activeConversationId, messageId, ...payload }, (error: Error | null, response?: ChatEditAck) => {
        if (error || response?.error || !response?.message) {
          setLastError(response?.error ?? 'message_edit_rejected');
          resolve(null);
          return;
        }
        resolve(response.message);
      });
    });
  }, []);

  const setMessageReaction = useCallback((messageId: string, emoji: string | null) => {
    const socket = socketRef.current;
    const activeConversationId = joinedConversationRef.current;
    if (!socket || !activeConversationId || !socket.connected) return Promise.resolve(null);
    setLastError('');
    return new Promise<ChatReactionUpdate | null>((resolve) => {
      socket.timeout(8000).emit('chat:message:reaction', { conversationId: activeConversationId, messageId, emoji }, (error: Error | null, response?: ChatReactionAck) => {
        if (error || response?.error || !response?.reaction) {
          setLastError(response?.error ?? 'message_reaction_rejected');
          resolve(null);
          return;
        }
        resolve(response.reaction);
      });
    });
  }, []);

  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.connected) return;
    socket.connect();
  }, []);

  useEffect(() => {
    return () => {
      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
    };
  }, []);

  return {
    status,
    joinStatus,
    joinedConversationId,
    connectionRevision,
    typingUpdates,
    presenceUpdates,
    seenUpdates,
    deliveredUpdates,
    lastError,
    markSeen,
    sendTypingStart,
    sendTypingStop,
    sendEncryptedMessage,
    editMessage,
    setMessageReaction,
    deleteMessageForEveryone,
    reconnect,
    rejoinConversation: joinConversation,
  };
}

function typingKey(conversationId: string, userId: string) {
  return `${conversationId}:${userId}`;
}
