'use client';

import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ban, Bell, BellOff, CalendarSearch, Check, ChevronDown, Copy, Download, Eraser, FileText, Flag, Image as ImageIcon, LockKeyhole, MessageSquareReply, MoreHorizontal, Pencil, PictureInPicture2, Pin, Play, Plus, Radio, RefreshCw, Search, ShieldCheck, Smile, Star, Trash2, Upload, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatSocket, type ChatReactionUpdate, type ChatRealtimeMessage } from '../hooks/use-chat-socket';
import { dispatchChatUnreadRefresh } from '../hooks/use-chat-unread-count';
import { exportEncryptedChatKeyBackup, importEncryptedChatKeyBackup } from '../lib/chat-key-recovery';
import { CHAT_ATTACHMENT_ENCRYPTION_ALGORITHM, CHAT_ENCRYPTION_ALGORITHM, decryptChatAttachment, decryptChatMessage, encryptChatAttachment, encryptChatMessage, exportPrivateKey, exportPublicKey, generateChatKeyPair, importPublicKey } from '../lib/chat-crypto';
import { createLocalChatKey, getLocalChatDeviceIdentity, getLocalChatKey, getLocalChatKeyRing, removeLocalChatKey, replaceLocalChatKey, type LocalChatDeviceIdentity, type LocalChatKeyPair } from '../lib/chat-key-store';
import { apiFetch, apiUrl } from '../lib/api';
import { detectClientDeviceInfo } from '../lib/chat-device-info';
import { useI18n } from '../lib/i18n';
import { userRoleLabel } from '../lib/user-role';
import { ProfilePhoto } from './profile-photo';
import { Button, ConfirmDialog, Spinner, TableEmptyState, TableErrorState } from './ui';

type ChatConversation = {
  id: string;
  type: string;
  title?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  lastMessageSenderId?: string | null;
  unreadCount?: number;
  blockState?: ChatBlockState | null;
  participants: {
    id: string;
    userId: string;
    name: string;
    role: string;
    title?: string | null;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
    joinedAt: string;
    lastReadAt?: string | null;
    mutedAt?: string | null;
  }[];
};

type ChatBlockState = {
  blockedUserId: string;
  blockedByMe: boolean;
  blockedMe: boolean;
};

type ChatConversationsResponse = {
  conversations: ChatConversation[];
};

type ChatMessage = {
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
  starred?: boolean;
};

type ChatReactionSummary = {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
  userIds?: string[];
};

type ChatMessagesResponse = {
  messages: ChatMessage[];
};

type ChatMessageStarResponse = {
  messageId: string;
  starred: boolean;
};

type ChatNotificationSettingsResponse = {
  conversationId: string;
  muted: boolean;
  mutedAt?: string | null;
};

type ChatBlockResponse = {
  blockedUserId: string;
  blocked: boolean;
  blockState: ChatBlockState;
};

type ChatReportReason = 'spam' | 'harassment' | 'unsafe_content' | 'other';

type ChatSearchResult = {
  message: ChatMessage;
  senderLabel: string;
  preview: string;
  typeLabel: string;
  createdAt: string;
  matchIndex: number;
};

type GroupMediaItem = {
  message: ChatMessage;
  attachment: EncryptedAttachmentPayload;
  preview?: AttachmentPreview;
};

type GroupLinkItem = {
  message: ChatMessage;
  url: string;
  domain: string;
};

type ChatPresenceState = {
  userId: string;
  isOnline: boolean;
  lastSeenAt?: string | null;
};

type ChatPresenceResponse = {
  presence: {
    userId: string;
    lastSeenAt?: string | null;
  }[];
};

type CurrentUser = {
  id: string;
  communityId: string;
  permissions?: string[];
};

type ChatDeviceKey = {
  id: string;
  userId: string;
  communityId: string;
  publicKey: string;
  algorithm: string;
  fingerprint?: string | null;
  version?: number;
  status?: 'ACTIVE' | 'RETIRED' | 'REVOKED' | string;
};

type ChatParticipant = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  roleName: string;
  status: string;
  title?: string | null;
  avatarUrl?: string | null;
  dicebearStyle?: string | null;
  dicebearSeed?: string | null;
  hasChatKey: boolean;
};

type ChatParticipantsResponse = {
  participants: ChatParticipant[];
};

type ChatGroupParticipant = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'OWNER' | 'MEMBER' | string;
  title?: string | null;
  avatarUrl?: string | null;
  dicebearStyle?: string | null;
  dicebearSeed?: string | null;
  joinedAt: string;
};

type ChatGroupParticipantsResponse = {
  participants: ChatGroupParticipant[];
};

type DirectConversationResponse = {
  conversation: ChatConversation;
  created: boolean;
};
type ConversationCreateResponse = DirectConversationResponse;
type GroupParticipantsMutationResponse = {
  conversation: ChatConversation;
  participants: ChatGroupParticipant[];
};

type ChatKeySetupState = 'preparing' | 'restore-required' | 'rotating' | 'ready' | 'failed';
type ConversationManagementAction = 'clear' | 'delete';
type GroupCreationStep = 'select' | 'details';
type ConversationFilter = 'all' | 'unread' | 'groups' | 'favourites';

type EmojiPickerPosition = {
  top: number;
  left: number;
  width: number;
  height: number;
};
type GroupPanelView = 'info' | 'search' | 'starred' | 'media';
type GroupMediaPanelTab = 'media' | 'docs' | 'links';
const maxPlainAttachmentSize = 8 * 1024 * 1024;
const groupMembersPageSize = 5;
const imagePreviewLoadTimeoutMs = 30_000;
const attachmentOperationTimeoutMs = 30_000;
const deleteForEveryoneWindowMs = 15 * 60 * 1000;
const editMessageWindowMs = 15 * 60 * 1000;
const allowedReactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
const groupMessageKeyVersion = 'GROUP-ECDH-P256-AES-GCM-v1';
const minimumGroupMembers = 2;
const documentAttachmentTypes = new Set([
  'application/pdf',
  'text/plain',
  'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const mediaAttachmentTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg']);
type AttachmentPickerKind = 'document' | 'media';
type AttachmentKind = 'photo' | 'video' | 'document' | 'file';
type AttachmentTransferProgress = {
  kind: 'upload' | 'download';
  percent: number | null;
  messageId?: string;
};
type MessageRenderItem =
  | { type: 'separator'; key: string; label: string }
  | {
    type: 'message';
    message: ChatMessage;
    previousSameSender: boolean;
    nextSameSender: boolean;
    isFirstInSenderGroup: boolean;
    isLastInSenderGroup: boolean;
  };

type ChatAttachmentUploadResponse = {
  attachment: {
    id: string;
    conversationId: string;
    senderId: string;
    encryptedSize: number;
    viewOnce: boolean;
    encryptionNonce: string;
    encryptionAlgorithmVersion: string;
    createdAt: string;
  };
};

type ChatAttachmentViewsResponse = {
  views: {
    attachmentId: string;
    openedAt: string;
  }[];
};

type EncryptedAttachmentPayload = {
  kind: 'attachment';
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  attachmentType: AttachmentKind;
  viewOnce?: boolean;
  fileKey: string;
  fileNonce: string;
  attachmentAlgorithm: typeof CHAT_ATTACHMENT_ENCRYPTION_ALGORITHM;
};

type ReplyMetadata = {
  messageId: string;
};

type ChatPayloadEnvelope = {
  kind: 'chat-message';
  text?: string;
  attachment?: EncryptedAttachmentPayload;
  replyTo?: ReplyMetadata;
};

type GroupEncryptedPayload = {
  kind: 'group-message';
  version: 1;
  recipients: Record<string, {
    encryptedPayload: string;
    encryptionNonce: string;
    encryptionKeyVersion?: string | null;
  }>;
};

type AttachmentPreviewStatus = 'idle' | 'waiting-for-metadata' | 'waiting-for-keys' | 'loading' | 'loaded' | 'error';
type MessageHydrationStatus = 'pending-metadata' | 'waiting-for-keys' | 'hydrated' | 'error';

type AttachmentPreview = {
  attachmentId: string;
  messageId: string;
  status: AttachmentPreviewStatus;
  objectUrl?: string;
  error?: boolean;
  errorMessage?: string;
  startedAt?: number;
  loadedAt?: number;
};

type MessageHydration = {
  status: MessageHydrationStatus;
  reason?: string;
};

type ChatMessageSource = 'api' | 'socket' | 'local-send';
type ChatPreviewSource = ChatMessageSource | 'retry';
type AttachmentComposerStatus = 'idle' | 'selected' | 'encrypting' | 'uploading' | 'sending' | 'sent' | 'failed';
type ImagePreviewInFlight = {
  token: symbol;
  startedAt: number;
  controller: AbortController;
};

type ImagePreviewState = {
  url: string;
  name: string;
  downloadName?: string;
  attachmentId?: string;
  kind?: 'image' | 'video';
  messageId?: string;
  conversationId?: string;
  attachment?: EncryptedAttachmentPayload;
  sender?: {
    name?: string | null;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
  };
  timestampLabel?: string;
  starred?: boolean;
};

export function ChatWorkspace({ admin = false }: { admin?: boolean }) {
  const { lang, t } = useI18n();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [conversationListSearch, setConversationListSearch] = useState('');
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [keyStatus, setKeyStatus] = useState<ChatKeySetupState>('preparing');
  const [localPrivateKey, setLocalPrivateKey] = useState<CryptoKey | null>(null);
  const [localPublicKey, setLocalPublicKey] = useState('');
  const [localKeyRing, setLocalKeyRing] = useState<LocalChatKeyPair[]>([]);
  const [localDeviceIdentity, setLocalDeviceIdentity] = useState<LocalChatDeviceIdentity | null>(null);
  const [conversationKeys, setConversationKeys] = useState<ChatDeviceKey[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [messageHydration, setMessageHydration] = useState<Record<string, MessageHydration>>({});
  const [messageText, setMessageText] = useState('');
  const [selectedAttachmentFile, setSelectedAttachmentFile] = useState<File | null>(null);
  const [selectedAttachmentKind, setSelectedAttachmentKind] = useState<AttachmentKind | null>(null);
  const [selectedAttachmentViewOnce, setSelectedAttachmentViewOnce] = useState(false);
  const [attachmentComposerStatus, setAttachmentComposerStatus] = useState<AttachmentComposerStatus>('idle');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState<EmojiPickerPosition | null>(null);
  const [imagePreviewsByAttachmentId, setImagePreviewsByAttachmentId] = useState<Record<string, AttachmentPreview>>({});
  const [selectedAttachmentPreviewUrl, setSelectedAttachmentPreviewUrl] = useState('');
  const [attachmentTransferProgress, setAttachmentTransferProgress] = useState<AttachmentTransferProgress | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [imagePreviewDownloadError, setImagePreviewDownloadError] = useState('');
  const [viewOnceImagePreview, setViewOnceImagePreview] = useState<ImagePreviewState | null>(null);
  const [openedAttachmentIds, setOpenedAttachmentIds] = useState<Set<string>>(() => new Set());
  const [viewOnceOpeningAttachmentId, setViewOnceOpeningAttachmentId] = useState('');
  const [viewOnceFailedAttachmentId, setViewOnceFailedAttachmentId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [downloadingAttachmentMessageId, setDownloadingAttachmentMessageId] = useState('');
  const [downloadFailedAttachmentMessageId, setDownloadFailedAttachmentMessageId] = useState('');
  const [participantPickerOpen, setParticipantPickerOpen] = useState(false);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantError, setParticipantError] = useState('');
  const [startingChatUserId, setStartingChatUserId] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedGroupParticipantIds, setSelectedGroupParticipantIds] = useState<string[]>([]);
  const [groupCreationOpen, setGroupCreationOpen] = useState(false);
  const [groupCreationStep, setGroupCreationStep] = useState<GroupCreationStep>('select');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [recoveryPopupOpen, setRecoveryPopupOpen] = useState(false);
  const [identityConfirmationOpen, setIdentityConfirmationOpen] = useState(false);
  const [keyBackupOpen, setKeyBackupOpen] = useState(false);
  const [keyBackupMode, setKeyBackupMode] = useState<'export' | 'import'>('export');
  const [keyBackupPassword, setKeyBackupPassword] = useState('');
  const [keyBackupConfirmPassword, setKeyBackupConfirmPassword] = useState('');
  const [keyBackupFile, setKeyBackupFile] = useState<File | null>(null);
  const [keyBackupReplaceConfirmed, setKeyBackupReplaceConfirmed] = useState(false);
  const [keyBackupBusy, setKeyBackupBusy] = useState(false);
  const [keyBackupMessage, setKeyBackupMessage] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [conversationActionsOpen, setConversationActionsOpen] = useState(false);
  const [confirmingConversationAction, setConfirmingConversationAction] = useState<ConversationManagementAction | null>(null);
  const [conversationActionBusy, setConversationActionBusy] = useState(false);
  const [notificationSettingsBusy, setNotificationSettingsBusy] = useState(false);
  const [starredMessagesOpen, setStarredMessagesOpen] = useState(false);
  const [starredMessages, setStarredMessages] = useState<ChatMessage[]>([]);
  const [loadingStarredMessages, setLoadingStarredMessages] = useState(false);
  const [starredMessagesError, setStarredMessagesError] = useState('');
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [directMediaPanelOpen, setDirectMediaPanelOpen] = useState(false);
  const [groupMembersPanelOpen, setGroupMembersPanelOpen] = useState(false);
  const [groupPanelInitialView, setGroupPanelInitialView] = useState<GroupPanelView>('info');
  const [groupParticipants, setGroupParticipants] = useState<ChatGroupParticipant[]>([]);
  const [loadingGroupParticipants, setLoadingGroupParticipants] = useState(false);
  const [groupParticipantsError, setGroupParticipantsError] = useState('');
  const [groupAddMembersOpen, setGroupAddMembersOpen] = useState(false);
  const [groupAddMemberSearch, setGroupAddMemberSearch] = useState('');
  const [selectedGroupAddMemberIds, setSelectedGroupAddMemberIds] = useState<string[]>([]);
  const [addingGroupMembers, setAddingGroupMembers] = useState(false);
  const [removingGroupMemberId, setRemovingGroupMemberId] = useState('');
  const [updatingGroupName, setUpdatingGroupName] = useState(false);
  const [transferringGroupOwnership, setTransferringGroupOwnership] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const [debouncedConversationSearchQuery, setDebouncedConversationSearchQuery] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
  const [replyTargetId, setReplyTargetId] = useState('');
  const [editingMessage, setEditingMessage] = useState<{ messageId: string; draftText: string } | null>(null);
  const [openMessageActionsId, setOpenMessageActionsId] = useState('');
  const [messageActionError, setMessageActionError] = useState<{ messageId: string; text: string } | null>(null);
  const [confirmingMessageAction, setConfirmingMessageAction] = useState<{ messageId: string } | null>(null);
  const [messageActionBusyId, setMessageActionBusyId] = useState('');
  const [reportingMessage, setReportingMessage] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState<ChatReportReason>('spam');
  const [reportNote, setReportNote] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [blockSettingsBusy, setBlockSettingsBusy] = useState(false);
  const [presenceByUser, setPresenceByUser] = useState<Record<string, ChatPresenceState>>({});
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const activeChatPanelRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const documentAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const mediaAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const conversationSearchRef = useRef<HTMLDivElement | null>(null);
  const conversationSearchInputRef = useRef<HTMLInputElement | null>(null);
  const imagePreviewsByAttachmentIdRef = useRef<Record<string, AttachmentPreview>>({});
  const imagePreviewInFlightRef = useRef<Map<string, ImagePreviewInFlight>>(new Map());
  const messageSourceRef = useRef<Map<string, ChatMessageSource>>(new Map());
  const conversationActionsRef = useRef<HTMLDivElement | null>(null);
  const startMenuRef = useRef<HTMLDivElement | null>(null);
  const recoveryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const identityRotationInFlightRef = useRef(false);
  const pinnedConversationStorageLoadedRef = useRef(false);
  const conversationKeyRefreshRef = useRef<string | null>(null);
  const conversationKeyRefreshAttemptRef = useRef('');
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesNearBottomRef = useRef(true);
  const selectedConversationIdRef = useRef('');
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const canStartChat = currentUser?.permissions?.includes('chat.direct.create') ?? false;
  const pinnedConversationStorageKey = currentUser ? `pe-chat-pinned-${currentUser.id}-${admin ? 'admin' : 'member'}` : '';
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );
  const activeConversationId = selectedConversation?.id ?? '';
  const messageRenderItems = useMemo(
    () => buildMessageRenderItems(messages, locale, t.chat.today, t.chat.yesterday),
    [locale, messages, t.chat.today, t.chat.yesterday],
  );

  const debugChatPreview = useCallback((event: string, data: Record<string, string | number | boolean | null | undefined>) => {
    if (typeof window === 'undefined' || window.localStorage.getItem('pe-chat-debug') !== '1') return;
    console.info('[chat-preview]', event, data);
  }, []);
  const debugChatWorkspace = useCallback((event: string, data: Record<string, string | number | boolean | null | undefined>) => {
    if (typeof window === 'undefined' || window.localStorage.getItem('pe-chat-debug') !== '1') return;
    console.info('[chat-workspace]', event, data);
  }, []);

  const updateScrollToLatestVisibility = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const nearBottom = isNearMessageListBottom(container);
    messagesNearBottomRef.current = nearBottom;
    setShowScrollToLatest(!nearBottom && messages.length > 0);
  }, [messages.length]);

  const scrollMessagesToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    messagesNearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, []);

  useEffect(() => {
    if (!pinnedConversationStorageKey || typeof window === 'undefined') return;
    pinnedConversationStorageLoadedRef.current = false;
    try {
      const stored = window.localStorage.getItem(pinnedConversationStorageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      setPinnedConversationIds(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
    } catch {
      setPinnedConversationIds([]);
    } finally {
      pinnedConversationStorageLoadedRef.current = true;
    }
  }, [pinnedConversationStorageKey]);

  useEffect(() => {
    if (!pinnedConversationStorageKey || typeof window === 'undefined') return;
    if (!pinnedConversationStorageLoadedRef.current) return;
    window.localStorage.setItem(pinnedConversationStorageKey, JSON.stringify(pinnedConversationIds));
  }, [pinnedConversationIds, pinnedConversationStorageKey]);

  useEffect(() => {
    if (keyStatus !== 'restore-required') setRecoveryPopupOpen(false);
  }, [keyStatus]);

  function messageSource(messageId: string): ChatMessageSource {
    return messageSourceRef.current.get(messageId) ?? 'api';
  }

  function updateImagePreviewState(
    attachmentId: string,
    updater: (current: AttachmentPreview | undefined, all: Record<string, AttachmentPreview>) => AttachmentPreview | null,
  ) {
    setImagePreviewsByAttachmentId((current) => {
      const nextPreview = updater(current[attachmentId], current);
      const next = { ...current };
      if (nextPreview) {
        next[attachmentId] = nextPreview;
      } else {
        delete next[attachmentId];
      }
      imagePreviewsByAttachmentIdRef.current = next;
      return next;
    });
  }

  function replaceImagePreviewState(next: Record<string, AttachmentPreview>) {
    imagePreviewsByAttachmentIdRef.current = next;
    setImagePreviewsByAttachmentId(next);
  }

  useEffect(() => {
    selectedConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id;
  }, [currentUser?.id]);

  const handleRealtimeMessage = useCallback((message: ChatRealtimeMessage) => {
    const activeConversationId = selectedConversationIdRef.current;
    const activeUserId = currentUserIdRef.current;
    messageSourceRef.current.set(message.id, 'socket');
    debugChatPreview('socket-message-received', {
      source: 'socket',
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      previewState: 'socket-received',
    });
    setMessages((current) => {
      if (message.conversationId !== activeConversationId) return current;
      return current.some((item) => item.id === message.id) ? current : [...current, message];
    });
    setConversations((current) => sortConversations(current.map((conversation) => {
      if (conversation.id !== message.conversationId) return conversation;
      const selected = conversation.id === activeConversationId;
      const ownMessage = activeUserId === message.senderId;
      const muted = conversationMuted(conversation, activeUserId);
      if (!selected && !ownMessage && !muted) dispatchChatUnreadRefresh();
      const nextUnreadCount = selected || ownMessage ? 0 : (conversation.unreadCount ?? 0) + 1;
      return {
        ...conversation,
        lastMessageAt: message.createdAt,
        lastMessageSenderId: message.senderId,
        unreadCount: nextUnreadCount,
        updatedAt: message.createdAt,
      };
    })));
  }, [debugChatPreview]);
  const handleConversationActivity = useCallback((conversationId: string) => {
    setConversations((current) => sortConversations(current.map((conversation) => conversation.id === conversationId ? { ...conversation, updatedAt: new Date().toISOString() } : conversation)));
  }, []);
  const handleRealtimeDeletedMessage = useCallback((message: ChatRealtimeMessage) => {
    setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, ...message } : item)));
    setStarredMessages((current) => current.filter((item) => item.id !== message.id));
    setReplyTargetId((current) => current === message.id ? '' : current);
    setOpenMessageActionsId((current) => current === message.id ? '' : current);
    setEditingMessage((current) => {
      if (current?.messageId !== message.id) return current;
      setMessageText(current.draftText);
      setSendError('');
      return null;
    });
    setDecryptedMessages((current) => {
      const next = { ...current };
      delete next[message.id];
      return next;
    });
  }, []);
  const handleRealtimeEditedMessage = useCallback((message: ChatRealtimeMessage) => {
    messageSourceRef.current.set(message.id, 'socket');
    setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, ...message } : item)));
  }, []);
  const handleRealtimeReaction = useCallback((update: ChatReactionUpdate) => {
    setMessages((current) => current.map((message) => (
      message.id === update.messageId ? { ...message, reactions: normalizeReactionSummaries(update.reactions, currentUserIdRef.current) } : message
    )));
  }, []);
  const { status: realtimeStatus, joinStatus, joinedConversationId, connectionRevision, typingUpdates, presenceUpdates, seenUpdates, deliveredUpdates, lastError: socketError, markSeen, sendTypingStart, sendTypingStop, sendEncryptedMessage, editMessage: editRealtimeMessage, setMessageReaction: setRealtimeMessageReaction, deleteMessageForEveryone, reconnect, rejoinConversation } = useChatSocket({
    conversationId: activeConversationId,
    currentUserId: currentUser?.id,
    enabled: Boolean(currentUser?.id),
    onMessage: handleRealtimeMessage,
    onMessageDeleted: handleRealtimeDeletedMessage,
    onMessageEdited: handleRealtimeEditedMessage,
    onMessageReaction: handleRealtimeReaction,
    onConversationActivity: handleConversationActivity,
  });
  const conversationRealtimeReady = Boolean(selectedConversation && realtimeStatus === 'connected' && joinStatus === 'joined' && joinedConversationId === activeConversationId);
  const selectedTypingUpdate = useMemo(() => {
    if (!selectedConversation || !currentUser) return null;
    return typingUpdates.find((item) => item.conversationId === selectedConversation.id && item.userId !== currentUser.id && item.isTyping) ?? null;
  }, [currentUser, selectedConversation, typingUpdates]);
  const selectedTypingLabel = selectedTypingUpdate
    ? t.chat.typing
    : '';
  const selectedRecipient = useMemo(() => {
    if (!selectedConversation || !currentUser) return null;
    if (isGroupConversation(selectedConversation)) return null;
    return selectedConversation.participants.find((participant) => participant.userId !== currentUser.id) ?? null;
  }, [currentUser, selectedConversation]);
  const selectedPresence = useMemo(() => {
    if (!selectedRecipient) return null;
    return presenceByUser[selectedRecipient.userId] ?? null;
  }, [presenceByUser, selectedRecipient]);
  const selectedStatusLabel = selectedTypingLabel || (selectedConversation && isGroupConversation(selectedConversation) ? t.chat.groupParticipantsCount(selectedConversation.participants.length) : presenceLabel(selectedPresence, locale, t));
  const selectedConversationMuted = conversationMuted(selectedConversation, currentUser?.id);
  const selectedMediaItems = useMemo(() => (
    buildGroupMediaPanelItems(messages, decryptedMessages, imagePreviewsByAttachmentId)
  ), [decryptedMessages, imagePreviewsByAttachmentId, messages]);
  const normalizedConversationSearchQuery = normalizeSearchQuery(debouncedConversationSearchQuery);
  const conversationSearchResults = useMemo(() => (
    buildConversationSearchResults({
      messages,
      decryptedMessages,
      query: normalizedConversationSearchQuery,
      conversation: selectedConversation,
      currentUserId: currentUser?.id,
      t,
    })
  ), [currentUser?.id, decryptedMessages, messages, normalizedConversationSearchQuery, selectedConversation, t]);
  const recipientKey = useMemo(() => {
    if (!selectedConversation || !currentUser) return null;
    if (isGroupConversation(selectedConversation)) return null;
    const recipient = selectedConversation.participants.find((participant) => participant.userId !== currentUser.id);
    if (!recipient) return null;
    return conversationKeys.find((key) => key.userId === recipient.userId && key.algorithm === CHAT_ENCRYPTION_ALGORITHM && key.status !== 'RETIRED' && key.status !== 'REVOKED') ?? null;
  }, [conversationKeys, currentUser, selectedConversation]);
  const groupRecipientKeys = useMemo(() => {
    if (!selectedConversation || !currentUser || !isGroupConversation(selectedConversation)) return [];
    return selectedConversation.participants
      .map((participant) => conversationKeys.find((key) => key.userId === participant.userId && key.algorithm === CHAT_ENCRYPTION_ALGORITHM && key.status !== 'RETIRED' && key.status !== 'REVOKED') ?? null)
      .filter((key): key is ChatDeviceKey => Boolean(key));
  }, [conversationKeys, currentUser, selectedConversation]);
  const localDeviceKey = useMemo(() => (
    conversationKeys.find((key) => (
      key.userId === currentUser?.id &&
      key.publicKey === localPublicKey &&
      key.algorithm === CHAT_ENCRYPTION_ALGORITHM &&
      key.status !== 'RETIRED' &&
      key.status !== 'REVOKED'
    )) ?? null
  ), [conversationKeys, currentUser?.id, localPublicKey]);
  const groupKeyReady = Boolean(
    selectedConversation &&
    currentUser &&
    isGroupConversation(selectedConversation) &&
    groupRecipientKeys.length === selectedConversation.participants.length,
  );
  const conversationEncryptionReady = isGroupConversation(selectedConversation) ? groupKeyReady : Boolean(recipientKey);
  const composerReady = Boolean(selectedConversation && currentUser && localPrivateKey && localDeviceKey && conversationEncryptionReady && keyStatus === 'ready' && conversationRealtimeReady);
  const selectedBlockState = selectedConversation && !isGroupConversation(selectedConversation) ? selectedConversation.blockState ?? null : null;
  const directConversationBlocked = Boolean(selectedBlockState?.blockedByMe || selectedBlockState?.blockedMe);
  const composerSendBlocked = composerReady && directConversationBlocked;
  const composerCanSend = composerReady && !directConversationBlocked;
  const blockedComposerMessage = selectedBlockState?.blockedByMe ? t.chat.youBlockedThisUser : selectedBlockState?.blockedMe ? t.chat.cannotSendToBlockedUser : '';
  const selectedConversationLabel = selectedConversation
    ? conversationRecipientLabel(selectedConversation, currentUser?.id, t.chat.directConversation)
    : t.chat.selectConversation;
  const latestOwnSeenMessageId = useMemo(() => latestSeenOwnMessageId(messages, currentUser?.id, selectedConversation), [currentUser?.id, messages, selectedConversation]);
  const replyTarget = useMemo(() => messages.find((message) => message.id === replyTargetId) ?? null, [messages, replyTargetId]);
  const editingTarget = useMemo(() => messages.find((message) => message.id === editingMessage?.messageId) ?? null, [editingMessage?.messageId, messages]);
  const conversationIdsSignature = useMemo(() => conversations.map((conversation) => conversation.id).join(','), [conversations]);
  const pinnedConversationIdSet = useMemo(() => new Set(pinnedConversationIds), [pinnedConversationIds]);
  const conversationCounts = useMemo(() => ({
    all: conversations.length,
    unread: conversations.filter((conversation) => (conversation.unreadCount ?? 0) > 0).length,
    groups: conversations.filter(isGroupConversation).length,
    favourites: conversations.filter((conversation) => pinnedConversationIdSet.has(conversation.id)).length,
  }), [conversations, pinnedConversationIdSet]);
  const visibleConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      if (conversationFilter === 'unread' && (conversation.unreadCount ?? 0) === 0) return false;
      if (conversationFilter === 'groups' && !isGroupConversation(conversation)) return false;
      if (conversationFilter === 'favourites' && !pinnedConversationIdSet.has(conversation.id)) return false;
      return conversationMatchesSearch(conversation, currentUser?.id, t.chat.directConversation, conversationListSearch);
    });
  }, [conversationFilter, conversationListSearch, conversations, currentUser?.id, pinnedConversationIdSet, t.chat.directConversation]);
  const pinnedConversations = useMemo(() => (
    visibleConversations.filter((conversation) => pinnedConversationIdSet.has(conversation.id))
  ), [pinnedConversationIdSet, visibleConversations]);
  const recentConversations = useMemo(() => (
    visibleConversations.filter((conversation) => !pinnedConversationIdSet.has(conversation.id))
  ), [pinnedConversationIdSet, visibleConversations]);
  const filteredParticipants = useMemo(() => {
    const query = participantSearch.trim().toLowerCase();
    if (!query) return participants;
    return participants.filter((participant) => (
      participant.name.toLowerCase().includes(query) ||
      participant.email.toLowerCase().includes(query) ||
      participant.role.toLowerCase().includes(query)
    ));
  }, [participantSearch, participants]);
  const groupAddableParticipants = useMemo(() => {
    const activeParticipantIds = new Set(groupParticipants.map((participant) => participant.userId));
    const query = groupAddMemberSearch.trim().toLowerCase();
    return participants.filter((participant) => {
      if (activeParticipantIds.has(participant.userId)) return false;
      if (!query) return true;
      return (
        participant.name.toLowerCase().includes(query) ||
        participant.email.toLowerCase().includes(query) ||
        participant.role.toLowerCase().includes(query)
      );
    });
  }, [groupAddMemberSearch, groupParticipants, participants]);

  async function loadConversations() {
    setError('');
    setLoadingConversations(true);
    debugChatWorkspace('conversations-load-started', {
      selectedConversationId: selectedConversationIdRef.current || null,
    });
    try {
      const data = await apiFetch<ChatConversationsResponse>('/chat/conversations');
      const sortedConversations = sortConversations(data.conversations);
      debugChatWorkspace('conversations-filtered', {
        beforeCount: data.conversations.length,
        afterCount: sortedConversations.length,
        reason: 'sort-only-no-client-filter',
      });
      debugChatWorkspace('conversations-load-succeeded', {
        count: sortedConversations.length,
        conversationIds: sortedConversations.map((conversation) => conversation.id).join(','),
      });
      setConversations(sortedConversations);
      setSelectedConversationId((current) => {
        if (!current || data.conversations.some((conversation) => conversation.id === current)) return current;
        debugChatWorkspace('selected-conversation-cleared', {
          selectedConversationId: current,
          reason: 'missing-from-conversations-load',
        });
        return '';
      });
    } catch {
      debugChatWorkspace('conversations-load-failed', {
        selectedConversationId: selectedConversationIdRef.current || null,
      });
      setError(t.chat.loadFailed);
    } finally {
      setLoadingConversations(false);
    }
  }

  async function loadMessagesForConversation(conversationId: string) {
    setLoadingMessages(true);
    try {
      const [data, viewData] = await Promise.all([
        apiFetch<ChatMessagesResponse>(`/chat/conversations/${conversationId}/messages`),
        apiFetch<ChatAttachmentViewsResponse>(`/chat/conversations/${conversationId}/attachment-views`),
      ]);
      data.messages.forEach((message) => {
        messageSourceRef.current.set(message.id, messageSourceRef.current.get(message.id) ?? 'api');
      });
      setMessages(data.messages.map((message) => ({
        ...message,
        reactions: normalizeReactionSummaries(message.reactions ?? [], currentUser?.id),
      })));
      setOpenedAttachmentIds(new Set(viewData.views.map((view) => view.attachmentId)));
    } catch {
      setMessages([]);
      setOpenedAttachmentIds(new Set());
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadStarredMessagesForConversation(conversationId: string) {
    setLoadingStarredMessages(true);
    setStarredMessagesError('');
    try {
      const data = await apiFetch<ChatMessagesResponse>(`/chat/conversations/${conversationId}/starred`);
      setStarredMessages(data.messages.map((message) => ({
        ...message,
        reactions: normalizeReactionSummaries(message.reactions ?? [], currentUser?.id),
      })));
    } catch {
      setStarredMessagesError(t.chat.starUpdateFailed);
    } finally {
      setLoadingStarredMessages(false);
    }
  }

  function openStarredMessages() {
    if (!selectedConversation) return;
    setConversationActionsOpen(false);
    setStarredMessagesOpen(true);
    void loadStarredMessagesForConversation(selectedConversation.id);
  }

  function openGroupPanel(view: GroupPanelView = 'info') {
    if (!selectedConversation) return;
    setConversationActionsOpen(false);
    setDirectMediaPanelOpen(false);
    setGroupAddMembersOpen(false);
    setGroupAddMemberSearch('');
    setSelectedGroupAddMemberIds([]);
    setGroupParticipants([]);
    setGroupPanelInitialView(view);
    setGroupMembersPanelOpen(true);
    if (isGroupConversation(selectedConversation)) {
      void loadGroupParticipants(selectedConversation.id);
      if (view === 'starred') void loadStarredMessagesForConversation(selectedConversation.id);
      if (canStartChat) void loadParticipants();
    }
  }

  function closeGroupMembersPanel() {
    if (addingGroupMembers || removingGroupMemberId || leavingGroup) return;
    setGroupMembersPanelOpen(false);
    setGroupAddMembersOpen(false);
    setGroupAddMemberSearch('');
    setSelectedGroupAddMemberIds([]);
    setGroupParticipantsError('');
  }

  function toggleGroupAddMembers() {
    setGroupAddMembersOpen((open) => {
      if (open) {
        setGroupAddMemberSearch('');
        setSelectedGroupAddMemberIds([]);
        return false;
      }
      setGroupAddMemberSearch('');
      setSelectedGroupAddMemberIds([]);
      if (canStartChat) void loadParticipants();
      return true;
    });
  }

  function toggleGroupAddMember(userId: string) {
    setSelectedGroupAddMemberIds((current) => (
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]
    ));
  }

  async function addMembersToSelectedGroup() {
    if (!selectedConversation || !isGroupConversation(selectedConversation) || selectedGroupAddMemberIds.length === 0 || addingGroupMembers) return;
    setAddingGroupMembers(true);
    try {
      const data = await apiFetch<GroupParticipantsMutationResponse>(`/chat/conversations/${selectedConversation.id}/participants`, {
        method: 'POST',
        body: JSON.stringify({ userIds: selectedGroupAddMemberIds }),
      });
      applyUpdatedGroupConversation(data.conversation, data.participants);
      setSelectedGroupAddMemberIds([]);
      setGroupAddMemberSearch('');
      setGroupAddMembersOpen(false);
      toast.success(t.chat.membersAdded);
    } catch {
      toast.error(t.chat.addMembersFailed);
    } finally {
      setAddingGroupMembers(false);
    }
  }

  async function removeGroupMember(userId: string) {
    if (!selectedConversation || !isGroupConversation(selectedConversation) || removingGroupMemberId) return;
    setRemovingGroupMemberId(userId);
    try {
      const data = await apiFetch<GroupParticipantsMutationResponse>(`/chat/conversations/${selectedConversation.id}/participants/${userId}`, {
        method: 'DELETE',
      });
      applyUpdatedGroupConversation(data.conversation, data.participants);
      toast.success(t.chat.memberRemoved);
    } catch {
      toast.error(t.chat.removeMemberFailed);
    } finally {
      setRemovingGroupMemberId('');
    }
  }

  async function updateSelectedGroupName(title: string) {
    if (!selectedConversation || !isGroupConversation(selectedConversation) || updatingGroupName) return;
    const conversationId = selectedConversation.id;
    setUpdatingGroupName(true);
    try {
      const data = await apiFetch<GroupParticipantsMutationResponse>(`/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      applyRenamedGroupConversation(data.conversation);
      setGroupParticipants(data.participants);
      void loadGroupParticipants(conversationId);
      toast.success(t.chat.groupNameUpdated);
    } catch {
      toast.error(t.chat.groupNameUpdateFailed);
    } finally {
      setUpdatingGroupName(false);
    }
  }

  async function transferSelectedGroupOwnership(newOwnerUserId: string) {
    if (!selectedConversation || !isGroupConversation(selectedConversation) || transferringGroupOwnership) return;
    setTransferringGroupOwnership(true);
    try {
      const data = await apiFetch<GroupParticipantsMutationResponse>(`/chat/conversations/${selectedConversation.id}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ newOwnerUserId }),
      });
      applyUpdatedGroupConversation(data.conversation, data.participants);
      toast.success(t.chat.ownershipTransferred);
    } catch {
      toast.error(t.chat.ownershipTransferFailed);
    } finally {
      setTransferringGroupOwnership(false);
    }
  }

  async function leaveSelectedGroup() {
    if (!selectedConversation || !isGroupConversation(selectedConversation) || leavingGroup) return;
    if (groupParticipants.find((participant) => participant.userId === currentUser?.id)?.role === 'OWNER') {
      toast.error(t.chat.groupOwnerLeaveBlocked);
      return;
    }
    const conversationId = selectedConversation.id;
    setLeavingGroup(true);
    try {
      await apiFetch(`/chat/conversations/${conversationId}/leave`, { method: 'POST' });
      stopTyping();
      setGroupMembersPanelOpen(false);
      setSelectedConversationId('');
      setMessages([]);
      setConversationKeys([]);
      setGroupParticipants([]);
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      dispatchChatUnreadRefresh();
      toast.success(t.chat.leftGroup);
    } catch {
      toast.error(t.chat.leaveGroupFailed);
    } finally {
      setLeavingGroup(false);
    }
  }

  function openConversationSearch() {
    if (!selectedConversation) return;
    setConversationActionsOpen(false);
    setDirectMediaPanelOpen(false);
    setConversationSearchOpen(true);
  }

  function closeConversationSearch() {
    setConversationSearchOpen(false);
    setConversationSearchQuery('');
    setDebouncedConversationSearchQuery('');
  }

  function openDirectMediaPanel() {
    if (!selectedConversation || isGroupConversation(selectedConversation)) return;
    setConversationActionsOpen(false);
    setConversationSearchOpen(false);
    setDirectMediaPanelOpen(true);
  }

  async function loadKeysForConversation(conversationId: string) {
    if (keyStatus !== 'ready') {
      setConversationKeys([]);
      return;
    }
    try {
      const data = await apiFetch<{ keys: ChatDeviceKey[] }>(`/chat/conversations/${conversationId}/keys`);
      setConversationKeys(data.keys);
    } catch {
      setConversationKeys([]);
    }
  }

  async function loadPresenceForConversation(conversationId: string) {
    try {
      const data = await apiFetch<ChatPresenceResponse>(`/chat/conversations/${conversationId}/presence`);
      setPresenceByUser((current) => {
        const next = { ...current };
        data.presence.forEach((presence) => {
          const previous = next[presence.userId];
          next[presence.userId] = {
            userId: presence.userId,
            isOnline: previous?.isOnline ?? false,
            lastSeenAt: presence.lastSeenAt ?? previous?.lastSeenAt ?? null,
          };
        });
        return next;
      });
    } catch {
      // Presence is supporting metadata; keep the last known state if refresh fails.
    }
  }

  async function registerLocalChatKey(
    user: CurrentUser,
    localKey: LocalChatKeyPair,
    mode: 'initial' | 'restore' | 'rotate',
    deviceIdentity = localDeviceIdentity ?? getLocalChatDeviceIdentity(user.id, user.communityId),
  ) {
    const deviceInfo = await detectClientDeviceInfo();
    return apiFetch<{ key: ChatDeviceKey }>('/chat/keys/me', {
      method: 'POST',
      body: JSON.stringify({
        publicKey: localKey.publicKey,
        algorithm: CHAT_ENCRYPTION_ALGORITHM,
        deviceIdentifier: deviceIdentity.deviceIdentifier,
        displayName: deviceIdentity.displayName,
        generatedLabel: deviceInfo.suggestedDisplayName,
        deviceType: deviceInfo.deviceType,
        operatingSystemName: deviceInfo.operatingSystemName,
        operatingSystemVersion: deviceInfo.operatingSystemVersion,
        browserName: deviceInfo.browserName,
        browserVersion: deviceInfo.browserVersion,
        mode,
      }),
    });
  }

  async function prepareSecureKeys(shouldCancel: () => boolean) {
    setKeyStatus('preparing');
    try {
      const user = await apiFetch<CurrentUser>('/auth/me');
      if (shouldCancel()) return;
      setCurrentUser(user);
      const deviceIdentity = getLocalChatDeviceIdentity(user.id, user.communityId);
      setLocalDeviceIdentity(deviceIdentity);
      const [localKey, remote] = await Promise.all([
        getLocalChatKey(user.id, user.communityId),
        apiFetch<{ key: ChatDeviceKey | null; identityExists: boolean }>('/chat/keys/me'),
      ]);
      if (shouldCancel()) return;
      if (!localKey) {
        if (remote.identityExists) {
          setKeyStatus('restore-required');
          return;
        }
        const created = await createLocalChatKey(user.id, user.communityId);
        await registerLocalChatKey(user, created, 'initial', deviceIdentity);
        if (shouldCancel()) return;
        setLocalPrivateKey(created.privateKey);
        setLocalPublicKey(created.publicKey);
        setLocalKeyRing([created]);
        setKeyStatus('ready');
        return;
      }
      setLocalPrivateKey(localKey.privateKey);
      setLocalPublicKey(localKey.publicKey);
      setLocalKeyRing(await getLocalChatKeyRing(user.id, user.communityId));
      if (remote.key?.publicKey !== localKey.publicKey) {
        setKeyStatus('restore-required');
        return;
      }
      await registerLocalChatKey(user, localKey, 'restore', deviceIdentity);
      if (!shouldCancel()) setKeyStatus('ready');
    } catch {
      if (!shouldCancel()) setKeyStatus('failed');
    }
  }

  async function rotateChatIdentity() {
    if (!currentUser || !localDeviceIdentity || keyStatus === 'rotating' || identityRotationInFlightRef.current) return;
    identityRotationInFlightRef.current = true;
    setKeyStatus('rotating');
    try {
      const generated = await generateChatKeyPair();
      const candidate = { privateKey: generated.privateKey, publicKey: await exportPublicKey(generated.publicKey) };
      const previousPrivateKey = localPrivateKey ? await exportPrivateKey(localPrivateKey) : null;
      const previousPublicKey = localPublicKey;
      await replaceLocalChatKey(currentUser.id, currentUser.communityId, await exportPrivateKey(candidate.privateKey), candidate.publicKey);
      try {
        await registerLocalChatKey(currentUser, candidate, 'rotate', localDeviceIdentity);
      } catch (error) {
        if (previousPrivateKey && previousPublicKey) {
          await replaceLocalChatKey(currentUser.id, currentUser.communityId, previousPrivateKey, previousPublicKey);
        }
        throw error;
      }
      setLocalPrivateKey(candidate.privateKey);
      setLocalPublicKey(candidate.publicKey);
      setLocalKeyRing(await getLocalChatKeyRing(currentUser.id, currentUser.communityId));
      setKeyStatus('ready');
      if (activeConversationId) await loadKeysForConversation(activeConversationId);
      setIdentityConfirmationOpen(false);
      setRecoveryPopupOpen(false);
      toast.success(t.chat.newIdentityCreated);
    } catch {
      setKeyStatus('restore-required');
      toast.error(t.chat.newIdentityFailed);
    } finally {
      identityRotationInFlightRef.current = false;
    }
  }

  async function refreshChat() {
    if (refreshing) return;
    setRefreshing(true);
    debugChatWorkspace('conversations-load-started', {
      selectedConversationId: selectedConversationId || null,
      reason: 'manual-refresh',
    });
    try {
      const data = await apiFetch<ChatConversationsResponse>('/chat/conversations');
      const sortedConversations = sortConversations(data.conversations);
      debugChatWorkspace('conversations-filtered', {
        beforeCount: data.conversations.length,
        afterCount: sortedConversations.length,
        reason: 'manual-refresh-sort-only-no-client-filter',
      });
      debugChatWorkspace('conversations-load-succeeded', {
        count: sortedConversations.length,
        conversationIds: sortedConversations.map((conversation) => conversation.id).join(','),
        reason: 'manual-refresh',
      });
      const activeConversationId = selectedConversationId && sortedConversations.some((conversation) => conversation.id === selectedConversationId)
        ? selectedConversationId
        : '';

      setConversations(sortedConversations);
      if (selectedConversationId && !activeConversationId) {
        debugChatWorkspace('selected-conversation-cleared', {
          selectedConversationId,
          reason: 'missing-from-manual-refresh',
        });
      }
      setSelectedConversationId(activeConversationId);

      if (!activeConversationId) {
        setMessages([]);
        setConversationKeys([]);
        dispatchChatUnreadRefresh();
        if (realtimeStatus !== 'connected') reconnect();
        return;
      }

      await Promise.all([
        loadMessagesForConversation(activeConversationId),
        loadKeysForConversation(activeConversationId),
        loadPresenceForConversation(activeConversationId),
      ]);
      if (realtimeStatus === 'connected') rejoinConversation(activeConversationId);
      else reconnect();
      stopTyping();
      dispatchChatUnreadRefresh();
    } catch {
      debugChatWorkspace('conversations-load-failed', {
        selectedConversationId: selectedConversationId || null,
        reason: 'manual-refresh',
      });
      toast.error(t.chat.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  }

  async function loadParticipants() {
    if (!canStartChat) return;
    setParticipantError('');
    setLoadingParticipants(true);
    try {
      const data = await apiFetch<ChatParticipantsResponse>('/chat/participants');
      setParticipants(data.participants);
    } catch {
      setParticipantError(t.chat.participantsLoadFailed);
    } finally {
      setLoadingParticipants(false);
    }
  }

  async function loadGroupParticipants(conversationId: string) {
    setLoadingGroupParticipants(true);
    setGroupParticipantsError('');
    try {
      const data = await apiFetch<ChatGroupParticipantsResponse>(`/chat/conversations/${conversationId}/participants`);
      setGroupParticipants(data.participants);
    } catch {
      setGroupParticipantsError(t.chat.participantsLoadFailed);
    } finally {
      setLoadingGroupParticipants(false);
    }
  }

  function applyUpdatedGroupConversation(conversation: ChatConversation, participants: ChatGroupParticipant[]) {
    setConversations((current) => sortConversations(current.map((item) => (
      item.id === conversation.id
        ? { ...conversation, unreadCount: item.unreadCount ?? 0, lastMessageSenderId: item.lastMessageSenderId }
        : item
    ))));
    setGroupParticipants(participants);
    if (selectedConversationIdRef.current === conversation.id) {
      setConversationKeys((current) => current.filter((key) => participants.some((participant) => participant.userId === key.userId)));
      void loadKeysForConversation(conversation.id);
      void loadPresenceForConversation(conversation.id);
    }
  }

  function applyRenamedGroupConversation(conversation: ChatConversation) {
    setConversations((current) => sortConversations(current.map((item) => (
      item.id === conversation.id
        ? {
            ...item,
            title: conversation.title,
            avatarUrl: conversation.avatarUrl,
            updatedAt: conversation.updatedAt,
          }
        : item
    ))));
  }

  function applyConversationMutedState(conversationId: string, mutedAt: string | null) {
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? {
            ...conversation,
            participants: conversation.participants.map((participant) => (
              participant.userId === currentUser?.id ? { ...participant, mutedAt } : participant
            )),
          }
        : conversation
    )));
  }

  function applyConversationBlockState(conversationId: string, blockState: ChatBlockState | null) {
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, blockState } : conversation
    )));
  }

  async function toggleSelectedConversationMute() {
    if (!selectedConversation || notificationSettingsBusy) return;
    const muted = !selectedConversationMuted;
    const conversationId = selectedConversation.id;
    setNotificationSettingsBusy(true);
    setConversationActionsOpen(false);
    try {
      const data = await apiFetch<ChatNotificationSettingsResponse>(`/chat/conversations/${conversationId}/notification-settings`, {
        method: 'PATCH',
        body: JSON.stringify({ muted }),
      });
      applyConversationMutedState(conversationId, data.mutedAt ?? null);
      dispatchChatUnreadRefresh();
      toast.success(data.muted ? t.chat.conversationMuted : t.chat.conversationUnmuted);
    } catch {
      toast.error(t.chat.notificationSettingsUpdateFailed);
    } finally {
      setNotificationSettingsBusy(false);
    }
  }

  async function toggleSelectedDirectBlock() {
    if (!selectedConversation || !selectedRecipient || isGroupConversation(selectedConversation) || blockSettingsBusy) return;
    const conversationId = selectedConversation.id;
    const shouldBlock = !selectedConversation.blockState?.blockedByMe;
    setBlockSettingsBusy(true);
    setConversationActionsOpen(false);
    try {
      const data = await apiFetch<ChatBlockResponse>(`/chat/blocks/${selectedRecipient.userId}`, {
        method: shouldBlock ? 'POST' : 'DELETE',
      });
      applyConversationBlockState(conversationId, data.blockState);
      if (shouldBlock) {
        setSelectedAttachmentFile(null);
        setSelectedAttachmentKind(null);
        setSelectedAttachmentViewOnce(false);
        setAttachmentComposerStatus('idle');
        setAttachmentTransferProgress(null);
      }
      toast.success(data.blocked ? t.chat.userBlocked : t.chat.userUnblocked);
    } catch {
      toast.error(t.chat.blockUpdateFailed);
    } finally {
      setBlockSettingsBusy(false);
    }
  }

  function openParticipantPicker() {
    if (!canStartChat) {
      setParticipantError(t.chat.startChatPermissionDenied);
      return;
    }
    setStartMenuOpen(false);
    setParticipantPickerOpen(true);
    setParticipantSearch('');
    void loadParticipants();
  }

  function closeParticipantPicker() {
    if (startingChatUserId) return;
    setParticipantPickerOpen(false);
    setParticipantSearch('');
    setParticipantError('');
  }

  function openGroupCreation() {
    if (!canStartChat) {
      setParticipantError(t.chat.startChatPermissionDenied);
      return;
    }
    setStartMenuOpen(false);
    setGroupCreationOpen(true);
    setGroupCreationStep('select');
    setParticipantSearch('');
    setParticipantError('');
    setGroupTitle('');
    setSelectedGroupParticipantIds([]);
    void loadParticipants();
  }

  function closeGroupCreation() {
    if (creatingGroup) return;
    setGroupCreationOpen(false);
    setGroupCreationStep('select');
    setParticipantSearch('');
    setParticipantError('');
    setGroupTitle('');
    setSelectedGroupParticipantIds([]);
  }

  async function startDirectChat(targetUserId: string) {
    if (!canStartChat || startingChatUserId) return;
    setStartingChatUserId(targetUserId);
    setParticipantError('');
    try {
      const data = await apiFetch<ConversationCreateResponse>('/chat/conversations/direct', {
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      });
      setConversations((current) => {
        const withoutDuplicate = current.filter((conversation) => conversation.id !== data.conversation.id);
        return sortConversations([{ ...data.conversation, unreadCount: 0 }, ...withoutDuplicate]);
      });
      setSelectedConversationId(data.conversation.id);
      setParticipantPickerOpen(false);
      setParticipantSearch('');
    } catch {
      setParticipantError(t.chat.startChatFailed);
    } finally {
      setStartingChatUserId('');
    }
  }

  function toggleGroupParticipant(userId: string) {
    setSelectedGroupParticipantIds((current) => (
      current.includes(userId) ? current.filter((item) => item !== userId) : [...current, userId]
    ));
  }

  async function startGroupChat() {
    if (!canStartChat || creatingGroup) return;
    const title = groupTitle.trim();
    if (!title) {
      setParticipantError(t.chat.groupTitleRequired);
      return;
    }
    if (selectedGroupParticipantIds.length < minimumGroupMembers) {
      setParticipantError(t.chat.groupMembersRequired);
      return;
    }
    setCreatingGroup(true);
    setParticipantError('');
    try {
      const data = await apiFetch<ConversationCreateResponse>('/chat/conversations/group', {
        method: 'POST',
        body: JSON.stringify({ title, participantIds: selectedGroupParticipantIds }),
      });
      setConversations((current) => {
        const withoutDuplicate = current.filter((conversation) => conversation.id !== data.conversation.id);
        return sortConversations([{ ...data.conversation, unreadCount: 0 }, ...withoutDuplicate]);
      });
      setSelectedConversationId(data.conversation.id);
      setGroupCreationOpen(false);
      setParticipantSearch('');
      setGroupTitle('');
      setSelectedGroupParticipantIds([]);
      setGroupCreationStep('select');
      toast.success(t.chat.groupCreated);
    } catch {
      toast.error(t.chat.groupCreateFailed);
    } finally {
      setCreatingGroup(false);
    }
  }

  function selectConversation(conversationId: string) {
    stopTyping();
    setConversationActionsOpen(false);
    setDirectMediaPanelOpen(false);
    setConversationSearchOpen(false);
    setOpenMessageActionsId('');
    setConfirmingMessageAction(null);
    setEditingMessage(null);
    setSelectedAttachmentFile(null);
    setSelectedAttachmentKind(null);
    setSelectedAttachmentViewOnce(false);
    setAttachmentMenuOpen(false);
    setConfirmingConversationAction(null);
    setMessageActionError(null);
    setSelectedConversationId(conversationId);
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
    )));
    dispatchChatUnreadRefresh();
  }

  function togglePinnedConversation(conversationId: string) {
    setPinnedConversationIds((current) => (
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [conversationId, ...current]
    ));
  }

  function openKeyBackup(mode: 'export' | 'import') {
    setKeyBackupMode(mode);
    setKeyBackupPassword('');
    setKeyBackupConfirmPassword('');
    setKeyBackupFile(null);
    setKeyBackupReplaceConfirmed(false);
    setKeyBackupMessage(null);
    setKeyBackupOpen(true);
  }

  function closeRecoveryPopup(restoreFocus = true) {
    if (keyStatus === 'rotating') return;
    setIdentityConfirmationOpen(false);
    setRecoveryPopupOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => recoveryTriggerRef.current?.focus());
  }

  function openRecoveryRestoreFlow() {
    closeRecoveryPopup(false);
    openKeyBackup('import');
  }

  function openRecoveryIdentityFlow() {
    setIdentityConfirmationOpen(true);
  }

  function cancelRecoveryIdentityFlow() {
    if (keyStatus === 'rotating') return;
    setIdentityConfirmationOpen(false);
  }

  function closeKeyBackup() {
    if (keyBackupBusy) return;
    setKeyBackupOpen(false);
  }

  function updateKeyBackupFile(event: ChangeEvent<HTMLInputElement>) {
    setKeyBackupFile(event.target.files?.[0] ?? null);
    setKeyBackupMessage(null);
  }

  async function handleKeyBackupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKeyBackupMessage(null);
    if (keyBackupPassword.length < 10) {
      setKeyBackupMessage({ tone: 'bad', text: t.chat.recoveryPasswordTooShort });
      return;
    }
    if (keyBackupMode === 'export' && keyBackupPassword !== keyBackupConfirmPassword) {
      setKeyBackupMessage({ tone: 'bad', text: t.chat.recoveryPasswordsDoNotMatch });
      return;
    }
    if (keyBackupMode === 'export') await exportKeyBackup();
    else await importKeyBackup();
  }

  async function exportKeyBackup() {
    if (!localPrivateKey) {
      setKeyBackupMessage({ tone: 'bad', text: t.chat.backupExportFailed });
      return;
    }
    setKeyBackupBusy(true);
    try {
      const backup = await exportEncryptedChatKeyBackup(localPrivateKey, keyBackupPassword);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `pe-community-chat-key-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setKeyBackupMessage({ tone: 'good', text: t.chat.backupExported });
    } catch {
      setKeyBackupMessage({ tone: 'bad', text: t.chat.backupExportFailed });
    } finally {
      setKeyBackupBusy(false);
    }
  }

  async function importKeyBackup() {
    if (!currentUser || !keyBackupFile || !localDeviceIdentity || (localPrivateKey && !keyBackupReplaceConfirmed)) {
      setKeyBackupMessage({ tone: 'bad', text: t.chat.backupImportFailed });
      return;
    }
    setKeyBackupBusy(true);
    try {
      const imported = await importEncryptedChatKeyBackup(JSON.parse(await keyBackupFile.text()), keyBackupPassword);
      const candidate = { privateKey: imported.privateKey, publicKey: imported.publicKeyJson };
      await apiFetch('/chat/keys/restore/verify', {
        method: 'POST',
        body: JSON.stringify({ publicKey: imported.publicKeyJson }),
      });
      const previousPrivateKey = localPrivateKey ? await exportPrivateKey(localPrivateKey) : null;
      const previousPublicKey = localPublicKey;
      const localKey = await replaceLocalChatKey(currentUser.id, currentUser.communityId, imported.privateKeyJson, imported.publicKeyJson);
      try {
        await registerLocalChatKey(currentUser, candidate, 'restore', localDeviceIdentity);
      } catch (error) {
        if (previousPrivateKey && previousPublicKey) {
          await replaceLocalChatKey(currentUser.id, currentUser.communityId, previousPrivateKey, previousPublicKey);
        } else {
          await removeLocalChatKey(currentUser.id, currentUser.communityId);
        }
        throw error;
      }
      setLocalPrivateKey(localKey.privateKey);
      setLocalPublicKey(localKey.publicKey);
      setLocalKeyRing(await getLocalChatKeyRing(currentUser.id, currentUser.communityId));
      setKeyStatus('preparing');
      setKeyStatus('ready');
      if (activeConversationId) await loadKeysForConversation(activeConversationId);
      setKeyBackupMessage({ tone: 'good', text: t.chat.backupImported });
    } catch {
      setKeyStatus(localPrivateKey ? 'ready' : 'failed');
      setKeyBackupMessage({ tone: 'bad', text: t.chat.backupImportFailed });
    } finally {
      setKeyBackupBusy(false);
    }
  }

  useEffect(() => {
    debugChatWorkspace('chat-workspace-mounted', { admin });
    loadConversations();
    return () => {
      debugChatWorkspace('chat-workspace-unmounted', { admin });
    };
  }, [admin, t.chat.loadFailed]);

  useEffect(() => {
    debugChatWorkspace('conversation-list-render', {
      visibleCount: conversations.length,
      conversationIds: conversationIdsSignature,
      selectedConversationId: activeConversationId || null,
    });
  }, [activeConversationId, conversationIdsSignature, conversations.length, debugChatWorkspace]);

  useEffect(() => {
    if (!participantPickerOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeParticipantPicker();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [participantPickerOpen, startingChatUserId]);

  useEffect(() => {
    if (!startMenuOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (startMenuRef.current && !startMenuRef.current.contains(event.target as Node)) setStartMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setStartMenuOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [startMenuOpen]);

  useEffect(() => {
    let canceled = false;
    void prepareSecureKeys(() => canceled);
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setStarredMessages([]);
      setStarredMessagesOpen(false);
      setConversationSearchOpen(false);
      setConversationSearchQuery('');
      setDebouncedConversationSearchQuery('');
      return;
    }
    setStarredMessages([]);
    setStarredMessagesError('');
    setConversationSearchOpen(false);
    setConversationSearchQuery('');
    setDebouncedConversationSearchQuery('');
    let canceled = false;
    const conversationId = activeConversationId;
    async function loadMessages() {
      if (!canceled) await loadMessagesForConversation(conversationId);
    }
    loadMessages();
    return () => { canceled = true; };
  }, [activeConversationId]);

  useEffect(() => {
    stopTyping();
  }, [activeConversationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedConversationSearchQuery(conversationSearchQuery);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [conversationSearchQuery]);

  useEffect(() => {
    if (!conversationSearchOpen) return undefined;
    const focusTimer = window.setTimeout(() => conversationSearchInputRef.current?.focus(), 0);
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (conversationSearchRef.current?.contains(target)) return;
      closeConversationSearch();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeConversationSearch();
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [conversationSearchOpen]);

  useEffect(() => {
    return () => {
      if (highlightedMessageTimerRef.current) clearTimeout(highlightedMessageTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (connectionRevision === 0 || !activeConversationId) return;
    void loadPresenceForConversation(activeConversationId);
    void loadMessagesForConversation(activeConversationId);
    void loadConversations();
  }, [connectionRevision]);

  useEffect(() => {
    if (!activeConversationId || keyStatus !== 'ready') {
      setConversationKeys([]);
      return;
    }
    let canceled = false;
    const conversationId = activeConversationId;
    async function loadKeys() {
      if (!canceled) await loadKeysForConversation(conversationId);
    }
    loadKeys();
    return () => { canceled = true; };
  }, [keyStatus, activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    let canceled = false;
    const conversationId = activeConversationId;
    async function loadPresence() {
      if (!canceled) await loadPresenceForConversation(conversationId);
    }
    loadPresence();
    return () => { canceled = true; };
  }, [activeConversationId]);

  useEffect(() => {
    if (presenceUpdates.length === 0) return;
    setPresenceByUser((current) => {
      const next = { ...current };
      presenceUpdates.forEach((update) => {
        const previous = next[update.userId];
        next[update.userId] = {
          userId: update.userId,
          isOnline: update.isOnline,
          lastSeenAt: update.lastSeenAt ?? previous?.lastSeenAt ?? null,
        };
      });
      return next;
    });
  }, [presenceUpdates]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (!selectedConversation?.id || !latestMessage) return;
    markSeen(latestMessage.id);
    setConversations((current) => current.map((conversation) => conversation.id === selectedConversation.id ? { ...conversation, unreadCount: 0 } : conversation));
    dispatchChatUnreadRefresh();
  }, [markSeen, messages, selectedConversation?.id]);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (openMessageActionsId && !messages.some((message) => message.id === openMessageActionsId)) {
      setOpenMessageActionsId('');
    }
  }, [messages, openMessageActionsId]);

  useEffect(() => {
    if (editingMessage && !messages.some((message) => message.id === editingMessage.messageId && !message.deletedForEveryoneAt)) {
      setMessageText(editingMessage.draftText);
      setEditingMessage(null);
      setSendError('');
    }
  }, [editingMessage, messages]);

  useEffect(() => {
    if (deliveredUpdates.length === 0) return;
    setMessages((current) => current.map((message) => {
      const delivered = deliveredUpdates.find((update) => update.messageId === message.id);
      return delivered ? { ...message, deliveredAt: delivered.deliveredAt } : message;
    }));
  }, [deliveredUpdates]);

  useEffect(() => {
    if (seenUpdates.length === 0) return;
    setConversations((current) => current.map((conversation) => {
      const seen = seenUpdates.find((update) => update.conversationId === conversation.id);
      if (!seen) return conversation;
      return {
        ...conversation,
        participants: conversation.participants.map((participant) => participant.userId === seen.userId ? { ...participant, lastReadAt: seen.seenAt } : participant),
      };
    }));
  }, [seenUpdates]);

  useEffect(() => {
    if (!activeConversationId || keyStatus !== 'ready' || !currentUser || messages.length === 0) return;
    const messagesMissingKeys = messages.filter((message) => (
      message.conversationId === activeConversationId &&
      messageHydration[message.id]?.status === 'waiting-for-keys'
    ));
    if (messagesMissingKeys.length === 0) return;
    const refreshSignature = `${activeConversationId}:${messagesMissingKeys.map((message) => message.id).join(',')}`;
    if (conversationKeyRefreshRef.current === refreshSignature || conversationKeyRefreshAttemptRef.current === refreshSignature) return;
    conversationKeyRefreshRef.current = refreshSignature;
    conversationKeyRefreshAttemptRef.current = refreshSignature;
    debugChatPreview('keys-refresh-started', {
      source: messageSource(messagesMissingKeys[0]?.id ?? ''),
      conversationId: activeConversationId,
      reason: 'missing-peer-key',
    });
    void loadKeysForConversation(activeConversationId).then(() => {
      debugChatPreview('keys-refreshed', {
        source: messageSource(messagesMissingKeys[0]?.id ?? ''),
        conversationId: activeConversationId,
        hydrationState: 'retry-pending',
      });
    }).finally(() => {
      if (conversationKeyRefreshRef.current === refreshSignature) conversationKeyRefreshRef.current = null;
    });
  }, [activeConversationId, currentUser, debugChatPreview, keyStatus, messageHydration, messages]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    const shouldScroll = loadingMessages || messagesNearBottomRef.current || Boolean(latestMessage && isOwnMessage(latestMessage, currentUser?.id));
    if (shouldScroll) {
      scrollMessagesToLatest('auto');
      return;
    }
    updateScrollToLatestVisibility();
  }, [currentUser?.id, loadingMessages, messages, scrollMessagesToLatest, selectedConversation?.id, updateScrollToLatestVisibility]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return undefined;
    updateScrollToLatestVisibility();
    container.addEventListener('scroll', updateScrollToLatestVisibility, { passive: true });
    return () => container.removeEventListener('scroll', updateScrollToLatestVisibility);
  }, [selectedConversation?.id, updateScrollToLatestVisibility]);

  useEffect(() => {
    if (!selectedAttachmentFile || attachmentKindForFile(selectedAttachmentFile) !== 'photo') {
      setSelectedAttachmentPreviewUrl('');
      return;
    }
    const objectUrl = URL.createObjectURL(selectedAttachmentFile);
    setSelectedAttachmentPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedAttachmentFile]);

  useEffect(() => {
    const currentMediaAttachments = new Map<string, { message: ChatMessage; attachment: EncryptedAttachmentPayload }>();
    messages.forEach((message) => {
      if (message.deletedForEveryoneAt) return;
      const hydration = messageHydration[message.id];
      if (hydration?.status === 'waiting-for-keys' || hydration?.status === 'pending-metadata') return;
      const attachment = parseAttachmentPayload(decryptedMessages[message.id]);
      if (attachment && isPreviewableMediaAttachment(attachment) && !attachment.viewOnce) currentMediaAttachments.set(attachment.attachmentId, { message, attachment });
    });

    const nextPreviews = { ...imagePreviewsByAttachmentIdRef.current };
    Object.entries(nextPreviews).forEach(([attachmentId, preview]) => {
      if (currentMediaAttachments.has(attachmentId)) return;
      if (preview.objectUrl) URL.revokeObjectURL(preview.objectUrl);
      imagePreviewInFlightRef.current.get(attachmentId)?.controller.abort();
      imagePreviewInFlightRef.current.delete(attachmentId);
      delete nextPreviews[attachmentId];
    });
    replaceImagePreviewState(nextPreviews);

    currentMediaAttachments.forEach(({ message, attachment }, attachmentId) => {
      const existing = imagePreviewsByAttachmentIdRef.current[attachmentId];
      if (existing?.status === 'loading' || existing?.status === 'loaded' || existing?.status === 'error') return;
      ensureNormalImagePreview(message, attachment, messageSource(message.id));
    });
  }, [decryptedMessages, messageHydration, messages]);

  useEffect(() => {
    return () => {
      Object.values(imagePreviewsByAttachmentIdRef.current).forEach((preview) => {
        if (preview.objectUrl) URL.revokeObjectURL(preview.objectUrl);
      });
      imagePreviewInFlightRef.current.forEach((load) => load.controller.abort());
      imagePreviewInFlightRef.current.clear();
      imagePreviewsByAttachmentIdRef.current = {};
    };
  }, []);

  useEffect(() => {
    return () => {
      if (viewOnceImagePreview?.url) URL.revokeObjectURL(viewOnceImagePreview.url);
    };
  }, [viewOnceImagePreview]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
  }, [messageText]);

  useEffect(() => {
    if (!currentUser || !localPrivateKey || conversationKeys.length === 0 || messages.length === 0) {
      setDecryptedMessages({});
      setMessageHydration({});
      return;
    }
    const activeUser = currentUser;
    const activePrivateKey = localPrivateKey;
    let canceled = false;
    async function decryptMessages() {
      const next: Record<string, string> = {};
      const nextHydration: Record<string, MessageHydration> = {};
      for (const message of messages) {
        const source = messageSource(message.id);
        if (message.deletedForEveryoneAt) {
          nextHydration[message.id] = { status: 'hydrated', reason: 'deleted-for-everyone' };
          continue;
        }
        debugChatPreview('message-hydration-started', {
          source,
          messageId: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          hydrationState: 'pending-metadata',
        });
        if (!message.encryptedPayload || !message.encryptionNonce) {
          nextHydration[message.id] = { status: 'pending-metadata', reason: 'missing-encrypted-payload' };
          continue;
        }
        if (message.encryptionAlgorithmVersion !== CHAT_ENCRYPTION_ALGORITHM) {
          nextHydration[message.id] = { status: 'error', reason: 'unsupported-message-algorithm' };
          next[message.id] = t.chat.decryptFailed;
          continue;
        }
        const peerKey = publicKeyForMessage(message, activeUser.id, selectedConversation, conversationKeys);
        const messagePrivateKey = privateKeyForMessage(message, activeUser.id, conversationKeys, localKeyRing) ?? activePrivateKey;
        if (!peerKey || !messagePrivateKey) {
          nextHydration[message.id] = { status: 'waiting-for-keys', reason: 'missing-peer-key' };
          debugChatPreview('missing-key-detected', {
            source,
            messageId: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            hasSenderKey: false,
            hydrationState: 'waiting-for-keys',
            reason: 'missing-peer-key',
          });
          continue;
        }
        try {
          const decryptedMessage = isGroupEncryptedMessage(message)
            ? await decryptGroupMessagePayload(message, activeUser.id, messagePrivateKey, peerKey.publicKey)
            : await decryptDirectMessagePayload(message, messagePrivateKey, peerKey.publicKey);
          next[message.id] = decryptedMessage;
          nextHydration[message.id] = { status: 'hydrated' };
          debugChatPreview('message-decrypted', {
            source,
            messageId: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            hasSenderKey: true,
            hydrationState: 'hydrated',
          });
          const attachment = parseAttachmentPayload(decryptedMessage);
          if (attachment) {
            debugChatPreview('attachment-metadata-parsed', {
              source,
              messageId: message.id,
              conversationId: message.conversationId,
              senderId: message.senderId,
              attachmentId: attachment.attachmentId,
              attachmentKind: attachment.attachmentType,
              viewOnce: attachment.viewOnce === true,
              hydrationState: 'hydrated',
            });
            ensureNormalImagePreview(message, attachment, source);
          }
        } catch {
          next[message.id] = t.chat.decryptFailed;
          nextHydration[message.id] = { status: 'error', reason: 'message-decrypt-failed' };
          debugChatPreview('message-hydration-error', {
            source,
            messageId: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            hydrationState: 'error',
            reason: 'message-decrypt-failed',
          });
        }
      }
      if (!canceled) {
        setDecryptedMessages(next);
        setMessageHydration(nextHydration);
      }
    }
    decryptMessages();
    return () => { canceled = true; };
  }, [conversationKeys, currentUser, localKeyRing, localPrivateKey, messages, selectedConversation, t.chat.decryptFailed]);

  async function handleSendSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage();
  }

  async function sendMessage() {
    const plaintext = messageText.trim();
    if (composerSendBlocked) {
      setSendError(blockedComposerMessage || t.chat.cannotSendToBlockedUser);
      return;
    }
    if (editingMessage) {
      await saveEditedMessage(plaintext);
      return;
    }
    if ((!plaintext && !selectedAttachmentFile) || !localPrivateKey || !composerReady || !selectedConversation) return;
    setSending(true);
    setSendError('');
    if (selectedAttachmentFile) setAttachmentComposerStatus('encrypting');
    try {
      const attachmentPayload = selectedAttachmentFile
        ? await uploadEncryptedAttachment(selectedConversation.id, selectedAttachmentFile)
        : null;
      const outboundPlaintext = buildOutboundMessagePayload({
        text: attachmentPayload ? '' : plaintext,
        attachment: attachmentPayload,
        replyToMessageId: replyTarget?.deletedForEveryoneAt ? '' : replyTarget?.id ?? '',
      });
      if (selectedAttachmentFile) setAttachmentComposerStatus('sending');
      const encrypted = isGroupConversation(selectedConversation)
        ? await encryptGroupMessagePayload(outboundPlaintext, localPrivateKey, localDeviceKey, groupRecipientKeys)
        : await encryptDirectMessagePayload(outboundPlaintext, localPrivateKey, localDeviceKey, recipientKey);
      const sent = sendEncryptedMessage(encrypted);
      if (!sent) throw new Error('Socket unavailable.');
      setMessageText('');
      setSelectedAttachmentFile(null);
      setSelectedAttachmentKind(null);
      setSelectedAttachmentViewOnce(false);
      setAttachmentTransferProgress(null);
      setAttachmentComposerStatus('sent');
      setReplyTargetId('');
      stopTyping();
    } catch {
      setSendError(selectedAttachmentFile ? t.chat.attachmentUploadFailed : t.chat.sendFailed);
      if (selectedAttachmentFile) toast.error(t.chat.uploadFailed);
      if (selectedAttachmentFile) setAttachmentComposerStatus('failed');
      if (selectedAttachmentFile) setAttachmentTransferProgress(null);
    } finally {
      setSending(false);
    }
  }

  async function saveEditedMessage(plaintext: string) {
    if (!plaintext || !localPrivateKey || !localDeviceKey || !recipientKey || !composerReady || !selectedConversation || !editingTarget) return;
    const restoredDraft = editingMessage?.draftText ?? '';
    const originalDecrypted = decryptedMessages[editingTarget.id];
    const replyToMessageId = replyTargetIdFromPayload(originalDecrypted);
    setSending(true);
    setSendError('');
    try {
      const outboundPlaintext = buildOutboundMessagePayload({
        text: plaintext,
        attachment: null,
        replyToMessageId,
      });
      const encrypted = await encryptDirectMessagePayload(outboundPlaintext, localPrivateKey, localDeviceKey, recipientKey);
      const editedMessage = await editRealtimeMessage(editingTarget.id, encrypted);
      if (editedMessage) {
        handleRealtimeEditedMessage(editedMessage);
      } else {
        const response = await apiFetch<{ message: ChatMessage }>(`/chat/conversations/${selectedConversation.id}/messages/${editingTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(encrypted),
        });
        handleRealtimeEditedMessage(response.message);
      }
      toast.success(t.chat.messageUpdated);
      setMessageText(restoredDraft);
      setEditingMessage(null);
      stopTyping();
    } catch {
      toast.error(t.chat.messageEditFailed);
    } finally {
      setSending(false);
    }
  }

  function startEditingMessage(message: ChatMessage) {
    const text = messageTextFromPayload(decryptedMessages[message.id]).trim();
    if (!canEditMessage(message, currentUser?.id, decryptedMessages)) {
      setMessageActionError({ messageId: message.id, text: t.chat.messageEditExpired });
      return;
    }
    setEditingMessage({ messageId: message.id, draftText: messageText });
    setReplyTargetId('');
    setSelectedAttachmentFile(null);
    setSelectedAttachmentKind(null);
    setSelectedAttachmentViewOnce(false);
    setAttachmentComposerStatus('idle');
    setMessageText(text);
    setOpenMessageActionsId('');
    window.requestAnimationFrame(() => composerTextareaRef.current?.focus());
  }

  function cancelEditingMessage() {
    if (!editingMessage) return;
    setMessageText(editingMessage.draftText);
    setEditingMessage(null);
    setSendError('');
  }

  async function uploadEncryptedAttachment(conversationId: string, file: File): Promise<EncryptedAttachmentPayload> {
    const encryptedAttachment = await encryptChatAttachment(file);
    setAttachmentComposerStatus('uploading');
    const attachmentKind = selectedAttachmentKind ?? attachmentKindForFile(file);
    const viewOnce = attachmentKind === 'photo' && selectedAttachmentViewOnce;
    const body = new FormData();
    body.append('file', encryptedAttachment.encryptedBlob, 'encrypted-chat-attachment.bin');
    body.append('encryptionNonce', encryptedAttachment.fileNonce);
    body.append('encryptionAlgorithmVersion', encryptedAttachment.encryptionAlgorithmVersion);
    body.append('mediaCategory', attachmentKind);
    if (viewOnce) body.append('viewOnce', 'true');
    setAttachmentTransferProgress({ kind: 'upload', percent: null });
    const uploaded = await uploadChatAttachmentWithProgress(conversationId, body, (percent) => {
      setAttachmentTransferProgress({ kind: 'upload', percent });
    });
    return {
      kind: 'attachment',
      attachmentId: uploaded.attachment.id,
      fileName: file.name || t.chat.encryptedAttachment,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      attachmentType: attachmentKind,
      viewOnce,
      fileKey: encryptedAttachment.fileKey,
      fileNonce: encryptedAttachment.fileNonce,
      attachmentAlgorithm: CHAT_ATTACHMENT_ENCRYPTION_ALGORITHM,
    };
  }

  function updateAttachmentFile(file: File | null, pickerKind: AttachmentPickerKind) {
    setSendError('');
    setEmojiPickerOpen(false);
    if (!file) {
      setSelectedAttachmentFile(null);
      setSelectedAttachmentKind(null);
      setSelectedAttachmentViewOnce(false);
      setAttachmentComposerStatus('idle');
      setAttachmentTransferProgress(null);
      return;
    }
    if (file.size > maxPlainAttachmentSize) {
      setSendError(t.chat.attachmentTooLarge);
      setAttachmentComposerStatus('failed');
      return;
    }
    const attachmentKind = attachmentKindForFile(file);
    if (!isAllowedAttachment(file, pickerKind)) {
      setSendError(t.chat.attachmentTypeUnsupported);
      setAttachmentComposerStatus('failed');
      return;
    }
    setSelectedAttachmentFile(file);
    setSelectedAttachmentKind(attachmentKind);
    setSelectedAttachmentViewOnce(attachmentKind === 'photo' && !isGroupConversation(selectedConversation) ? selectedAttachmentViewOnce : false);
    setAttachmentComposerStatus('selected');
  }

  function removeSelectedAttachment() {
    setSelectedAttachmentFile(null);
    setSelectedAttachmentKind(null);
    setSelectedAttachmentViewOnce(false);
    setAttachmentComposerStatus('idle');
    setAttachmentTransferProgress(null);
    setSendError('');
  }

  async function fetchDecryptedAttachmentUrl(message: ChatMessage, attachment: EncryptedAttachmentPayload, signal?: AbortSignal, onProgress?: (percent: number | null) => void) {
    let response: Response;
    try {
      response = await fetch(apiUrl(`/chat/conversations/${message.conversationId}/attachments/${attachment.attachmentId}`), {
        credentials: 'include',
        cache: 'no-store',
        signal,
      });
    } catch (error) {
      debugChatPreview('attachment-fetch-failed', {
        source: messageSource(message.id),
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        attachmentId: attachment.attachmentId,
        attachmentKind: attachment.attachmentType,
        viewOnce: attachment.viewOnce === true,
        reason: error instanceof Error ? error.name : 'fetch-failed',
      });
      throw error;
    }
    if (!response.ok) {
      debugChatPreview('attachment-fetch-failed', {
        source: messageSource(message.id),
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        attachmentId: attachment.attachmentId,
        attachmentKind: attachment.attachmentType,
        viewOnce: attachment.viewOnce === true,
        reason: `http-${response.status}`,
      });
      throw new Error('Attachment download failed.');
    }
    debugChatPreview('attachment-fetch-succeeded', {
      source: messageSource(message.id),
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      attachmentId: attachment.attachmentId,
      attachmentKind: attachment.attachmentType,
      viewOnce: false,
    });
    let decrypted: ArrayBuffer;
    try {
      decrypted = await decryptChatAttachment(await responseArrayBufferWithProgress(response, onProgress), attachment.fileKey, attachment.fileNonce);
    } catch (error) {
      debugChatPreview('attachment-decrypt-failed', {
        source: messageSource(message.id),
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        attachmentId: attachment.attachmentId,
        attachmentKind: attachment.attachmentType,
        viewOnce: false,
        reason: error instanceof Error ? error.name : 'decrypt-failed',
      });
      throw error;
    }
    debugChatPreview('attachment-decrypt-succeeded', {
      source: messageSource(message.id),
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      attachmentId: attachment.attachmentId,
      attachmentKind: attachment.attachmentType,
      viewOnce: attachment.viewOnce === true,
    });
    const objectUrl = URL.createObjectURL(new Blob([decrypted], { type: attachment.mimeType || 'application/octet-stream' }));
    debugChatPreview('object-url-created', {
      source: messageSource(message.id),
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      attachmentId: attachment.attachmentId,
      attachmentKind: attachment.attachmentType,
      viewOnce: attachment.viewOnce === true,
    });
    return objectUrl;
  }

  function ensureNormalImagePreview(
    message: ChatMessage,
    attachment: EncryptedAttachmentPayload,
    source: ChatPreviewSource,
    options: { force?: boolean } = {},
  ) {
    if (!isPreviewableMediaAttachment(attachment) || attachment.viewOnce) return;
    const attachmentId = attachment.attachmentId;
    const existing = imagePreviewsByAttachmentIdRef.current[attachmentId];
    const inFlight = imagePreviewInFlightRef.current.get(attachmentId);
    const ageMs = existing?.startedAt ? Date.now() - existing.startedAt : inFlight ? Date.now() - inFlight.startedAt : 0;
    if (existing?.status === 'loaded' && existing.objectUrl && !options.force) {
      debugChatPreview('image-preview-registration-skipped', {
        source,
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        attachmentId,
        attachmentKind: attachment.attachmentType,
        viewOnce: false,
        previewState: existing.status,
        currentStatus: existing.status,
        hasObjectUrl: true,
        startedAt: existing.startedAt ?? null,
        ageMs,
        inFlight: Boolean(inFlight),
        reason: 'already-loaded',
      });
      return;
    }
    if (existing?.status === 'loading' && inFlight && ageMs < imagePreviewLoadTimeoutMs && !options.force) {
      debugChatPreview('image-preview-registration-skipped', {
        source,
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        attachmentId,
        attachmentKind: attachment.attachmentType,
        viewOnce: false,
        previewState: existing.status,
        currentStatus: existing.status,
        hasObjectUrl: Boolean(existing.objectUrl),
        startedAt: existing.startedAt ?? inFlight.startedAt,
        ageMs,
        inFlight: true,
        reason: 'already-loading',
      });
      return;
    }
    if (existing?.status === 'error' && !options.force) {
      debugChatPreview('image-preview-registration-skipped', {
        source,
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        attachmentId,
        attachmentKind: attachment.attachmentType,
        viewOnce: false,
        previewState: existing.status,
        currentStatus: existing.status,
        hasObjectUrl: Boolean(existing.objectUrl),
        startedAt: existing.startedAt ?? null,
        ageMs,
        inFlight: Boolean(inFlight),
        reason: 'error-awaiting-retry',
      });
      return;
    }
    if (inFlight) {
      inFlight.controller.abort();
      imagePreviewInFlightRef.current.delete(attachmentId);
    }
    if (existing?.objectUrl) URL.revokeObjectURL(existing.objectUrl);
    const token = Symbol(attachmentId);
    const startedAt = Date.now();
    const controller = new AbortController();
    imagePreviewInFlightRef.current.set(attachmentId, { token, startedAt, controller });
    updateImagePreviewState(attachmentId, () => ({
      attachmentId,
      messageId: message.id,
      status: 'loading',
      startedAt,
    }));
    debugChatPreview('image-preview-registered', {
      source,
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      attachmentId,
      attachmentKind: attachment.attachmentType,
      viewOnce: false,
      previewState: 'loading',
      currentStatus: existing?.status ?? 'idle',
      hasObjectUrl: Boolean(existing?.objectUrl),
      startedAt,
      ageMs: 0,
      inFlight: true,
      reason: options.force ? 'forced' : 'started',
    });
    debugChatPreview('preview-load-started', {
      source,
      messageId: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      attachmentId,
      attachmentKind: attachment.attachmentType,
      viewOnce: false,
      previewState: 'loading',
    });
    const timeout = window.setTimeout(() => {
      if (imagePreviewInFlightRef.current.get(attachmentId)?.token !== token) return;
      controller.abort();
      imagePreviewInFlightRef.current.delete(attachmentId);
      updateImagePreviewState(attachmentId, () => ({
        attachmentId,
        messageId: message.id,
        status: 'error',
        error: true,
        errorMessage: t.chat.mediaOpenFailed,
        startedAt,
      }));
      debugChatPreview('preview-state-error', {
        source,
        messageId: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        attachmentId,
        attachmentKind: attachment.attachmentType,
        viewOnce: false,
        previewState: 'error',
        reason: 'timeout',
      });
    }, imagePreviewLoadTimeoutMs);
    void fetchDecryptedAttachmentUrl(message, attachment, controller.signal)
      .then(async (objectUrl) => {
        try {
          const remainingLoadTime = imagePreviewLoadTimeoutMs - (Date.now() - startedAt);
          if (remainingLoadTime <= 0) throw new Error('Image preview timed out.');
          if (isVideoAttachment(attachment)) await waitForVideoUrl(objectUrl, remainingLoadTime);
          else await waitForImageUrl(objectUrl, remainingLoadTime);
          debugChatPreview('media-preview-ready', {
            source: messageSource(message.id),
            messageId: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            attachmentId,
            attachmentKind: attachment.attachmentType,
            viewOnce: false,
          });
        } catch {
          debugChatPreview('media-preview-load-failed', {
            source: messageSource(message.id),
            messageId: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            attachmentId,
            attachmentKind: attachment.attachmentType,
            viewOnce: false,
            reason: 'decode-or-load-failed',
          });
          URL.revokeObjectURL(objectUrl);
          throw new Error('Media could not be loaded.');
        }
        if (imagePreviewInFlightRef.current.get(attachmentId)?.token !== token) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const current = imagePreviewsByAttachmentIdRef.current[attachmentId];
        if (!current || current.messageId !== message.id) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        imagePreviewInFlightRef.current.delete(attachmentId);
        updateImagePreviewState(attachmentId, () => ({
          ...current,
          status: 'loaded',
          objectUrl,
          loadedAt: Date.now(),
        }));
        debugChatPreview('preview-state-loaded', {
          source: messageSource(message.id),
          messageId: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          attachmentId,
          attachmentKind: attachment.attachmentType,
          viewOnce: false,
          previewState: 'loaded',
        });
      })
      .catch((error: unknown) => {
        if (imagePreviewInFlightRef.current.get(attachmentId)?.token !== token) return;
        imagePreviewInFlightRef.current.delete(attachmentId);
        updateImagePreviewState(attachmentId, () => ({
          attachmentId,
          messageId: message.id,
          status: 'error',
          error: true,
          errorMessage: t.chat.mediaOpenFailed,
          startedAt,
        }));
        debugChatPreview('preview-state-error', {
          source: messageSource(message.id),
          messageId: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          attachmentId,
          attachmentKind: attachment.attachmentType,
          viewOnce: false,
          previewState: 'error',
          reason: error instanceof Error ? error.message : 'preview-load-failed',
        });
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });
  }

  function retryImageAttachmentPreview(message: ChatMessage, attachment: EncryptedAttachmentPayload) {
    const previous = imagePreviewsByAttachmentIdRef.current[attachment.attachmentId];
    if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);
    imagePreviewInFlightRef.current.get(attachment.attachmentId)?.controller.abort();
    imagePreviewInFlightRef.current.delete(attachment.attachmentId);
    updateImagePreviewState(attachment.attachmentId, () => null);
    ensureNormalImagePreview(message, attachment, 'retry', { force: true });
  }

  async function openViewOnceAttachment(message: ChatMessage, attachment: EncryptedAttachmentPayload) {
    if (viewOnceOpeningAttachmentId || openedAttachmentIds.has(attachment.attachmentId)) return;
    setViewOnceOpeningAttachmentId(attachment.attachmentId);
    setViewOnceFailedAttachmentId('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), attachmentOperationTimeoutMs);
    try {
      const response = await fetch(apiUrl(`/chat/conversations/${message.conversationId}/attachments/${attachment.attachmentId}/open`), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 409) {
        setOpenedAttachmentIds((current) => new Set([...current, attachment.attachmentId]));
        return;
      }
      if (!response.ok) throw new Error('View-once attachment open failed.');
      const decrypted = await decryptChatAttachment(await response.arrayBuffer(), attachment.fileKey, attachment.fileNonce);
      const objectUrl = URL.createObjectURL(new Blob([decrypted], { type: attachment.mimeType || 'application/octet-stream' }));
      setViewOnceImagePreview({ url: objectUrl, name: attachment.fileName, attachmentId: attachment.attachmentId });
    } catch {
      setViewOnceFailedAttachmentId(attachment.attachmentId);
    } finally {
      window.clearTimeout(timeout);
      setViewOnceOpeningAttachmentId('');
    }
  }

  function closeViewOncePreview() {
    setViewOnceImagePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      const attachmentId = current?.attachmentId;
      if (attachmentId) setOpenedAttachmentIds((ids) => new Set([...ids, attachmentId]));
      return null;
    });
  }

  function downloadImagePreview() {
    if (!imagePreview?.url) return;
    setImagePreviewDownloadError('');
    try {
      const link = document.createElement('a');
      link.href = imagePreview.url;
      link.download = imagePreview.downloadName || fallbackImageFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setImagePreviewDownloadError(t.chat.imageDownloadFailed);
      toast.error(t.chat.downloadFailed);
    }
  }

  function openAttachmentMediaPreview(message: ChatMessage, attachment: EncryptedAttachmentPayload, objectUrl: string) {
    const sender = selectedConversation?.participants.find((participant) => participant.userId === message.senderId) ?? null;
    setImagePreviewDownloadError('');
    setImagePreview({
      url: objectUrl,
      name: attachment.fileName,
      downloadName: attachment.fileName || fallbackImageFileName(attachment.mimeType),
      kind: isVideoAttachment(attachment) ? 'video' : 'image',
      messageId: message.id,
      conversationId: message.conversationId,
      attachment,
      sender: {
        name: sender?.name ?? messageAuthorLabel(message, selectedConversation ?? null, currentUser?.id, t),
        avatarUrl: sender?.avatarUrl ?? null,
        dicebearStyle: sender?.dicebearStyle ?? null,
        dicebearSeed: sender?.dicebearSeed ?? null,
      },
      timestampLabel: formatDate(message.createdAt, locale),
      starred: Boolean(message.starred),
    });
  }

  async function downloadAttachment(message: ChatMessage, attachment: EncryptedAttachmentPayload) {
    if (downloadingAttachmentMessageId) return;
    setDownloadingAttachmentMessageId(message.id);
    setDownloadFailedAttachmentMessageId('');
    setAttachmentTransferProgress({ kind: 'download', messageId: message.id, percent: null });
    setSendError('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), attachmentOperationTimeoutMs);
    try {
      const objectUrl = await fetchDecryptedAttachmentUrl(message, attachment, controller.signal, (percent) => {
        setAttachmentTransferProgress({ kind: 'download', messageId: message.id, percent });
      });
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = attachment.fileName || t.chat.encryptedAttachment;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadFailedAttachmentMessageId(message.id);
      toast.error(t.chat.downloadFailed);
    } finally {
      window.clearTimeout(timeout);
      setDownloadingAttachmentMessageId('');
      setAttachmentTransferProgress((current) => current?.kind === 'download' && current.messageId === message.id ? null : current);
    }
  }

  async function copyMessageText(message: ChatMessage) {
    const text = messageTextFromPayload(decryptedMessages[message.id]).trim();
    if (!text || message.deletedForEveryoneAt) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error(t.chat.copyFailed);
    } finally {
      setOpenMessageActionsId('');
    }
  }

  function openMessageDeleteConfirmation(message: ChatMessage) {
    setMessageActionError(null);
    setOpenMessageActionsId('');
    setConfirmingMessageAction({ messageId: message.id });
  }

  function openMessageReport(message: ChatMessage) {
    setMessageActionError(null);
    setOpenMessageActionsId('');
    setReportReason('spam');
    setReportNote('');
    setReportingMessage(message);
  }

  async function submitMessageReport() {
    if (!selectedConversation || !reportingMessage || submittingReport) return;
    setSubmittingReport(true);
    try {
      await apiFetch(`/chat/conversations/${selectedConversation.id}/messages/${reportingMessage.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reportReason, note: reportNote.trim() || null }),
      });
      setReportingMessage(null);
      setReportNote('');
      setReportReason('spam');
      toast.success(t.chat.reportSubmitted);
    } catch {
      toast.error(t.chat.reportSubmitFailed);
    } finally {
      setSubmittingReport(false);
    }
  }

  async function confirmMessageAction(action: 'delete-for-me' | 'delete-for-everyone') {
    if (!selectedConversation || !confirmingMessageAction || messageActionBusyId) return;
    const { messageId } = confirmingMessageAction;
    const message = messages.find((item) => item.id === messageId);
    if (action === 'delete-for-everyone' && !canDeleteForEveryone(message ?? null, currentUser?.id)) {
      setMessageActionError({ messageId, text: t.chat.deleteForEveryoneExpired });
      return;
    }
    setMessageActionBusyId(messageId);
    setMessageActionError(null);
    try {
      if (action === 'delete-for-me') {
        await apiFetch(`/chat/conversations/${selectedConversation.id}/messages/${messageId}/delete-for-me`, { method: 'PATCH' });
        setMessages((current) => current.filter((message) => message.id !== messageId));
        setStarredMessages((current) => current.filter((message) => message.id !== messageId));
        setReplyTargetId((current) => current === messageId ? '' : current);
        setOpenMessageActionsId((current) => current === messageId ? '' : current);
        setDecryptedMessages((current) => {
          const next = { ...current };
          delete next[messageId];
          return next;
        });
        toast.success(t.chat.messageDeleted);
        setConfirmingMessageAction(null);
        return;
      }
      const sent = deleteMessageForEveryone(messageId);
      if (!sent) {
        const response = await apiFetch<{ message: ChatMessage }>(`/chat/conversations/${selectedConversation.id}/messages/${messageId}/delete-for-everyone`, { method: 'PATCH' });
        handleRealtimeDeletedMessage(response.message);
      }
      toast.success(t.chat.messageDeleted);
      setConfirmingMessageAction(null);
    } catch {
      setMessageActionError({
        messageId,
        text: action === 'delete-for-everyone' ? t.chat.deleteForEveryoneExpired : t.chat.messageDeleteFailed,
      });
      toast.error(t.chat.messageDeleteFailed);
    } finally {
      setMessageActionBusyId('');
    }
  }

  async function toggleMessageReaction(message: ChatMessage, emoji: string) {
    if (!selectedConversation || message.deletedForEveryoneAt || messageActionBusyId) return;
    setMessageActionBusyId(message.id);
    try {
      const update = await setRealtimeMessageReaction(message.id, emoji);
      if (update) {
        handleRealtimeReaction(update);
      } else {
        const response = await apiFetch<ChatReactionUpdate>(`/chat/conversations/${selectedConversation.id}/messages/${message.id}/reaction`, {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        });
        handleRealtimeReaction(response);
      }
    } catch {
      toast.error(t.chat.reactionSaveFailed);
    } finally {
      setMessageActionBusyId('');
      setOpenMessageActionsId('');
    }
  }

  async function toggleMessageStar(message: ChatMessage) {
    if (!selectedConversation || message.deletedForEveryoneAt || messageActionBusyId) return;
    setMessageActionBusyId(message.id);
    try {
      const response = await apiFetch<ChatMessageStarResponse>(`/chat/conversations/${selectedConversation.id}/messages/${message.id}/star`, { method: 'POST' });
      setMessages((current) => current.map((item) => (
        item.id === response.messageId ? { ...item, starred: response.starred } : item
      )));
      setStarredMessages((current) => {
        if (!response.starred) return current.filter((item) => item.id !== response.messageId);
        const nextMessage = { ...message, starred: true };
        return current.some((item) => item.id === response.messageId)
          ? current.map((item) => item.id === response.messageId ? nextMessage : item)
          : [nextMessage, ...current];
      });
      toast.success(response.starred ? t.chat.messageStarred : t.chat.messageUnstarred);
    } catch {
      toast.error(t.chat.starUpdateFailed);
    } finally {
      setMessageActionBusyId('');
      setOpenMessageActionsId('');
    }
  }

  function scrollToMessage(messageId: string) {
    const target = messagesContainerRef.current?.querySelector(`[data-chat-message-id="${messageId}"]`);
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    if (highlightedMessageTimerRef.current) clearTimeout(highlightedMessageTimerRef.current);
    highlightedMessageTimerRef.current = setTimeout(() => {
      setHighlightedMessageId((current) => current === messageId ? '' : current);
      highlightedMessageTimerRef.current = null;
    }, 1800);
    return true;
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendMessage();
  }

  function insertEmoji(emojiData: EmojiClickData) {
    const emoji = emojiData.emoji;
    const textarea = composerTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? messageText.length;
    const selectionEnd = textarea?.selectionEnd ?? messageText.length;
    const nextMessage = `${messageText.slice(0, selectionStart)}${emoji}${messageText.slice(selectionEnd)}`;
    const nextCursor = selectionStart + emoji.length;
    updateMessageText(nextMessage);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
      composerTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function updateMessageText(value: string) {
    setMessageText(value);
    if (!composerReady || !value.trim()) {
      stopTyping();
      return;
    }
    sendTypingStart();
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      sendTypingStop();
      typingStopTimerRef.current = null;
    }, 1800);
  }

  function stopTyping() {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    sendTypingStop();
  }

  function openConversationConfirmation(action: ConversationManagementAction) {
    setConversationActionsOpen(false);
    setConfirmingConversationAction(action);
  }

  async function runConversationAction() {
    if (!selectedConversation || !confirmingConversationAction || conversationActionBusy) return;
    const conversationId = selectedConversation.id;
    const action = confirmingConversationAction;
    setConversationActionBusy(true);
    try {
      if (action === 'clear') {
        await apiFetch(`/chat/conversations/${conversationId}/clear`, { method: 'PATCH' });
        setMessages([]);
        await loadMessagesForConversation(conversationId);
        toast.success(t.chat.chatCleared);
      } else {
        await apiFetch(`/chat/conversations/${conversationId}/delete-for-me`, { method: 'PATCH' });
        stopTyping();
        setSelectedConversationId('');
        setMessages([]);
        setStarredMessages([]);
        setStarredMessagesOpen(false);
        setConversationKeys([]);
        setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
        toast.success(t.chat.conversationDeleted);
      }
      dispatchChatUnreadRefresh();
      setConfirmingConversationAction(null);
    } catch {
      toast.error(action === 'clear' ? t.chat.chatClearFailed : t.chat.conversationDeleteFailed);
    } finally {
      setConversationActionBusy(false);
    }
  }

  useEffect(() => {
    if (!conversationActionsOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (conversationActionsRef.current && !conversationActionsRef.current.contains(event.target as Node)) setConversationActionsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setConversationActionsOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [conversationActionsOpen]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    function handleMouseDown(event: MouseEvent) {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) setAttachmentMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setAttachmentMenuOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachmentMenuOpen]);

  const updateEmojiPickerPosition = useCallback(() => {
    const buttonRect = emojiButtonRef.current?.getBoundingClientRect();
    const panelRect = activeChatPanelRef.current?.getBoundingClientRect();
    if (!buttonRect || !panelRect) return;

    const viewportInset = 8;
    const panelInset = 8;
    const anchorGap = 12;
    const panelLeft = Math.max(viewportInset, panelRect.left + panelInset);
    const panelRight = Math.min(window.innerWidth - viewportInset, panelRect.right - panelInset);
    const panelTop = Math.max(viewportInset, panelRect.top + panelInset);
    const width = Math.min(360, Math.max(0, panelRight - panelLeft));
    const availableHeight = Math.max(0, buttonRect.top - anchorGap - panelTop);
    const height = Math.min(420, window.innerHeight * 0.6, availableHeight);

    if (width <= 0 || height <= 0) {
      setEmojiPickerPosition(null);
      return;
    }

    const preferredLeft = buttonRect.right - width;
    const left = Math.min(Math.max(preferredLeft, panelLeft), panelRight - width);
    setEmojiPickerPosition({
      top: Math.max(panelTop, buttonRect.top - anchorGap - height),
      left,
      width,
      height,
    });
  }, []);

  useLayoutEffect(() => {
    if (!emojiPickerOpen) {
      setEmojiPickerPosition(null);
      return;
    }

    updateEmojiPickerPosition();
    window.addEventListener('resize', updateEmojiPickerPosition);
    window.addEventListener('scroll', updateEmojiPickerPosition, true);
    return () => {
      window.removeEventListener('resize', updateEmojiPickerPosition);
      window.removeEventListener('scroll', updateEmojiPickerPosition, true);
    };
  }, [emojiPickerOpen, updateEmojiPickerPosition]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (emojiPickerRef.current?.contains(target) || emojiButtonRef.current?.contains(target)) return;
      setEmojiPickerOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setEmojiPickerOpen(false);
      window.requestAnimationFrame(() => composerTextareaRef.current?.focus());
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [emojiPickerOpen]);

  const renderConversationRows = (items: ChatConversation[]) => items.map((conversation) => {
    const active = selectedConversation?.id === conversation.id;
    const unread = conversation.unreadCount ?? 0;
    const pinned = pinnedConversationIdSet.has(conversation.id);
    const muted = conversationMuted(conversation, currentUser?.id);
    const activeMessagePreview = active ? latestConversationMessagePreview(messages, decryptedMessages, conversation.id, t, openedAttachmentIds) : null;
    const preview = conversationPreview(conversation, currentUser?.id, t, activeMessagePreview);
    const recipient = conversationRecipient(conversation, currentUser?.id);
    const label = conversationRecipientLabel(conversation, currentUser?.id, t.chat.directConversation);
    return (
      <div
        key={conversation.id}
        className={`group/conversation relative rounded-xl border transition ${active ? 'border-accent/25 bg-accent/12' : unread > 0 ? 'border-accent/20 bg-accent/[0.08] hover:border-accent/30 hover:bg-accent/10' : 'border-white/10 bg-white/[0.035] hover:border-white/15 hover:bg-white/[0.055]'}`}
      >
        <div className="flex min-w-0 items-stretch">
          <button
            type="button"
            onClick={() => selectConversation(conversation.id)}
            className="min-w-0 flex-1 px-3 py-3 pr-10 text-left"
          >
            <div className="flex min-w-0 items-center gap-3">
              <ConversationAvatar conversation={conversation} participant={recipient} fallback={label} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className={`truncate text-sm font-semibold ${unread > 0 ? 'text-white' : 'text-white/88'}`}>{label}</p>
                  {unread > 0 && <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-black text-[#04100b]">{unread > 99 ? '99+' : unread}</span>}
                </div>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                  <p className={`truncate text-xs ${unread > 0 ? 'font-semibold text-accent' : 'text-white/45'}`}>{preview}</p>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/35">
                    {muted && <BellOff size={12} className="text-white/32" aria-label={t.chat.muted} />}
                    {conversation.lastMessageAt && <span>{formatTime(conversation.lastMessageAt, locale)}</span>}
                  </span>
                </div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              togglePinnedConversation(conversation.id);
            }}
            className={`absolute bottom-2.5 right-2.5 inline-flex h-6 w-6 items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${pinned ? 'text-accent/85 hover:bg-accent/10 hover:text-accent' : 'text-white/28 opacity-0 hover:bg-white/[0.06] hover:text-white/62 group-hover/conversation:opacity-100 focus:opacity-100'}`}
            aria-label={pinned ? t.chat.unpinConversation : t.chat.pinConversation}
            title={pinned ? t.chat.unpinConversation : t.chat.pinConversation}
          >
            <Pin size={13} strokeWidth={1.75} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    );
  });

  const confirmingMessage = confirmingMessageAction ? messages.find((message) => message.id === confirmingMessageAction.messageId) ?? null : null;
  const confirmingDeleteForEveryoneAvailable = canDeleteForEveryone(confirmingMessage, currentUser?.id);
  const confirmingMessageError = confirmingMessageAction && messageActionError?.messageId === confirmingMessageAction.messageId
    ? messageActionError.text
    : '';

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-[32rem] min-w-0 flex-col gap-3 overflow-hidden">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">{admin ? t.chat.adminTitle : t.chat.memberTitle}</h1>
          </div>
          <p className="mt-1 text-sm text-white/48">{t.chat.compactSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${realtimeStatusClassName(realtimeStatus)}`}>
            <Radio size={13} />
            {realtimeStatusLabel(realtimeStatus, Boolean(selectedConversation), conversationRealtimeReady, t)}
          </span>
          {keyStatus === 'restore-required' ? (
            <button
              ref={recoveryTriggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={recoveryPopupOpen}
              aria-controls={recoveryPopupOpen ? 'chat-recovery-popup' : undefined}
              onClick={() => setRecoveryPopupOpen((open) => !open)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:border-amber-200/35 hover:bg-amber-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/35 ${keyStatusClassName(keyStatus)}`}
            >
              <ShieldCheck size={13} />
              {keyStatusLabel(keyStatus, t)}
            </button>
          ) : (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${keyStatusClassName(keyStatus)}`}>
              <ShieldCheck size={13} />
              {keyStatusLabel(keyStatus, t)}
            </span>
          )}
          <button type="button" onClick={() => openKeyBackup('export')} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/72 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent">
            <Download size={13} />
            {t.chat.keyBackup}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
            <LockKeyhole size={13} />
            {t.chat.encryptedPayloadsOnly}
          </span>
          <button type="button" onClick={refreshChat} disabled={refreshing} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/72 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-55">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
            {t.common.refresh}
          </button>
        </div>
      </header>
      {error ? (
        <TableErrorState title={error} retryLabel={t.common.retry} onRetry={loadConversations} />
      ) : (
        <section className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] shadow-2xl shadow-black/20 lg:grid-cols-[22rem_1fr]">
          <aside className="chat-scrollbar min-h-0 overflow-y-auto border-b border-white/10 bg-black/15 p-3 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between px-2 py-1">
              <p className="text-sm font-semibold text-white">{t.chat.conversations}</p>
              <div className="flex items-center gap-2">
                {loadingConversations && <Spinner className="text-white/50" />}
                {canStartChat && (
                  <div ref={startMenuRef} className="relative">
                    <button type="button" onClick={() => setStartMenuOpen((open) => !open)} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus:border-accent/30 focus:bg-accent/10 focus:text-accent focus:outline-none" aria-label={t.chat.startChat} aria-expanded={startMenuOpen}>
                      <Plus size={16} />
                    </button>
                    {startMenuOpen && (
                      <div className="absolute right-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-[#07100d]/95 p-1 shadow-2xl shadow-black/45 backdrop-blur-xl">
                        <button type="button" onClick={openParticipantPicker} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white focus:outline-none">
                          <MessageSquareReply size={14} />
                          {t.chat.newChat}
                        </button>
                        <button type="button" onClick={openGroupCreation} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06] focus:text-white focus:outline-none">
                          <Users size={14} />
                          {t.chat.newGroup}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mb-3 space-y-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} />
                <input
                  value={conversationListSearch}
                  onChange={(event) => setConversationListSearch(event.target.value)}
                  placeholder={t.chat.searchConversations}
                  className="h-10 w-full rounded-full border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/35"
                />
              </label>
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/18 p-1">
                {(['all', 'unread', 'groups', 'favourites'] as ConversationFilter[]).map((filter) => {
                  const active = conversationFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setConversationFilter(filter)}
                      className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold transition ${active ? 'bg-accent/14 text-accent' : 'text-white/48 hover:bg-white/[0.05] hover:text-white/78'}`}
                      aria-pressed={active}
                    >
                      <span className="truncate">{conversationFilterLabel(filter, t)}</span>
                      <span className={`grid min-h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] ${active ? 'bg-accent text-[#04100b]' : 'bg-white/[0.06] text-white/46'}`}>{conversationCounts[filter]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {loadingConversations && conversations.length === 0 ? (
              <ConversationSkeleton />
            ) : conversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-8 text-center">
                <p className="text-sm font-semibold text-white">{t.chat.noConversations}</p>
                <p className="mt-2 text-sm text-white/50">{t.chat.noConversationsDescription}</p>
                {canStartChat ? (
                  <Button type="button" onClick={openParticipantPicker} className="mt-4 gap-2 px-4 py-2">
                    <Plus size={14} />
                    {t.chat.startChat}
                  </Button>
                ) : currentUser ? (
                  <p className="mt-4 text-xs font-medium text-white/45">{t.chat.startChatPermissionDenied}</p>
                ) : null}
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-8 text-center">
                <p className="text-sm font-semibold text-white">{conversationFilter === 'favourites' ? t.chat.noFavouriteConversations : t.chat.noConversationMatches}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pinnedConversations.length > 0 && (
                  <ConversationSection
                    title={t.chat.pinnedConversations}
                    count={pinnedConversations.length}
                    collapsed={pinnedCollapsed}
                    onToggle={() => setPinnedCollapsed((collapsed) => !collapsed)}
                  >
                    {renderConversationRows(pinnedConversations)}
                  </ConversationSection>
                )}
                {recentConversations.length > 0 && (
                  <ConversationSection
                    title={t.chat.recentConversations}
                    count={recentConversations.length}
                    collapsed={recentCollapsed}
                    onToggle={() => setRecentCollapsed((collapsed) => !collapsed)}
                  >
                    {renderConversationRows(recentConversations)}
                  </ConversationSection>
                )}
              </div>
            )}
          </aside>

          <div ref={activeChatPanelRef} className="relative flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-white/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {selectedConversation && (
                    isGroupConversation(selectedConversation)
                      ? <GroupHeaderAvatarGroup participants={selectedConversation.participants} t={t} />
                      : <ConversationAvatar conversation={selectedConversation} participant={selectedRecipient} fallback={selectedConversationLabel} size="md" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-white">{selectedConversationLabel}</p>
                    {selectedConversation && (selectedRecipient || isGroupConversation(selectedConversation)) && (
                      <p className={`mt-1 text-xs ${selectedTypingLabel ? 'font-medium text-accent' : 'text-white/42'}`}>{selectedStatusLabel}</p>
                    )}
                  </div>
                </div>
                {selectedConversation && (
                  <div className="flex w-full min-w-0 items-start gap-2 sm:w-auto sm:items-center">
                    {conversationSearchOpen && (
                      <div ref={conversationSearchRef} className="min-w-0 flex-1 sm:w-72 sm:flex-none">
                        <InlineConversationSearchInput
                          inputRef={conversationSearchInputRef}
                          query={conversationSearchQuery}
                          debouncedQuery={normalizedConversationSearchQuery}
                          results={conversationSearchResults}
                          locale={locale}
                          t={t}
                          onQueryChange={setConversationSearchQuery}
                          onClear={() => setConversationSearchQuery('')}
                          onClose={closeConversationSearch}
                          onSelect={(messageId) => {
                            const found = scrollToMessage(messageId);
                            if (found) closeConversationSearch();
                            return found;
                          }}
                        />
                      </div>
                    )}
                    <div ref={conversationActionsRef} className="relative shrink-0 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setConversationActionsOpen((open) => !open)}
                        className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus:border-accent/30 focus:bg-accent/10 focus:text-accent focus:outline-none"
                        aria-label={t.chat.moreActions}
                        aria-expanded={conversationActionsOpen}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {conversationActionsOpen && (
                        <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#07100d]/95 p-1 shadow-2xl shadow-black/45 backdrop-blur-xl">
                          {isGroupConversation(selectedConversation) && (
                            <button type="button" onClick={() => openGroupPanel('info')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white">
                              <Users size={15} />
                              {t.chat.groupInfo}
                            </button>
                          )}
                          {!isGroupConversation(selectedConversation) && (
                            <button type="button" onClick={openDirectMediaPanel} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white">
                              <ImageIcon size={15} />
                              {t.chat.mediaLinksAndDocs}
                            </button>
                          )}
                          <button type="button" onClick={isGroupConversation(selectedConversation) ? () => openGroupPanel('search') : openConversationSearch} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white">
                            <Search size={15} />
                            {t.chat.searchMessages}
                          </button>
                          <button type="button" onClick={isGroupConversation(selectedConversation) ? () => openGroupPanel('starred') : openStarredMessages} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white">
                            <Star size={15} />
                            {t.chat.starredMessages}
                          </button>
                          <button type="button" onClick={() => void toggleSelectedConversationMute()} disabled={notificationSettingsBusy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-60">
                            {selectedConversationMuted ? <Bell size={15} /> : <BellOff size={15} />}
                            {selectedConversationMuted ? t.chat.unmuteConversation : t.chat.muteConversation}
                          </button>
                          {!isGroupConversation(selectedConversation) && selectedRecipient && (
                            <button type="button" onClick={() => void toggleSelectedDirectBlock()} disabled={blockSettingsBusy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-wait disabled:opacity-60">
                              <Ban size={15} />
                              {selectedBlockState?.blockedByMe ? t.chat.unblockUser : t.chat.blockUser}
                            </button>
                          )}
                          <button type="button" onClick={() => openConversationConfirmation('clear')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white">
                            <Eraser size={15} />
                            {t.chat.clearChat}
                          </button>
                          <button type="button" onClick={() => openConversationConfirmation('delete')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-100 transition hover:bg-rose-300/10 hover:text-rose-50">
                            <Trash2 size={15} />
                            {t.chat.deleteConversation}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              <div ref={messagesContainerRef} className="chat-scrollbar h-full min-h-0 overflow-y-auto p-4 sm:p-5">
                {!selectedConversation ? (
                  <ChatEmptyState title={t.chat.selectConversation} description={t.chat.selectConversationDescription} />
                ) : loadingMessages ? (
                  <ConversationSkeleton />
                ) : messages.length === 0 ? (
                  <TableEmptyState title={t.chat.noMessages} description={t.chat.noMessagesDescription} />
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {messageRenderItems.map((item) => {
                    if (item.type === 'separator') return <DateSeparator key={item.key} label={item.label} />;
                    const message = item.message;
                    const own = isOwnMessage(message, currentUser?.id);
                    const deletedForEveryone = Boolean(message.deletedForEveryoneAt);
                    const decryptedMessage = deletedForEveryone ? '' : decryptedMessages[message.id] ?? t.chat.decryptFailed;
                    const attachment = parseAttachmentPayload(decryptedMessages[message.id]);
                    const displayText = messageTextFromPayload(decryptedMessages[message.id]) || decryptedMessage;
                    const replyToMessageId = replyTargetIdFromPayload(decryptedMessages[message.id]);
                    const replyToMessage = replyToMessageId ? messages.find((item) => item.id === replyToMessageId) ?? null : null;
                    const canCopy = !deletedForEveryone && !attachment && Boolean(messageTextFromPayload(decryptedMessages[message.id]).trim());
                    const canEdit = !isGroupConversation(selectedConversation) && canEditMessage(message, currentUser?.id, decryptedMessages);
                    const canReport = !own && !deletedForEveryone;
                    const statusLabel = own && !deletedForEveryone ? messageStatusLabel(message, selectedConversation, currentUser?.id, latestOwnSeenMessageId, locale, t) : '';
                    const preview = attachment ? imagePreviewsByAttachmentId[attachment.attachmentId] : undefined;
                    const hasReactions = !deletedForEveryone && Boolean(message.reactions?.length);
                    const groupConversation = isGroupConversation(selectedConversation);
                    const sender = selectedConversation?.participants.find((participant) => participant.userId === message.senderId) ?? null;
                    const showSenderName = groupConversation && item.isFirstInSenderGroup;
                    const showSenderAvatar = groupConversation && item.isLastInSenderGroup;
                    if (attachment && isImageAttachment(attachment) && !attachment.viewOnce) {
                      debugChatPreview('image-preview-render', {
                        source: messageSource(message.id),
                        messageId: message.id,
                        conversationId: message.conversationId,
                        senderId: message.senderId,
                        attachmentId: attachment.attachmentId,
                        attachmentKind: attachment.attachmentType,
                        viewOnce: false,
                        previewState: preview?.status ?? 'missing',
                        currentStatus: preview?.status ?? 'missing',
                        hasObjectUrl: Boolean(preview?.objectUrl),
                        startedAt: preview?.startedAt ?? null,
                        ageMs: preview?.startedAt ? Date.now() - preview.startedAt : 0,
                        inFlight: imagePreviewInFlightRef.current.has(attachment.attachmentId),
                      });
                    }
                    return (
                      <div key={message.id} id={`chat-message-${message.id}`} data-chat-message-id={message.id} className={`scroll-mt-6 flex ${own ? 'justify-end' : 'justify-start'} ${groupConversation ? (item.isFirstInSenderGroup ? 'mt-2' : '-mt-1') : ''}`}>
                        <div className={groupConversation ? `flex max-w-[88%] items-end gap-2 sm:max-w-[76%] ${own ? 'flex-row-reverse' : ''}` : `flex w-full ${own ? 'justify-end' : 'justify-start'}`}>
                          {groupConversation && (
                            showSenderAvatar ? (
                              <ProfilePhoto name={sender?.name} avatarUrl={sender?.avatarUrl} dicebearStyle={sender?.dicebearStyle} dicebearSeed={sender?.dicebearSeed} size="sm" className="h-8 w-8 rounded-full border-emerald-300/15 bg-emerald-300/10 text-[11px] text-emerald-100" />
                            ) : (
                              <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                            )
                          )}
                        <div className={`flex min-w-0 flex-col gap-0 ${groupConversation ? 'max-w-[calc(100%-2.5rem)]' : 'max-w-[82%] sm:max-w-[72%]'} ${own ? 'items-end' : 'items-start'} ${hasReactions ? 'mb-0.5' : ''}`}>
                          {showSenderName && <p className={`mb-1 px-1 text-xs font-semibold ${own ? 'text-emerald-100/80' : 'text-white/58'}`}>{messageAuthorLabel(message, selectedConversation, currentUser?.id, t)}</p>}
                          <div className={`group relative rounded-[18px] border shadow-lg shadow-black/10 transition ${attachment && !deletedForEveryone ? 'p-1.5' : 'px-3.5 py-2.5'} ${highlightedMessageId === message.id ? 'ring-2 ring-accent/55 ring-offset-2 ring-offset-[#07100d]' : ''} ${own ? 'rounded-br-md border-emerald-300/20 bg-accent/85 text-[#04100b]' : 'rounded-bl-md border-white/10 bg-white/[0.045] text-white'}`}>
                            <MessageActionsMenu
                              own={own}
                              open={openMessageActionsId === message.id}
                              busy={messageActionBusyId === message.id}
                              canReact={!deletedForEveryone}
                              canStar={!deletedForEveryone}
                              canReply={!deletedForEveryone}
                              starred={Boolean(message.starred)}
                              canCopy={canCopy}
                              canEdit={canEdit}
                              canReport={canReport}
                              canDownload={Boolean(attachment && !attachment.viewOnce)}
                              t={t}
                              onToggle={() => setOpenMessageActionsId((current) => current === message.id ? '' : message.id)}
                              onClose={() => setOpenMessageActionsId('')}
                              onReply={() => { setReplyTargetId(message.id); setOpenMessageActionsId(''); }}
                              onReact={(emoji) => void toggleMessageReaction(message, emoji)}
                              onStar={() => void toggleMessageStar(message)}
                              onEdit={() => startEditingMessage(message)}
                              onCopy={() => void copyMessageText(message)}
                              onReport={() => openMessageReport(message)}
                              onDownload={attachment && !attachment.viewOnce ? () => downloadAttachment(message, attachment) : undefined}
                              onDelete={() => openMessageDeleteConfirmation(message)}
                            />
                            {replyToMessageId && !deletedForEveryone && (
                              <ReplyPreview own={own} author={messageAuthorLabel(replyToMessage, selectedConversation, currentUser?.id, t)} text={messageReplyPreview(replyToMessage, decryptedMessages, t)} />
                            )}
                            {deletedForEveryone ? (
                              <p className="text-sm italic text-white/72">{t.chat.messageDeletedTombstone}</p>
                            ) : attachment ? (
                              <AttachmentBubble
                                attachment={attachment}
                                preview={preview}
                                own={own}
                                opened={openedAttachmentIds.has(attachment.attachmentId)}
                                opening={viewOnceOpeningAttachmentId === attachment.attachmentId}
                                failed={viewOnceFailedAttachmentId === attachment.attachmentId}
                                downloading={downloadingAttachmentMessageId === message.id}
                                downloadFailed={downloadFailedAttachmentMessageId === message.id}
                                transferProgress={attachmentTransferProgress?.kind === 'download' && attachmentTransferProgress.messageId === message.id ? attachmentTransferProgress : null}
                                timestamp={formatTime(message.createdAt, locale)}
                                statusLabel={statusLabel}
                                starred={Boolean(message.starred)}
                                starredLabel={t.chat.starredMessages}
                                t={t}
                                locale={locale}
                                onPreview={(url) => {
                                  openAttachmentMediaPreview(message, attachment, url);
                                }}
                                onRetryPreview={() => retryImageAttachmentPreview(message, attachment)}
                                onOpenViewOnce={() => openViewOnceAttachment(message, attachment)}
                                onDownload={() => downloadAttachment(message, attachment)}
                              />
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-sm leading-6">{displayText}</p>
                            )}
                            {!attachment && (
                              <p className={`mt-1 text-[11px] leading-none ${own && !deletedForEveryone ? 'text-[#04100b]/70' : 'text-white/75'}`}>
                                {message.starred && !deletedForEveryone && (
                                  <span className="mr-1 inline-flex items-center align-[-1px]" aria-label={t.chat.starredMessages}>
                                    <Star size={10} fill="currentColor" />
                                  </span>
                                )}
                                {formatTime(message.createdAt, locale)}
                                {message.editedAt && !deletedForEveryone && <span> · {t.chat.edited}</span>}
                                {statusLabel && <span> · {statusLabel}</span>}
                              </p>
                            )}
                          </div>
                          {hasReactions && (
                            <ReactionChips
                              reactions={message.reactions ?? []}
                              own={own}
                              disabled={messageActionBusyId === message.id}
                              onToggle={(emoji) => void toggleMessageReaction(message, emoji)}
                            />
                          )}
                        </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>
              {showScrollToLatest && selectedConversation && messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => scrollMessagesToLatest()}
                  className="absolute bottom-4 left-1/2 z-20 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border border-accent/20 bg-[#07100d]/86 text-accent shadow-xl shadow-black/30 backdrop-blur-xl transition hover:border-accent/35 hover:bg-accent/12 focus:outline-none focus:ring-2 focus:ring-accent/25"
                  aria-label={t.chat.scrollToLatest}
                >
                  <ArrowDown size={15} />
                </button>
              )}
            </div>
            {selectedConversation && (
              <div className="border-t border-white/10 bg-black/15 p-4">
                <form onSubmit={handleSendSubmit} className="space-y-3">
                  {keyStatus === 'failed' && <p className="text-xs font-medium text-rose-100">{t.chat.keySetupFailed}</p>}
                  {selectedConversation && keyStatus === 'ready' && !conversationEncryptionReady && (
                    <p className="text-xs font-medium text-amber-100">{isGroupConversation(selectedConversation) ? t.chat.groupKeysMissing : t.chat.recipientKeyMissing}</p>
                  )}
                  {composerSendBlocked && blockedComposerMessage && <p className="text-xs font-medium text-amber-100">{blockedComposerMessage}</p>}
                  {sendError && <p className="text-xs font-medium text-rose-100">{sendError}</p>}
                  {socketError && <p className="text-xs font-medium text-rose-100">{chatSocketErrorLabel(socketError, t)}</p>}
                  {editingTarget && (
                    <ReplyPreview
                      own={false}
                      author={t.chat.editingMessage}
                      text={messageTextFromPayload(decryptedMessages[editingTarget.id]).trim() || t.chat.messageUnavailable}
                      cancelLabel={t.chat.cancelEdit}
                      onCancel={cancelEditingMessage}
                    />
                  )}
                  {!editingTarget && replyTarget && (
                    <ReplyPreview
                      own={false}
                      author={messageAuthorLabel(replyTarget, selectedConversation, currentUser?.id, t)}
                      text={messageReplyPreview(replyTarget, decryptedMessages, t)}
                      cancelLabel={t.chat.cancelReply}
                      onCancel={() => setReplyTargetId('')}
                    />
                  )}
                  {selectedAttachmentFile && (
                    <SelectedAttachmentBar
                      file={selectedAttachmentFile}
                      previewUrl={selectedAttachmentPreviewUrl}
                      viewOnce={selectedAttachmentViewOnce}
                      canUseViewOnce={selectedAttachmentKind === 'photo' && !isGroupConversation(selectedConversation)}
                      status={attachmentComposerStatus}
                      busy={sending}
                      transferProgress={attachmentTransferProgress?.kind === 'upload' ? attachmentTransferProgress : null}
                      locale={locale}
                      t={t}
                      onViewOnceChange={(value) => {
                        if (isGroupConversation(selectedConversation) && value) {
                          toast(t.chat.groupViewOnceComingSoon);
                          setSelectedAttachmentViewOnce(false);
                          return;
                        }
                        setSelectedAttachmentViewOnce(value);
                      }}
                      onRetry={() => void sendMessage()}
                      onRemove={removeSelectedAttachment}
                    />
                  )}
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
                    <input
                      ref={documentAttachmentInputRef}
                      type="file"
                      accept="application/pdf,text/plain,image/svg+xml,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(event) => {
                        updateAttachmentFile(event.target.files?.[0] ?? null, 'document');
                        event.target.value = '';
                      }}
                    />
                    <input
                      ref={mediaAttachmentInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                      className="hidden"
                      onChange={(event) => {
                        updateAttachmentFile(event.target.files?.[0] ?? null, 'media');
                        event.target.value = '';
                      }}
                    />
                    <div ref={attachmentMenuRef} className="relative">
                      <button type="button" onClick={() => { setEmojiPickerOpen(false); setAttachmentMenuOpen((open) => !open); }} disabled={!composerCanSend || sending || Boolean(editingMessage)} className="grid min-h-11 w-full place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/62 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-55 sm:w-11" aria-label={t.chat.attach} aria-expanded={attachmentMenuOpen}>
                        <Plus size={18} />
                      </button>
                      {attachmentMenuOpen && (
                        <div className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#07100d]/95 p-1 shadow-2xl shadow-black/45 backdrop-blur-xl">
                          <button type="button" onClick={() => { setAttachmentMenuOpen(false); documentAttachmentInputRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white">
                            <FileText size={15} />
                            {t.chat.document}
                          </button>
                          <button type="button" onClick={() => { setAttachmentMenuOpen(false); mediaAttachmentInputRef.current?.click(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/72 transition hover:bg-white/[0.06] hover:text-white">
                            <ImageIcon size={15} />
                            {t.chat.photosAndVideos}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <button
                        ref={emojiButtonRef}
                        type="button"
                        onClick={() => { setAttachmentMenuOpen(false); setEmojiPickerOpen((open) => !open); }}
                        disabled={!composerCanSend || sending}
                        className="grid min-h-11 w-full place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/62 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-55 sm:w-11"
                        aria-label={t.chat.insertEmoji}
                        aria-expanded={emojiPickerOpen}
                      >
                        <Smile size={18} />
                      </button>
                      {emojiPickerOpen && emojiPickerPosition && createPortal(
                        <div
                          ref={emojiPickerRef}
                          className="fixed z-[45] overflow-hidden rounded-2xl border border-white/10 bg-[#07100d]/95 p-2 shadow-2xl shadow-black/45 backdrop-blur-xl"
                          style={emojiPickerPosition}
                        >
                          <div className="chat-scrollbar h-full overflow-y-auto overscroll-contain">
                            <EmojiPicker
                              theme={Theme.DARK}
                              width="100%"
                              height="100%"
                              searchPlaceholder={t.chat.searchEmoji}
                              lazyLoadEmojis
                              previewConfig={{ showPreview: false }}
                              onEmojiClick={insertEmoji}
                            />
                          </div>
                        </div>,
                        document.body,
                      )}
                    </div>
                    <textarea
                      ref={composerTextareaRef}
                      rows={1}
                      value={messageText}
                      onChange={(event) => updateMessageText(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      onBlur={stopTyping}
                      disabled={!composerCanSend || sending}
                      placeholder={composerSendBlocked && blockedComposerMessage ? blockedComposerMessage : editingMessage ? t.chat.editingMessage : composerPlaceholder({ selectedConversation: Boolean(selectedConversation), keyStatus, recipientKey: conversationEncryptionReady, realtimeReady: conversationRealtimeReady }, t)}
                      className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-5 text-white outline-none transition placeholder:text-white/35 focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-55"
                    />
                    <button
                      type="submit"
                      disabled={!composerCanSend || sending || (!messageText.trim() && !selectedAttachmentFile)}
                      className="grid min-h-11 w-full place-items-center rounded-full bg-accent text-[#04100b] transition hover:bg-[#74e4b1] focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 sm:w-11"
                      aria-label={editingMessage ? t.chat.save : t.chat.sendMessage}
                      title={editingMessage ? t.chat.save : t.chat.sendMessage}
                    >
                      {sending ? <Spinner /> : <ArrowUp size={18} strokeWidth={2.5} />}
                    </button>
                  </div>
                </form>
              </div>
            )}
            <DirectMediaDocsPanel
              open={directMediaPanelOpen && Boolean(selectedConversation && !isGroupConversation(selectedConversation))}
              mediaItems={selectedMediaItems.media}
              docItems={selectedMediaItems.docs}
              linkItems={selectedMediaItems.links}
              locale={locale}
              t={t}
              onClose={() => setDirectMediaPanelOpen(false)}
              onSelectMessage={(messageId) => {
                if (scrollToMessage(messageId)) setDirectMediaPanelOpen(false);
              }}
              onPreviewMedia={(message, attachment, preview) => {
                if (preview.status !== 'loaded' || !preview.objectUrl) return;
                openAttachmentMediaPreview(message, attachment, preview.objectUrl);
              }}
              onDownloadAttachment={(message, attachment) => void downloadAttachment(message, attachment)}
            />
            <GroupMembersPanel
              open={groupMembersPanelOpen}
              initialView={groupPanelInitialView}
              conversation={selectedConversation}
              participants={groupParticipants}
              addableParticipants={groupAddableParticipants}
              loading={loadingGroupParticipants}
              error={groupParticipantsError}
              addMembersOpen={groupAddMembersOpen}
              addMemberSearch={groupAddMemberSearch}
              selectedAddMemberIds={selectedGroupAddMemberIds}
              addingMembers={addingGroupMembers}
              removingUserId={removingGroupMemberId}
              updatingGroupName={updatingGroupName}
              transferringOwnership={transferringGroupOwnership}
              leavingGroup={leavingGroup}
              currentUserId={currentUser?.id}
              messages={messages}
              starredMessages={starredMessages}
              loadingStarredMessages={loadingStarredMessages}
              starredMessagesError={starredMessagesError}
              decryptedMessages={decryptedMessages}
              imagePreviewsByAttachmentId={imagePreviewsByAttachmentId}
              locale={locale}
              t={t}
              onRetry={() => selectedConversation && void loadGroupParticipants(selectedConversation.id)}
              onToggleAddMembers={toggleGroupAddMembers}
              onAddMemberSearch={setGroupAddMemberSearch}
              onToggleAddMember={toggleGroupAddMember}
              onAddMembers={() => void addMembersToSelectedGroup()}
              onRemoveMember={(userId) => void removeGroupMember(userId)}
              onUpdateGroupName={(title) => void updateSelectedGroupName(title)}
              onTransferOwnership={(userId) => void transferSelectedGroupOwnership(userId)}
              onLoadStarredMessages={() => selectedConversation && void loadStarredMessagesForConversation(selectedConversation.id)}
              onSearchResult={(messageId) => scrollToMessage(messageId)}
              muted={selectedConversationMuted}
              notificationSettingsBusy={notificationSettingsBusy}
              onToggleMute={() => void toggleSelectedConversationMute()}
              onPreviewMedia={(message, attachment, preview) => {
                if (preview.status !== 'loaded' || !preview.objectUrl) return;
                openAttachmentMediaPreview(message, attachment, preview.objectUrl);
              }}
              onDownloadAttachment={(message, attachment) => void downloadAttachment(message, attachment)}
              onClearChat={() => openConversationConfirmation('clear')}
              onLeaveGroup={() => void leaveSelectedGroup()}
              onClose={closeGroupMembersPanel}
            />
          </div>
        </section>
      )}
      <ParticipantPickerModal
        open={participantPickerOpen}
        participants={filteredParticipants}
        search={participantSearch}
        loading={loadingParticipants}
        error={participantError}
        startingUserId={startingChatUserId}
        canStartChat={canStartChat}
        t={t}
        onSearch={setParticipantSearch}
        onRetry={loadParticipants}
        onStart={startDirectChat}
        onClose={closeParticipantPicker}
      />
      <GroupCreationModal
        open={groupCreationOpen}
        participants={filteredParticipants}
        search={participantSearch}
        loading={loadingParticipants}
        error={participantError}
        title={groupTitle}
        selectedParticipantIds={selectedGroupParticipantIds}
        step={groupCreationStep}
        creating={creatingGroup}
        t={t}
        onSearch={setParticipantSearch}
        onTitle={setGroupTitle}
        onToggleParticipant={toggleGroupParticipant}
        onStep={setGroupCreationStep}
        onRetry={loadParticipants}
        onCreate={startGroupChat}
        onClose={closeGroupCreation}
      />
      <KeyBackupModal
        open={keyBackupOpen}
        mode={keyBackupMode}
        keyStatus={keyStatus}
        hasLocalKey={Boolean(localPrivateKey)}
        password={keyBackupPassword}
        confirmPassword={keyBackupConfirmPassword}
        file={keyBackupFile}
        replaceConfirmed={keyBackupReplaceConfirmed}
        busy={keyBackupBusy}
        message={keyBackupMessage}
        t={t}
        onMode={setKeyBackupMode}
        onPassword={setKeyBackupPassword}
        onConfirmPassword={setKeyBackupConfirmPassword}
        onFile={updateKeyBackupFile}
        onReplaceConfirmed={setKeyBackupReplaceConfirmed}
        onSubmit={handleKeyBackupSubmit}
        onClose={closeKeyBackup}
      />
      <ChatRecoveryDialog
        open={recoveryPopupOpen && (keyStatus === 'restore-required' || keyStatus === 'rotating')}
        busy={keyBackupBusy || keyStatus === 'rotating'}
        confirmingIdentity={identityConfirmationOpen}
        t={t}
        onRestore={openRecoveryRestoreFlow}
        onCreateIdentity={openRecoveryIdentityFlow}
        onConfirmIdentity={() => void rotateChatIdentity()}
        onCancelIdentity={cancelRecoveryIdentityFlow}
        onClose={closeRecoveryPopup}
      />
      <ConfirmDialog
        open={Boolean(confirmingConversationAction)}
        title={confirmingConversationAction === 'delete' ? t.chat.deleteConversationTitle : t.chat.clearChatTitle}
        description={confirmingConversationAction === 'delete' ? t.chat.deleteConversationDescription : t.chat.clearChatDescription}
        confirmLabel={confirmingConversationAction === 'delete' ? t.chat.deleteConversation : t.chat.clearChat}
        cancelLabel={t.common.cancel}
        loading={conversationActionBusy}
        onConfirm={runConversationAction}
        onCancel={() => {
          if (!conversationActionBusy) setConfirmingConversationAction(null);
        }}
      />
      <MessageDeleteDialog
        open={Boolean(confirmingMessageAction)}
        busy={Boolean(messageActionBusyId)}
        canDeleteForEveryone={confirmingDeleteForEveryoneAvailable}
        error={confirmingMessageError}
        t={t}
        onDeleteForMe={() => void confirmMessageAction('delete-for-me')}
        onDeleteForEveryone={() => void confirmMessageAction('delete-for-everyone')}
        onCancel={() => {
          if (!messageActionBusyId) {
            setConfirmingMessageAction(null);
            setMessageActionError(null);
          }
        }}
      />
      <MessageReportDialog
        open={Boolean(reportingMessage)}
        busy={submittingReport}
        reason={reportReason}
        note={reportNote}
        t={t}
        onReasonChange={setReportReason}
        onNoteChange={setReportNote}
        onSubmit={() => void submitMessageReport()}
        onCancel={() => {
          if (!submittingReport) {
            setReportingMessage(null);
            setReportNote('');
            setReportReason('spam');
          }
        }}
      />
      <StarredMessagesDialog
        open={starredMessagesOpen}
        messages={starredMessages}
        loadedMessageIds={new Set(messages.map((message) => message.id))}
        loading={loadingStarredMessages}
        error={starredMessagesError}
        decryptedMessages={decryptedMessages}
        t={t}
        onClose={() => setStarredMessagesOpen(false)}
        onRetry={() => {
          if (selectedConversation) void loadStarredMessagesForConversation(selectedConversation.id);
        }}
        onSelect={(messageId) => {
          if (scrollToMessage(messageId)) setStarredMessagesOpen(false);
        }}
      />
      {imagePreview && (
        imagePreview.kind === 'video' ? (
          <VideoPreviewModal
            preview={imagePreview}
            t={t}
            starred={Boolean(messages.find((message) => message.id === imagePreview.messageId)?.starred ?? imagePreview.starred)}
            onGoToMessage={() => {
              if (imagePreview.messageId) scrollToMessage(imagePreview.messageId);
              setImagePreview(null);
              setImagePreviewDownloadError('');
            }}
            onReply={() => {
              if (imagePreview.messageId) setReplyTargetId(imagePreview.messageId);
              setImagePreview(null);
              setImagePreviewDownloadError('');
            }}
            onToggleStar={() => {
              const message = messages.find((item) => item.id === imagePreview.messageId);
              if (message) void toggleMessageStar(message);
            }}
            onDownload={() => {
              const message = messages.find((item) => item.id === imagePreview.messageId);
              if (message && imagePreview.attachment) void downloadAttachment(message, imagePreview.attachment);
            }}
            onClose={() => {
              setImagePreview(null);
              setImagePreviewDownloadError('');
            }}
          />
        ) : (
          <ImagePreviewModal
            preview={imagePreview}
            closeLabel={t.common.close}
            downloadLabel={t.chat.downloadImage}
            downloadError={imagePreviewDownloadError}
            onDownload={downloadImagePreview}
            t={t}
            starred={Boolean(messages.find((message) => message.id === imagePreview.messageId)?.starred ?? imagePreview.starred)}
            onGoToMessage={imagePreview.messageId ? () => {
              if (imagePreview.messageId) scrollToMessage(imagePreview.messageId);
              setImagePreview(null);
              setImagePreviewDownloadError('');
            } : undefined}
            onReply={imagePreview.messageId ? () => {
              if (imagePreview.messageId) setReplyTargetId(imagePreview.messageId);
              setImagePreview(null);
              setImagePreviewDownloadError('');
            } : undefined}
            onToggleStar={imagePreview.messageId ? () => {
              const message = messages.find((item) => item.id === imagePreview.messageId);
              if (message) void toggleMessageStar(message);
            } : undefined}
            onClose={() => {
              setImagePreview(null);
              setImagePreviewDownloadError('');
            }}
          />
        )
      )}
      {viewOnceImagePreview && (
        <ImagePreviewModal preview={viewOnceImagePreview} closeLabel={t.common.close} onClose={closeViewOncePreview} />
      )}
    </div>
  );
}

function ReplyPreview({ own, author, text, cancelLabel, onCancel }: { own: boolean; author: string; text: string; cancelLabel?: string; onCancel?: () => void }) {
  return (
    <div className={`mb-2 flex min-w-0 items-start gap-2 rounded border px-2.5 py-2 text-xs ${own ? 'border-[#053225]/25 border-r-[#05251c]/50 bg-[#063d2d]/30 text-white/86' : 'border-white/10 border-l-accent/30 bg-white/[0.035] text-white/66'}`}>
      <MessageSquareReply size={14} className="mt-0.5 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-4">{author}</p>
        <p className="truncate leading-4 opacity-85">{text}</p>
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current/10 bg-black/10 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-current/20" aria-label={cancelLabel ?? author}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function DirectMediaDocsPanel({
  open,
  mediaItems,
  docItems,
  linkItems,
  locale,
  t,
  onClose,
  onSelectMessage,
  onPreviewMedia,
  onDownloadAttachment,
}: {
  open: boolean;
  mediaItems: GroupMediaItem[];
  docItems: GroupMediaItem[];
  linkItems: GroupLinkItem[];
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
  onPreviewMedia: (message: ChatMessage, attachment: EncryptedAttachmentPayload, preview: AttachmentPreview) => void;
  onDownloadAttachment: (message: ChatMessage, attachment: EncryptedAttachmentPayload) => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-[27rem] translate-x-0 flex-col border-l border-white/10 bg-[#07100d]/95 shadow-2xl shadow-black/45 backdrop-blur-xl sm:w-[min(27rem,82%)]" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="false" aria-label={t.chat.mediaLinksAndDocs}>
        <GroupMediaDocsPanel
          mediaItems={mediaItems}
          docItems={docItems}
          linkItems={linkItems}
          locale={locale}
          t={t}
          onBack={onClose}
          onSelectMessage={onSelectMessage}
          onPreviewMedia={onPreviewMedia}
          onDownloadAttachment={onDownloadAttachment}
        />
      </aside>
    </div>
  );
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-1.5">
      <div className="flex w-full max-w-sm items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/34">
        <span className="h-px flex-1 bg-white/10" />
        <span className="shrink-0">{label}</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}

function MessageActionsMenu({
  own,
  open,
  busy,
  canReact,
  canStar,
  canReply,
  starred,
  canCopy,
  canEdit,
  canReport,
  canDownload,
  t,
  onToggle,
  onClose,
  onReply,
  onReact,
  onStar,
  onEdit,
  onCopy,
  onReport,
  onDownload,
  onDelete,
}: {
  own: boolean;
  open: boolean;
  busy: boolean;
  canReact: boolean;
  canStar: boolean;
  canReply: boolean;
  starred: boolean;
  canCopy: boolean;
  canEdit: boolean;
  canReport: boolean;
  canDownload: boolean;
  t: ReturnType<typeof useI18n>['t'];
  onToggle: () => void;
  onClose: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onStar: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onReport: () => void;
  onDownload?: () => void;
  onDelete: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const menuItemsCount = 1 + (canReact ? 1 : 0) + (canStar ? 1 : 0) + (canReply ? 1 : 0) + (canCopy ? 1 : 0) + (canEdit ? 1 : 0) + (canReport ? 1 : 0) + (canDownload && onDownload ? 1 : 0);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    const triggerElement = triggerRef.current;
    if (!triggerElement) return undefined;

    const rect = triggerElement.getBoundingClientRect();
    const margin = 12;
    const menuWidth = 224;
    const menuHeight = Math.max(112, menuItemsCount * 44 + 8);
    const hasRoomBelow = rect.bottom + 8 + menuHeight <= window.innerHeight - margin;
    const top = hasRoomBelow ? rect.bottom + 8 : rect.top - menuHeight - 8;
    const preferredLeft = rect.left + menuWidth > window.innerWidth - margin ? rect.right - menuWidth : rect.left;
    setPosition({
      top: Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - menuHeight - margin)),
      left: Math.min(Math.max(preferredLeft, margin), Math.max(margin, window.innerWidth - menuWidth - margin)),
    });

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [menuItemsCount, onClose, open, onDownload]);

  const runAction = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div className={`absolute top-1 z-20 ${own ? 'left-1' : 'right-1'}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        disabled={busy}
        className={`grid h-7 w-7 place-items-center rounded-full border opacity-0 transition focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 ${open ? 'opacity-100' : ''} ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/70 focus:ring-[#04100b]/20' : 'border-white/10 bg-black/20 text-white/62 focus:ring-white/20'} disabled:cursor-wait disabled:opacity-50`}
        aria-label={t.chat.moreActions}
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, left: position.left }}
          className="fixed z-[80] w-56 overflow-hidden rounded-xl border border-white/10 bg-[#07100d]/95 p-1 text-white shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          {canReact && (
            <div className="border-b border-white/10 px-2 py-2">
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/36">{t.chat.react}</p>
              <div className="grid grid-cols-6 gap-1">
                {allowedReactionEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => runAction(() => onReact(emoji))}
                    className="grid h-8 w-8 place-items-center rounded-lg text-base transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-white/15"
                    aria-label={`${t.chat.react} ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          {canStar && <MessageActionButton icon={<Star size={14} fill={starred ? 'currentColor' : 'none'} />} label={starred ? t.chat.unstar : t.chat.star} onClick={() => runAction(onStar)} />}
          {canReply && <MessageActionButton icon={<MessageSquareReply size={14} />} label={t.chat.reply} onClick={() => runAction(onReply)} />}
          {canEdit && <MessageActionButton icon={<Pencil size={14} />} label={t.chat.edit} onClick={() => runAction(onEdit)} />}
          {canCopy && <MessageActionButton icon={<Copy size={14} />} label={t.chat.copy} onClick={() => runAction(onCopy)} />}
          {canDownload && onDownload && <MessageActionButton icon={<Download size={14} />} label={t.chat.downloadAttachment} onClick={() => runAction(onDownload)} />}
          {canReport && <MessageActionButton icon={<Flag size={14} />} label={t.chat.reportMessage} onClick={() => runAction(onReport)} />}
          <MessageActionButton icon={<Trash2 size={14} />} label={t.chat.deleteMessageAction} onClick={() => runAction(onDelete)} danger />
        </div>,
        document.body,
      )}
    </div>
  );
}

function MessageActionButton({ icon, label, danger = false, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-white/15 ${danger ? 'text-rose-100 hover:bg-rose-300/10 hover:text-rose-50 focus:bg-rose-300/10' : 'text-white/76 hover:bg-white/[0.06] hover:text-white focus:bg-white/[0.06]'}`}>
      {icon}
      {label}
    </button>
  );
}

function ReactionChips({ reactions, own, disabled, onToggle }: { reactions: ChatReactionSummary[]; own: boolean; disabled: boolean; onToggle: (emoji: string) => void }) {
  return (
    <div className={`-mt-1 flex max-w-full flex-wrap gap-1.5 px-2 ${own ? 'justify-end' : 'justify-start'}`}>
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(reaction.emoji)}
          className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold shadow-sm shadow-black/10 backdrop-blur-md transition focus:outline-none focus:ring-2 disabled:cursor-wait disabled:opacity-60 ${reaction.reactedByCurrentUser ? own ? 'border-white/20 bg-white/20 text-white' : 'border-accent/25 bg-accent/15 text-accent' : own ? 'border-white/10 bg-white/10 text-white/78 hover:bg-white/15 focus:ring-white/20' : 'border-white/10 bg-[#07100d]/70 text-white/66 hover:border-white/15 hover:bg-[#0c1713]/85 focus:ring-white/20'}`}
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

function InlineConversationSearchInput({
  inputRef,
  query,
  debouncedQuery,
  results,
  locale,
  t,
  onQueryChange,
  onClear,
  onClose,
  onSelect,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  debouncedQuery: string;
  results: ChatSearchResult[];
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  onQueryChange: (query: string) => void;
  onClear: () => void;
  onClose: () => void;
  onSelect: (messageId: string) => boolean;
}) {
  const hasQuery = debouncedQuery.length > 0;

  return (
    <div className="relative">
      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t.chat.searchMessages}
          className="h-9 w-full rounded-full border border-white/10 bg-white/[0.045] pl-9 pr-16 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/40 focus:bg-white/[0.06]"
          aria-label={t.chat.searchMessages}
        />
        <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {query && (
            <button type="button" onClick={onClear} className="grid h-7 w-7 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none" aria-label={t.chat.clearSearch}>
              <X size={13} />
            </button>
          )}
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white focus:outline-none" aria-label={t.chat.closeSearch}>
            <X size={13} />
          </button>
        </span>
      </label>
      {hasQuery && (
        <div className="absolute right-0 top-full z-30 mt-2 w-full">
          <ConversationSearchResultsPanel
            query={debouncedQuery}
            results={results}
            locale={locale}
            t={t}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}

function ConversationSearchResultsPanel({
  query,
  results,
  locale,
  t,
  onSelect,
}: {
  query: string;
  results: ChatSearchResult[];
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  onSelect: (messageId: string) => boolean;
}) {
  const [missingMessageId, setMissingMessageId] = useState('');

  useEffect(() => {
    setMissingMessageId('');
  }, [query]);

  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#07100d]/88 px-4 py-3 text-sm text-white/55 shadow-2xl shadow-black/35 backdrop-blur-xl">
        {t.chat.noMessagesFound}
      </div>
    );
  }

  return (
    <div className="max-h-[min(18rem,44dvh)] overflow-y-auto rounded-xl border border-white/10 bg-[#07100d]/88 p-2 shadow-2xl shadow-black/35 backdrop-blur-xl">
      <p className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/36">{results.length === 1 ? t.chat.matchFound : t.chat.matches}</p>
      <div className="space-y-1.5">
        {results.map((result) => {
          const missing = missingMessageId === result.message.id;
          return (
            <button
              key={result.message.id}
              type="button"
              onClick={() => {
                const found = onSelect(result.message.id);
                if (!found) setMissingMessageId(result.message.id);
              }}
              className="w-full rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left transition hover:border-accent/25 hover:bg-accent/10 focus:border-accent/30 focus:bg-accent/10 focus:outline-none"
            >
              <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-white">{result.senderLabel}</span>
                <span className="shrink-0 text-[11px] text-white/35">{formatTime(result.createdAt, locale)}</span>
              </span>
              <span className="mt-1 block truncate text-sm text-white/68">
                <HighlightedPreview text={result.preview} query={query} matchIndex={result.matchIndex} />
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-3">
                <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[11px] font-semibold text-white/48">{result.typeLabel}</span>
                {missing && <span className="text-[11px] font-medium text-amber-100">{t.chat.messageNotLoaded}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HighlightedPreview({ text, query, matchIndex }: { text: string; query: string; matchIndex: number }) {
  if (!query || matchIndex < 0) return <>{text}</>;
  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + query.length);
  const after = text.slice(matchIndex + query.length);
  return (
    <>
      {before}
      <mark className="rounded bg-accent/20 px-0.5 text-accent">{match}</mark>
      {after}
    </>
  );
}

function StarredMessagesDialog({
  open,
  messages,
  loadedMessageIds,
  loading,
  error,
  decryptedMessages,
  t,
  onClose,
  onRetry,
  onSelect,
}: {
  open: boolean;
  messages: ChatMessage[];
  loadedMessageIds: Set<string>;
  loading: boolean;
  error: string;
  decryptedMessages: Record<string, string>;
  t: ReturnType<typeof useI18n>['t'];
  onClose: () => void;
  onRetry: () => void;
  onSelect: (messageId: string) => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="starred-messages-title">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#07100d] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 id="starred-messages-title" className="truncate text-base font-semibold text-white">{t.chat.starredMessages}</h2>
            <p className="mt-1 text-xs text-white/42">{t.chat.noPlaintextNotice}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus:border-accent/30 focus:bg-accent/10 focus:text-accent focus:outline-none" aria-label={t.common.close}>
            <X size={15} />
          </button>
        </div>
        <div className="max-h-[min(26rem,70dvh)] overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-white/56"><Spinner />{t.common.loading}</div>
          ) : error ? (
            <TableErrorState title={error} retryLabel={t.common.retry} onRetry={onRetry} />
          ) : messages.length === 0 ? (
            <TableEmptyState title={t.chat.noStarredMessages} />
          ) : (
            <div className="space-y-2">
              {messages.map((message) => {
                const canJump = loadedMessageIds.has(message.id);
                return (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => {
                      if (canJump) onSelect(message.id);
                    }}
                    disabled={!canJump}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-left transition hover:border-accent/25 hover:bg-accent/10 focus:border-accent/30 focus:bg-accent/10 focus:outline-none disabled:cursor-default disabled:hover:border-white/10 disabled:hover:bg-white/[0.035]"
                  >
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent/20 bg-accent/10 text-accent">
                      <Star size={13} fill="currentColor" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{messageReplyPreview(message, decryptedMessages, t)}</span>
                      <span className="mt-1 block text-xs text-white/38">{canJump ? t.chat.selectStarredMessage : t.chat.messageUnavailable}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MessageDeleteDialog({
  open,
  busy,
  canDeleteForEveryone,
  error,
  t,
  onDeleteForMe,
  onDeleteForEveryone,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  canDeleteForEveryone: boolean;
  error: string;
  t: ReturnType<typeof useI18n>['t'];
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 px-4 py-6 backdrop-blur-sm" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#07100d]/95 p-5 text-white shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{t.chat.deleteMessageTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-white/58">{t.chat.deleteMessageDescription}</p>
          </div>
          <button type="button" disabled={busy} onClick={onCancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/[0.08] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50" aria-label={t.chat.cancel}>
            <X size={15} />
          </button>
        </div>
        {error && <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm font-medium text-rose-100">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onCancel} className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/72 transition hover:bg-white/[0.08] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50">
            {t.chat.cancel}
          </button>
          <button type="button" disabled={busy} onClick={onDeleteForMe} className="inline-flex min-h-10 items-center justify-center rounded-full border border-rose-300/20 bg-rose-300/10 px-4 text-sm font-semibold text-rose-50 transition hover:bg-rose-300/15 focus:outline-none focus:ring-2 focus:ring-rose-200/25 disabled:cursor-wait disabled:opacity-60">
            {busy ? <Spinner /> : t.chat.deleteForMe}
          </button>
          {canDeleteForEveryone && (
            <button type="button" disabled={busy} onClick={onDeleteForEveryone} className="inline-flex min-h-10 items-center justify-center rounded-full border border-rose-300/25 bg-rose-400/20 px-4 text-sm font-semibold text-rose-50 transition hover:bg-rose-400/25 focus:outline-none focus:ring-2 focus:ring-rose-200/30 disabled:cursor-wait disabled:opacity-60">
              {busy ? <Spinner /> : t.chat.deleteForEveryone}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MessageReportDialog({
  open,
  busy,
  reason,
  note,
  t,
  onReasonChange,
  onNoteChange,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  reason: ChatReportReason;
  note: string;
  t: ReturnType<typeof useI18n>['t'];
  onReasonChange: (reason: ChatReportReason) => void;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  const reasons: { value: ChatReportReason; label: string }[] = [
    { value: 'spam', label: t.chat.reportReasonSpam },
    { value: 'harassment', label: t.chat.reportReasonHarassment },
    { value: 'unsafe_content', label: t.chat.reportReasonUnsafeContent },
    { value: 'other', label: t.chat.reportReasonOther },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 px-4 py-6 backdrop-blur-sm" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#07100d]/95 p-5 text-white shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">{t.chat.reportMessage}</h2>
            <p className="mt-2 text-sm leading-6 text-white/58">{t.chat.reportMessageDescription}</p>
          </div>
          <button type="button" disabled={busy} onClick={onCancel} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:bg-white/[0.08] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50" aria-label={t.chat.cancel}>
            <X size={15} />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.chat.reportReason}</span>
            <select value={reason} onChange={(event) => onReasonChange(event.target.value as ChatReportReason)} disabled={busy} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-accent/45 disabled:cursor-not-allowed disabled:opacity-55">
              {reasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.chat.reportNote}</span>
            <textarea value={note} onChange={(event) => onNoteChange(event.target.value)} disabled={busy} maxLength={1000} rows={4} className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-accent/45 disabled:cursor-not-allowed disabled:opacity-55" placeholder={t.chat.reportNotePlaceholder} />
          </label>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onCancel} className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/72 transition hover:bg-white/[0.08] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50">
            {t.chat.cancel}
          </button>
          <button type="button" disabled={busy} onClick={onSubmit} className="inline-flex min-h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-[#04100b] transition hover:bg-[#74e4b1] focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-wait disabled:opacity-60">
            {busy ? <Spinner /> : t.chat.submitReport}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SelectedAttachmentBar({
  file,
  previewUrl,
  viewOnce,
  canUseViewOnce,
  status,
  busy,
  transferProgress,
  locale,
  t,
  onViewOnceChange,
  onRetry,
  onRemove,
}: {
  file: File;
  previewUrl: string;
  viewOnce: boolean;
  canUseViewOnce: boolean;
  status: AttachmentComposerStatus;
  busy: boolean;
  transferProgress: AttachmentTransferProgress | null;
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  onViewOnceChange: (value: boolean) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const attachmentKind = attachmentKindForFile(file);
  const typeLabel = attachmentFileTypeLabelForFile(file, t);
  const fileSize = formatFileSize(file.size, locale);
  const metadata = fileSize ? `${typeLabel} • ${fileSize}` : typeLabel;
  const isPhoto = attachmentKind === 'photo';
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 shadow-lg shadow-black/10">
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-100">
        {isPhoto && previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : isPhoto || attachmentKind === 'video' ? (
          <ImageIcon size={18} />
        ) : (
          <FileText size={18} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5 text-white">{file.name || t.chat.encryptedAttachment}</p>
        <p className="mt-0.5 truncate text-xs text-white/46">{metadata}</p>
        <p className={`mt-1 truncate text-xs font-semibold ${status === 'failed' ? 'text-rose-100' : busy ? 'text-accent' : 'text-white/52'}`}>
          {attachmentComposerStatusLabel(status, t)}
        </p>
        {transferProgress && (
          <TransferProgressRow
            label={t.chat.uploadProgress}
            statusLabel={t.chat.uploading}
            percent={transferProgress.percent}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canUseViewOnce && (
          <button
            type="button"
            onClick={() => onViewOnceChange(!viewOnce)}
            disabled={busy}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${viewOnce ? 'border-accent/35 bg-accent/18 text-accent' : 'border-white/10 bg-black/15 text-white/55 hover:border-accent/25 hover:bg-accent/10 hover:text-accent'}`}
            aria-pressed={viewOnce}
          >
            <LockKeyhole size={13} />
            {t.chat.viewOnce}
          </button>
        )}
        {status === 'failed' && (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-300/20 bg-rose-300/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-300/15 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {t.common.retry}
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/15 text-white/55 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus:border-accent/30 focus:bg-accent/10 focus:text-accent focus:outline-none"
          aria-label={t.chat.removeAttachment}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function TransferProgressRow({ label, statusLabel, percent }: { label: string; statusLabel: string; percent: number | null }) {
  const hasPercent = typeof percent === 'number';
  return (
    <div className="mt-2 min-w-0">
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-white/58">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-white/70">{hasPercent ? `${statusLabel} · ${percent}%` : statusLabel}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
        {hasPercent ? (
          <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        ) : (
          <span className="block h-full w-1/3 animate-pulse rounded-full bg-accent/70" />
        )}
      </div>
    </div>
  );
}

function ViewOncePhotoPlaceholder({ own, label, muted = false }: { own: boolean; label: string; muted?: boolean }) {
  return (
    <div className={`flex min-w-[13rem] items-center gap-3 rounded-xl border px-3 py-3 ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/75' : 'border-white/10 bg-white/[0.04] text-white/68'}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/70' : 'border-white/10 bg-white/[0.055] text-white/55'}`}>
        <LockKeyhole size={17} />
      </span>
      <span className={`text-sm font-semibold ${muted ? 'opacity-70' : ''}`}>{label}</span>
    </div>
  );
}

function AttachmentMetaLine({
  own,
  timestamp,
  statusLabel,
  starred,
  starredLabel,
  overlay = false,
  card = false,
}: {
  own: boolean;
  timestamp: string;
  statusLabel?: string;
  starred: boolean;
  starredLabel: string;
  overlay?: boolean;
  card?: boolean;
}) {
  const content = (
    <>
      {starred && (
        <span className="mr-1 inline-flex items-center align-[-1px]" aria-label={starredLabel}>
          <Star size={10} fill="currentColor" />
        </span>
      )}
      {timestamp}
      {statusLabel && <span> · {statusLabel}</span>}
    </>
  );

  if (overlay) {
    return (
      <span className="absolute bottom-2 right-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-white/15 bg-black/65 px-2 py-1 text-[11px] font-semibold leading-none text-white/95 shadow-lg shadow-black/25 backdrop-blur-md">
        {content}
      </span>
    );
  }

  if (card) {
    return (
      <span className="flex justify-end px-3.5 pb-2.5 pt-2 text-[11px] leading-none text-white/78">
        <span className="min-w-0 truncate">{content}</span>
      </span>
    );
  }

  return (
    <span className="mt-1 flex justify-end px-1 text-[11px] leading-none text-white/76">
      <span className="min-w-0 truncate">{content}</span>
    </span>
  );
}

function AttachmentBubble({
  attachment,
  preview,
  own,
  opened,
  opening,
  failed,
  downloading,
  downloadFailed,
  transferProgress,
  timestamp,
  statusLabel,
  starred,
  starredLabel,
  t,
  locale,
  onPreview,
  onRetryPreview,
  onOpenViewOnce,
  onDownload,
}: {
  attachment: EncryptedAttachmentPayload;
  preview?: AttachmentPreview;
  own: boolean;
  opened: boolean;
  opening: boolean;
  failed: boolean;
  downloading: boolean;
  downloadFailed: boolean;
  transferProgress: AttachmentTransferProgress | null;
  timestamp: string;
  statusLabel: string;
  starred: boolean;
  starredLabel: string;
  t: ReturnType<typeof useI18n>['t'];
  locale: string;
  onPreview: (url: string) => void;
  onRetryPreview: () => void;
  onOpenViewOnce: () => void;
  onDownload: () => void;
}) {
  if (attachment.viewOnce && isImageAttachment(attachment)) {
    if (own) {
      return (
        <div className="min-w-0">
          <ViewOncePhotoPlaceholder own={own} label={t.chat.viewOncePhoto} />
          <AttachmentMetaLine own={own} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} />
        </div>
      );
    }
    if (opened) {
      return (
        <div className="min-w-0">
          <ViewOncePhotoPlaceholder own={own} label={t.chat.photoOpened} muted />
          <AttachmentMetaLine own={own} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} />
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={onOpenViewOnce}
        disabled={opening}
        className={`flex min-w-[13rem] items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-current/25 disabled:cursor-wait disabled:opacity-75 ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/78' : 'border-white/10 bg-white/[0.04] text-white/78 hover:border-accent/25 hover:bg-accent/10 hover:text-white'}`}
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/75' : 'border-emerald-300/15 bg-emerald-300/10 text-emerald-100'}`}>
          {opening ? <Spinner /> : <LockKeyhole size={17} />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{opening ? t.chat.viewPhoto : t.chat.viewPhoto}</span>
          {failed && <span className="mt-1 block text-xs text-rose-100">{t.chat.photoOpenFailed}</span>}
          <AttachmentMetaLine own={own} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} />
        </span>
      </button>
    );
  }
  if (isPreviewableMediaAttachment(attachment)) {
    const video = isVideoAttachment(attachment);
    return (
      <div className="min-w-0">
        {preview?.status === 'loaded' && preview.objectUrl ? (
          <>
            {video ? (
              <ChatVideoTile
                sourceUrl={preview.objectUrl}
                fileName={attachment.fileName}
                timestamp={timestamp}
                statusLabel={statusLabel}
                starred={starred}
                starredLabel={starredLabel}
                t={t}
                onOpen={() => onPreview(preview.objectUrl ?? '')}
              />
            ) : (
              <button type="button" onClick={() => onPreview(preview.objectUrl ?? '')} className="relative block max-w-[min(22rem,72vw)] overflow-hidden rounded-2xl bg-black/12 text-left shadow-sm ring-1 ring-white/5 transition hover:ring-emerald-300/25 focus:outline-none focus:ring-2 focus:ring-emerald-300/35">
                <img src={preview.objectUrl} alt={attachment.fileName} className="block max-h-[360px] w-full max-w-[min(22rem,72vw)] object-contain" />
                <AttachmentMetaLine own={own} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} overlay />
              </button>
            )}
          </>
        ) : preview?.status === 'error' ? (
          <div className={`flex min-w-[13rem] flex-col gap-2 rounded-xl border px-3 py-4 text-sm ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/70' : 'border-white/10 bg-white/[0.04] text-white/62'}`}>
            <span>{t.chat.mediaOpenFailed}</span>
            <button type="button" onClick={onRetryPreview} className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-current/20 ${own ? 'border-[#04100b]/15 bg-[#04100b]/10 text-[#04100b]/75 hover:bg-[#04100b]/15' : 'border-white/10 bg-white/[0.04] text-white/68 hover:border-accent/30 hover:bg-accent/10 hover:text-accent'}`}>
              {t.common.retry}
            </button>
            <AttachmentMetaLine own={own} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} />
          </div>
        ) : (
          <div className={`flex h-36 w-56 flex-col items-center justify-center gap-3 rounded-xl border ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/65' : 'border-white/10 bg-white/[0.04] text-white/48'}`}>
            <Spinner />
            <AttachmentMetaLine own={own} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} />
          </div>
        )}
      </div>
    );
  }
  const typeLabel = attachmentFileTypeLabel(attachment, t);
  const fileSize = formatFileSize(attachment.size, locale);
  const metadata = fileSize ? `${typeLabel} • ${fileSize}` : typeLabel;
  const downloadActionLabel = downloadFailed && !downloading ? t.common.retry : downloading ? t.chat.downloadingAttachment : t.chat.downloadAttachment;
  return (
    <div className={`min-w-[16rem] max-w-[min(22rem,78vw)] rounded-xl border px-3 py-2.5 shadow-sm ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 shadow-[#04100b]/5' : 'border-white/10 bg-white/[0.04] shadow-black/10'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/75' : 'border-emerald-300/15 bg-emerald-300/10 text-emerald-100'}`}>
          {attachment.attachmentType === 'video' ? <ImageIcon size={19} /> : <FileText size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5">{attachment.fileName}</p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${own ? 'border-[#04100b]/12 bg-[#04100b]/10 text-[#04100b]/65' : 'border-white/10 bg-white/[0.055] text-white/48'}`}>{typeLabel}</span>
          </div>
          <p className={`mt-1 text-xs ${own ? 'text-[#04100b]/62' : 'text-white/48'}`}>{metadata}</p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className={`grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border text-xs font-bold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${own ? 'border-[#04100b]/10 bg-[#04100b]/10 text-[#04100b]/78 hover:bg-[#04100b]/15 focus:ring-[#04100b]/20' : 'border-white/10 bg-emerald-300/[0.08] text-emerald-100 hover:bg-emerald-300/[0.13] focus:ring-emerald-300/20'}`}
          aria-label={`${downloadActionLabel} ${attachment.fileName}`}
          title={downloadActionLabel}
        >
          {downloading ? <Spinner /> : <Download size={14} />}
        </button>
      </div>
      {transferProgress && (
        <TransferProgressRow
          label={t.chat.downloadProgress}
          statusLabel={t.chat.downloading}
          percent={transferProgress.percent}
        />
      )}
      <AttachmentMetaLine own={own} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} card />
      {downloadFailed && (
        <p className={`border-t px-3.5 py-2 text-xs font-medium ${own ? 'border-[#04100b]/10 text-[#04100b]/70' : 'border-white/10 text-rose-100'}`}>
          {t.chat.attachmentDownloadFailed}
        </p>
      )}
    </div>
  );
}

function ChatVideoTile({
  sourceUrl,
  fileName,
  timestamp,
  statusLabel,
  starred,
  starredLabel,
  t,
  onOpen,
}: {
  sourceUrl: string;
  fileName: string;
  timestamp: string;
  statusLabel?: string;
  starred: boolean;
  starredLabel: string;
  t: ReturnType<typeof useI18n>['t'];
  onOpen: () => void;
}) {
  const [durationLabel, setDurationLabel] = useState('');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block max-w-[min(22rem,72vw)] overflow-hidden rounded-2xl bg-black/35 text-left shadow-sm ring-1 ring-white/5 transition hover:ring-emerald-300/35 focus:outline-none focus:ring-2 focus:ring-emerald-300/45"
      aria-label={`${t.chat.openVideo} ${fileName}`}
    >
      <video
        src={sourceUrl}
        preload="metadata"
        muted
        playsInline
        onLoadedMetadata={(event) => setDurationLabel(formatMediaDuration(event.currentTarget.duration))}
        className="block max-h-[360px] w-full max-w-[min(22rem,72vw)] bg-black object-contain"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white shadow-lg shadow-black/35 backdrop-blur-md transition group-hover:scale-105 group-hover:bg-black/60">
          <Play size={28} fill="currentColor" className="ml-0.5" />
        </span>
      </span>
      {durationLabel && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold leading-none text-white/92 shadow-lg shadow-black/25 backdrop-blur-md">
          {durationLabel}
        </span>
      )}
      <AttachmentMetaLine own={false} timestamp={timestamp} statusLabel={statusLabel} starred={starred} starredLabel={starredLabel} overlay />
    </button>
  );
}

type VideoElementWithPictureInPicture = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
};

function VideoPreviewModal({
  preview,
  t,
  starred,
  onGoToMessage,
  onReply,
  onToggleStar,
  onDownload,
  onClose,
}: {
  preview: ImagePreviewState;
  t: ReturnType<typeof useI18n>['t'];
  starred: boolean;
  onGoToMessage: () => void;
  onReply: () => void;
  onToggleStar: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [pictureInPictureAvailable, setPictureInPictureAvailable] = useState(false);
  const [pictureInPictureError, setPictureInPictureError] = useState('');

  const close = useCallback(() => {
    videoRef.current?.pause();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const video = videoRef.current as VideoElementWithPictureInPicture | null;
    setPictureInPictureAvailable(Boolean(video?.requestPictureInPicture));
  }, [preview.url]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      videoRef.current?.pause();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [close]);

  async function requestPictureInPicture() {
    setPictureInPictureError('');
    const video = videoRef.current as VideoElementWithPictureInPicture | null;
    if (!video?.requestPictureInPicture) {
      setPictureInPictureError(t.chat.pictureInPictureUnavailable);
      return;
    }
    try {
      await video.requestPictureInPicture();
    } catch {
      setPictureInPictureError(t.chat.pictureInPictureUnavailable);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-black/88 backdrop-blur-sm" onMouseDown={close}>
      <div className="flex min-h-0 w-full flex-col" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={preview.name}>
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <ProfilePhoto
              name={preview.sender?.name ?? preview.name}
              avatarUrl={preview.sender?.avatarUrl ?? null}
              dicebearStyle={preview.sender?.dicebearStyle ?? null}
              dicebearSeed={preview.sender?.dicebearSeed ?? null}
              size="sm"
              className="h-10 w-10 rounded-full border border-emerald-300/15 bg-emerald-300/10 text-xs text-emerald-100"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{preview.sender?.name ?? preview.name}</p>
              {preview.timestampLabel && <p className="mt-0.5 truncate text-xs text-white/55">{preview.timestampLabel}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <MediaViewerActionButton label={t.chat.goToMessage} onClick={onGoToMessage}>
              <ArrowRight size={16} />
            </MediaViewerActionButton>
            <MediaViewerActionButton label={t.chat.reply} onClick={onReply}>
              <MessageSquareReply size={16} />
            </MediaViewerActionButton>
            <MediaViewerActionButton label={starred ? t.chat.unstarMessage : t.chat.starMessage} onClick={onToggleStar}>
              <Star size={16} fill={starred ? 'currentColor' : 'none'} />
            </MediaViewerActionButton>
            <MediaViewerActionButton label={t.chat.downloadAttachment} onClick={onDownload}>
              <Download size={16} />
            </MediaViewerActionButton>
            {pictureInPictureAvailable && (
              <MediaViewerActionButton label={t.chat.pictureInPicture} onClick={() => void requestPictureInPicture()}>
                <PictureInPicture2 size={16} />
              </MediaViewerActionButton>
            )}
            <MediaViewerActionButton label={t.common.close} onClick={close}>
              <X size={17} />
            </MediaViewerActionButton>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-5 sm:px-6">
          <video
            ref={videoRef}
            src={preview.url}
            controls
            playsInline
            preload="metadata"
            className="max-h-full max-w-full rounded-2xl bg-black shadow-2xl shadow-black/55 ring-1 ring-white/10"
            aria-label={preview.name}
          />
        </div>
        {pictureInPictureError && (
          <p className="pointer-events-none fixed bottom-5 left-1/2 z-10 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-center text-xs font-medium text-amber-100 backdrop-blur">
            {pictureInPictureError}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

function MediaViewerActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/35 text-white/72 backdrop-blur transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function ImagePreviewModal({
  preview,
  closeLabel,
  downloadLabel,
  downloadError,
  onDownload,
  t,
  starred = false,
  onGoToMessage,
  onReply,
  onToggleStar,
  onClose,
}: {
  preview: ImagePreviewState;
  closeLabel: string;
  downloadLabel?: string;
  downloadError?: string;
  onDownload?: () => void;
  t?: ReturnType<typeof useI18n>['t'];
  starred?: boolean;
  onGoToMessage?: () => void;
  onReply?: () => void;
  onToggleStar?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="relative max-h-[90dvh] max-w-[92vw]" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={preview.name}>
        {(preview.sender || preview.timestampLabel) && (
          <div className="absolute left-3 top-3 z-10 flex min-w-0 max-w-[min(22rem,calc(100%-7rem))] items-center gap-3 rounded-full border border-white/10 bg-black/45 px-2.5 py-2 text-white shadow-lg shadow-black/25 backdrop-blur-md">
            <ProfilePhoto
              name={preview.sender?.name ?? preview.name}
              avatarUrl={preview.sender?.avatarUrl ?? null}
              dicebearStyle={preview.sender?.dicebearStyle ?? null}
              dicebearSeed={preview.sender?.dicebearSeed ?? null}
              size="sm"
              className="h-8 w-8 rounded-full border border-emerald-300/15 bg-emerald-300/10 text-[11px] text-emerald-100"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">{preview.sender?.name ?? preview.name}</span>
              {preview.timestampLabel && <span className="mt-0.5 block truncate text-[11px] text-white/58">{preview.timestampLabel}</span>}
            </span>
          </div>
        )}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {t && onGoToMessage && (
            <MediaViewerActionButton label={t.chat.goToMessage} onClick={onGoToMessage}>
              <ArrowRight size={16} />
            </MediaViewerActionButton>
          )}
          {t && onReply && (
            <MediaViewerActionButton label={t.chat.reply} onClick={onReply}>
              <MessageSquareReply size={16} />
            </MediaViewerActionButton>
          )}
          {t && onToggleStar && (
            <MediaViewerActionButton label={starred ? t.chat.unstarMessage : t.chat.starMessage} onClick={onToggleStar}>
              <Star size={16} fill={starred ? 'currentColor' : 'none'} />
            </MediaViewerActionButton>
          )}
          {onDownload && downloadLabel && (
            <button type="button" onClick={onDownload} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 text-xs font-semibold text-white/75 backdrop-blur transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20">
              <Download size={14} />
              {downloadLabel}
            </button>
          )}
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/45 text-white/75 backdrop-blur transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20" aria-label={closeLabel}>
            <X size={16} />
          </button>
        </div>
        <img src={preview.url} alt={preview.name} className="max-h-[90dvh] max-w-[92vw] rounded-2xl object-contain shadow-2xl shadow-black/50" />
        {downloadError && (
          <p className="absolute bottom-3 left-1/2 z-10 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-center text-xs font-medium text-rose-100 backdrop-blur">
            {downloadError}
          </p>
        )}
      </div>
    </div>
  );
}

function ChatEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-full place-items-center px-6 py-10 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <div className="chat-empty-logo mb-6 grid h-24 w-24 place-items-center rounded-3xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3 shadow-2xl shadow-emerald-950/25">
          <img src="/Pona Ekolo.svg" alt="" aria-hidden="true" className="h-full w-full rounded-2xl object-contain" />
        </div>
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="mt-2 text-sm leading-6 text-white/48">{description}</p>
      </div>
    </div>
  );
}

function ChatRecoveryDialog({
  open,
  busy,
  confirmingIdentity,
  t,
  onRestore,
  onCreateIdentity,
  onConfirmIdentity,
  onCancelIdentity,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  confirmingIdentity: boolean;
  t: ReturnType<typeof useI18n>['t'];
  onRestore: () => void;
  onCreateIdentity: () => void;
  onConfirmIdentity: () => void;
  onCancelIdentity: () => void;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const createIdentityButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelIdentityButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousConfirmationRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onCancelIdentityRef = useRef(onCancelIdentity);
  const busyRef = useRef(busy);
  const confirmingIdentityRef = useRef(confirmingIdentity);
  onCloseRef.current = onClose;
  onCancelIdentityRef.current = onCancelIdentity;
  busyRef.current = busy;
  confirmingIdentityRef.current = confirmingIdentity;

  useEffect(() => {
    if (!open) {
      previousConfirmationRef.current = false;
      return;
    }
    const wasConfirming = previousConfirmationRef.current;
    previousConfirmationRef.current = confirmingIdentity;
    const focusFrame = window.requestAnimationFrame(() => {
      if (confirmingIdentity) cancelIdentityButtonRef.current?.focus();
      else if (wasConfirming) createIdentityButtonRef.current?.focus();
      else restoreButtonRef.current?.focus();
    });
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (busyRef.current) return;
      if (confirmingIdentityRef.current) onCancelIdentityRef.current();
      else onCloseRef.current();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [confirmingIdentity, open]);

  function dismissActiveStep() {
    if (busy) return;
    if (confirmingIdentity) onCancelIdentity();
    else onClose();
  }

  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[240] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={dismissActiveStep}>
      <div
        ref={dialogRef}
        id="chat-recovery-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={confirmingIdentity ? 'chat-identity-confirmation-title' : 'chat-recovery-popup-title'}
        aria-describedby={confirmingIdentity ? 'chat-identity-confirmation-description' : 'chat-recovery-popup-description'}
        aria-busy={busy}
        onKeyDown={keepFocusInside}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-[27rem] rounded-xl border border-white/10 bg-[#0b1411] p-5 shadow-2xl shadow-black/55"
      >
        {confirmingIdentity ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-300/20 bg-amber-300/10 text-amber-200">
                  <AlertTriangle size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="chat-identity-confirmation-title" className="text-base font-semibold text-white">{t.chat.createNewIdentityConfirmTitle}</h2>
                  <p id="chat-identity-confirmation-description" className="mt-2 text-sm leading-6 text-white/55">{t.chat.createNewIdentityConfirmDescription}</p>
                </div>
              </div>
              <button type="button" onClick={dismissActiveStep} disabled={busy} aria-label={t.common.close} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/35 disabled:cursor-not-allowed disabled:opacity-45">
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button ref={cancelIdentityButtonRef} type="button" onClick={onCancelIdentity} disabled={busy} className="min-h-10 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50">
                {t.common.cancel}
              </button>
              <button type="button" onClick={onConfirmIdentity} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-amber-200/25 bg-amber-300/15 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <Spinner /> : <RefreshCw size={15} aria-hidden="true" />}
                {busy ? t.chat.creatingNewIdentity : t.chat.createNewIdentityConfirmAction}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="chat-recovery-popup-title" className="text-base font-semibold text-white">{t.chat.restoreEncryptedChat}</h2>
                <p id="chat-recovery-popup-description" className="mt-2 text-sm leading-6 text-white/55">{t.chat.restoreEncryptedChatDescription}</p>
              </div>
              <button type="button" onClick={dismissActiveStep} disabled={busy} aria-label={t.common.close} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-45">
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid gap-2">
              <button ref={restoreButtonRef} type="button" onClick={onRestore} disabled={busy} className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50 disabled:cursor-not-allowed disabled:opacity-50">
                <Upload size={15} aria-hidden="true" />
                {t.chat.restoreEncryptedChat}
              </button>
              <button ref={createIdentityButtonRef} type="button" onClick={onCreateIdentity} disabled={busy} className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-white/72 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw size={15} aria-hidden="true" />
                {t.chat.createNewIdentity}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function KeyBackupModal({
  open,
  mode,
  keyStatus,
  hasLocalKey,
  password,
  confirmPassword,
  file,
  replaceConfirmed,
  busy,
  message,
  t,
  onMode,
  onPassword,
  onConfirmPassword,
  onFile,
  onReplaceConfirmed,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: 'export' | 'import';
  keyStatus: ChatKeySetupState;
  hasLocalKey: boolean;
  password: string;
  confirmPassword: string;
  file: File | null;
  replaceConfirmed: boolean;
  busy: boolean;
  message: { tone: 'good' | 'bad'; text: string } | null;
  t: ReturnType<typeof useI18n>['t'];
  onMode: (mode: 'export' | 'import') => void;
  onPassword: (value: string) => void;
  onConfirmPassword: (value: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onReplaceConfirmed: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const exportMode = mode === 'export';
  const submitLabel = exportMode ? t.chat.downloadBackup : t.chat.importBackup;
  const disabled = busy || (exportMode && keyStatus !== 'ready') || (!exportMode && (!file || (hasLocalKey && !replaceConfirmed)));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <form onSubmit={onSubmit} className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0b1210]/95 shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t.chat.keyBackup}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">{t.chat.secureKeys}</h2>
            <p className="mt-1 text-sm text-white/48">{t.chat.keyBackupSafetyNote}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label={t.common.close}>
            <X size={15} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{t.chat.secureKeys}</p>
            <p className={`mt-2 text-sm font-semibold ${keyStatus === 'ready' ? 'text-emerald-100' : keyStatus === 'failed' ? 'text-rose-100' : 'text-amber-100'}`}>{keyStatusLabel(keyStatus, t)}</p>
            <p className="mt-2 text-xs leading-5 text-white/45">{t.chat.privateKeysStayOnDevice}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-white/[0.035] p-1">
            <button type="button" disabled={busy} onClick={() => onMode('export')} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${exportMode ? 'bg-accent text-[#04100b]' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'}`}>{t.chat.exportEncryptedBackup}</button>
            <button type="button" disabled={busy} onClick={() => onMode('import')} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${!exportMode ? 'bg-accent text-[#04100b]' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'}`}>{t.chat.importEncryptedBackup}</button>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.chat.recoveryPassword}</span>
            <input type="password" value={password} onChange={(event) => onPassword(event.target.value)} disabled={busy} autoComplete="new-password" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-55" />
          </label>

          {exportMode ? (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.chat.confirmRecoveryPassword}</span>
              <input type="password" value={confirmPassword} onChange={(event) => onConfirmPassword(event.target.value)} disabled={busy} autoComplete="new-password" className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-55" />
            </label>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.chat.importBackup}</span>
                <input type="file" accept="application/json,.json" onChange={onFile} disabled={busy} className="mt-2 block w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-white/15 disabled:cursor-not-allowed disabled:opacity-55" />
              </label>
              {file && <p className="truncate text-xs text-white/45">{file.name}</p>}
              {hasLocalKey && (
                <label className="flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-3 text-xs leading-5 text-amber-50">
                  <input type="checkbox" checked={replaceConfirmed} onChange={(event) => onReplaceConfirmed(event.target.checked)} disabled={busy} className="mt-1" />
                  <span>{t.chat.importWillReplaceKey}</span>
                </label>
              )}
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs leading-5 text-white/50">
            <p>{t.chat.recoveryPasswordNeverSent}</p>
            <p className="mt-1">{t.chat.keyBackupSafetyNote}</p>
          </div>

          {message && (
            <p className={`rounded-xl border px-3 py-2 text-sm ${message.tone === 'good' ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-rose-300/20 bg-rose-300/10 text-rose-100'}`}>{message.text}</p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-55">{t.common.close}</button>
            <Button type="submit" disabled={disabled} className="gap-2 px-4 py-2">
              {busy ? <Spinner /> : exportMode ? <Download size={14} /> : <Upload size={14} />}
              {submitLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ParticipantPickerModal({
  open,
  participants,
  search,
  loading,
  error,
  startingUserId,
  canStartChat,
  t,
  onSearch,
  onRetry,
  onStart,
  onClose,
}: {
  open: boolean;
  participants: ChatParticipant[];
  search: string;
  loading: boolean;
  error: string;
  startingUserId: string;
  canStartChat: boolean;
  t: ReturnType<typeof useI18n>['t'];
  onSearch: (value: string) => void;
  onRetry: () => void;
  onStart: (userId: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b1210]/95 shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t.chat.startSecureChat}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">{t.chat.startSecureChat}</h2>
            <p className="mt-1 text-sm text-white/48">{t.chat.selectParticipant}</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(startingUserId)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label={t.common.close}>
            <X size={15} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} />
            <input
              autoFocus
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={t.chat.searchMembers}
              className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/40"
            />
          </label>
          {!canStartChat ? (
            <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{t.chat.startChatPermissionDenied}</p>
          ) : error ? (
            <div className="flex flex-col gap-3 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <button type="button" onClick={onRetry} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-950 transition hover:bg-white">{t.common.retry}</button>
            </div>
          ) : loading ? (
            <ConversationSkeleton />
          ) : participants.length === 0 ? (
            <TableEmptyState title={t.chat.noParticipantsFound} />
          ) : (
            <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
              {participants.map((participant) => {
                const starting = startingUserId === participant.userId;
                return (
                  <div key={participant.userId} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <ProfilePhoto name={participant.name} avatarUrl={participant.avatarUrl} dicebearStyle={participant.dicebearStyle} dicebearSeed={participant.dicebearSeed} size="sm" className="h-10 w-10 rounded-full border-emerald-300/15 bg-emerald-300/10 text-xs text-emerald-100" />
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{participant.name}</p>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold uppercase text-white/48">{userRoleLabel(t, participant.role)}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-white/45">{participant.email}</p>
                        <p className={`mt-2 text-xs font-medium ${participant.hasChatKey ? 'text-emerald-100' : 'text-amber-100'}`}>
                          {participant.hasChatKey ? t.chat.secureKeyReady : t.chat.secureKeyUnavailable}
                        </p>
                      </div>
                    </div>
                    <Button type="button" onClick={() => onStart(participant.userId)} disabled={Boolean(startingUserId)} className="shrink-0 px-4 py-2">
                      {starting ? <Spinner /> : t.chat.startChat}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupCreationModal({
  open,
  participants,
  search,
  loading,
  error,
  title,
  selectedParticipantIds,
  step,
  creating,
  t,
  onSearch,
  onTitle,
  onToggleParticipant,
  onStep,
  onRetry,
  onCreate,
  onClose,
}: {
  open: boolean;
  participants: ChatParticipant[];
  search: string;
  loading: boolean;
  error: string;
  title: string;
  selectedParticipantIds: string[];
  step: GroupCreationStep;
  creating: boolean;
  t: ReturnType<typeof useI18n>['t'];
  onSearch: (value: string) => void;
  onTitle: (value: string) => void;
  onToggleParticipant: (userId: string) => void;
  onStep: (step: GroupCreationStep) => void;
  onRetry: () => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  const selectedParticipants = participants.filter((participant) => selectedParticipantIds.includes(participant.userId));
  const canContinue = selectedParticipantIds.length >= minimumGroupMembers;
  const canCreate = canContinue && Boolean(title.trim());
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0b1210]/95 shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={t.chat.newGroup}>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">{step === 'select' ? t.chat.newGroup : t.chat.nameYourGroup}</h2>
            <p className="mt-1 text-sm text-white/48">{step === 'select' ? t.chat.selectAtLeastTwoMembers : t.chat.groupCreateDescription}</p>
          </div>
          <button type="button" onClick={onClose} disabled={creating} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label={t.common.close}>
            <X size={15} />
          </button>
        </div>
        {step === 'select' ? (
          <div className="space-y-4 p-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} />
              <input
                autoFocus
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder={t.chat.searchMembers}
                className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/40"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-white/45">{t.chat.selectedMembersCount(selectedParticipantIds.length)}</p>
              <button type="button" onClick={() => onStep('details')} disabled={!canContinue} className="inline-flex h-9 items-center gap-2 rounded-full border border-accent/20 bg-accent/12 px-3 text-xs font-semibold text-accent transition hover:border-accent/35 hover:bg-accent/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/35" aria-label={t.chat.continueAction}>
                {t.chat.continueAction}
                <ArrowRight size={14} />
              </button>
            </div>
            {error ? (
              <div className="flex flex-col gap-3 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <button type="button" onClick={onRetry} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-950 transition hover:bg-white">{t.common.retry}</button>
              </div>
            ) : loading ? (
              <ConversationSkeleton />
            ) : participants.length === 0 ? (
              <TableEmptyState title={t.chat.noParticipantsFound} />
            ) : (
              <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                {participants.map((participant) => {
                  const selected = selectedParticipantIds.includes(participant.userId);
                  return (
                    <button key={participant.userId} type="button" onClick={() => onToggleParticipant(participant.userId)} className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${selected ? 'border-accent/25 bg-accent/10' : 'border-white/10 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]'}`} aria-pressed={selected}>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-black ${selected ? 'border-accent/40 bg-accent text-[#04100b]' : 'border-white/15 bg-black/20 text-transparent'}`}>✓</span>
                      <ProfilePhoto name={participant.name} avatarUrl={participant.avatarUrl} dicebearStyle={participant.dicebearStyle} dicebearSeed={participant.dicebearSeed} size="sm" className="rounded-full border-emerald-300/15 bg-emerald-300/10 text-xs text-emerald-100" />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-white">{participant.name}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold uppercase text-white/48">{userRoleLabel(t, participant.role)}</span>
                        </span>
                        <span className={`mt-1 block text-xs font-medium ${participant.hasChatKey ? 'text-emerald-100' : 'text-amber-100'}`}>
                          {participant.hasChatKey ? t.chat.secureKeyReady : t.chat.secureKeyUnavailable}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.chat.groupName}</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => onTitle(event.target.value)}
                maxLength={80}
                placeholder={t.chat.groupTitlePlaceholder}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/40"
              />
            </label>
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.chat.selectedMembersCount(selectedParticipants.length)}</p>
              <div className="flex flex-wrap gap-2">
                {selectedParticipants.map((participant) => (
                  <span key={participant.userId} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-xs font-medium text-white/72">
                    <ProfilePhoto name={participant.name} avatarUrl={participant.avatarUrl} dicebearStyle={participant.dicebearStyle} dicebearSeed={participant.dicebearSeed} size="sm" className="h-6 w-6 rounded-full text-[10px]" />
                    <span className="truncate">{participant.name}</span>
                  </span>
                ))}
              </div>
            </div>
            {error && <p className="rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => onStep('select')} disabled={creating} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-55">
                <ArrowLeft size={14} />
                {t.common.back}
              </button>
              <Button type="button" onClick={onCreate} disabled={creating || !canCreate} className="gap-2 px-4 py-2">
                {creating ? <Spinner /> : <Users size={14} />}
                {t.chat.createGroup}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupMembersPanel({
  open,
  initialView,
  conversation,
  participants,
  addableParticipants,
  loading,
  error,
  addMembersOpen,
  addMemberSearch,
  selectedAddMemberIds,
  addingMembers,
  removingUserId,
  updatingGroupName,
  transferringOwnership,
  leavingGroup,
  currentUserId,
  messages,
  starredMessages,
  loadingStarredMessages,
  starredMessagesError,
  decryptedMessages,
  imagePreviewsByAttachmentId,
  locale,
  t,
  onRetry,
  onToggleAddMembers,
  onAddMemberSearch,
  onToggleAddMember,
  onAddMembers,
  onRemoveMember,
  onUpdateGroupName,
  onTransferOwnership,
  onLoadStarredMessages,
  onSearchResult,
  muted,
  notificationSettingsBusy,
  onToggleMute,
  onPreviewMedia,
  onDownloadAttachment,
  onClearChat,
  onLeaveGroup,
  onClose,
}: {
  open: boolean;
  initialView: GroupPanelView;
  conversation: ChatConversation | null | undefined;
  participants: ChatGroupParticipant[];
  addableParticipants: ChatParticipant[];
  loading: boolean;
  error: string;
  addMembersOpen: boolean;
  addMemberSearch: string;
  selectedAddMemberIds: string[];
  addingMembers: boolean;
  removingUserId: string;
  updatingGroupName: boolean;
  transferringOwnership: boolean;
  leavingGroup: boolean;
  currentUserId?: string;
  messages: ChatMessage[];
  starredMessages: ChatMessage[];
  loadingStarredMessages: boolean;
  starredMessagesError: string;
  decryptedMessages: Record<string, string>;
  imagePreviewsByAttachmentId: Record<string, AttachmentPreview>;
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  onRetry: () => void;
  onToggleAddMembers: () => void;
  onAddMemberSearch: (value: string) => void;
  onToggleAddMember: (userId: string) => void;
  onAddMembers: () => void;
  onRemoveMember: (userId: string) => void;
  onUpdateGroupName: (title: string) => void;
  onTransferOwnership: (userId: string) => void;
  onLoadStarredMessages: () => void;
  onSearchResult: (messageId: string) => boolean;
  muted: boolean;
  notificationSettingsBusy: boolean;
  onToggleMute: () => void;
  onPreviewMedia: (message: ChatMessage, attachment: EncryptedAttachmentPayload, preview: AttachmentPreview) => void;
  onDownloadAttachment: (message: ChatMessage, attachment: EncryptedAttachmentPayload) => void;
  onClearChat: () => void;
  onLeaveGroup: () => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [view, setView] = useState<GroupPanelView>('info');
  const [visibleParticipantCount, setVisibleParticipantCount] = useState(groupMembersPageSize);
  const [editingName, setEditingName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(conversation?.title ?? '');
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [dateSearchValue, setDateSearchValue] = useState('');
  const currentParticipant = participants.find((participant) => participant.userId === currentUserId);
  const isOwner = currentParticipant?.role === 'OWNER';
  const busy = addingMembers || Boolean(removingUserId) || updatingGroupName || transferringOwnership || leavingGroup;
  const groupName = conversation ? conversationRecipientLabel(conversation, currentUserId, t.chat.directConversation) : '';
  const visibleParticipants = participants.slice(0, visibleParticipantCount);
  const hasMoreParticipants = visibleParticipantCount < participants.length;
  const transferCandidates = participants.filter((participant) => participant.userId !== currentUserId);
  const normalizedGroupSearchQuery = normalizeSearchQuery(groupSearchQuery);
  const groupSearchResults = useMemo(() => (
    buildConversationSearchResults({
      messages,
      decryptedMessages,
      query: normalizedGroupSearchQuery,
      conversation: conversation ?? undefined,
      currentUserId,
      t,
    })
  ), [conversation, currentUserId, decryptedMessages, messages, normalizedGroupSearchQuery, t]);
  const groupMediaItems = useMemo(() => (
    buildGroupMediaPanelItems(messages, decryptedMessages, imagePreviewsByAttachmentId)
  ), [decryptedMessages, imagePreviewsByAttachmentId, messages]);
  const groupNameChanged = groupNameDraft.trim() !== (conversation?.title ?? '');

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setView(initialView);
    setVisibleParticipantCount(groupMembersPageSize);
    setEditingName(false);
    setGroupNameDraft(conversation?.title ?? '');
    setTransferTargetUserId('');
    setGroupSearchQuery('');
    setDateSearchValue('');
  }, [conversation?.id, conversation?.title, initialView, open]);

  function saveGroupName() {
    const nextTitle = groupNameDraft.trim();
    if (!nextTitle || !groupNameChanged || updatingGroupName) return;
    onUpdateGroupName(nextTitle);
    setEditingName(false);
  }

  function jumpToDate(value: string) {
    setDateSearchValue(value);
    if (!value) return;
    const matchingMessage = messages.find((message) => localDateInputValue(message.createdAt) === value);
    if (!matchingMessage || !onSearchResult(matchingMessage.id)) {
      toast(t.chat.noMessagesFoundForDate);
    }
  }

  if (!open || !conversation) return null;

  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-[27rem] translate-x-0 flex-col border-l border-white/10 bg-[#07100d]/95 shadow-2xl shadow-black/45 backdrop-blur-xl sm:w-[min(27rem,82%)]" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="false" aria-label={t.chat.groupInfo}>
        {view === 'search' ? (
          <GroupMessageSearchPanel
            groupName={groupName}
            query={groupSearchQuery}
            dateValue={dateSearchValue}
            minDate={localDateInputValue(conversation.createdAt)}
            maxDate={localDateInputValue(new Date().toISOString())}
            results={groupSearchResults}
            locale={locale}
            t={t}
            onBack={() => setView('info')}
            onQueryChange={setGroupSearchQuery}
            onDateChange={jumpToDate}
            onSelect={(messageId) => {
              if (onSearchResult(messageId)) setView('info');
            }}
          />
        ) : view === 'starred' ? (
          <GroupStarredMessagesPanel
            messages={starredMessages}
            loadedMessageIds={new Set(messages.map((message) => message.id))}
            loading={loadingStarredMessages}
            error={starredMessagesError}
            decryptedMessages={decryptedMessages}
            t={t}
            onBack={() => setView('info')}
            onRetry={onLoadStarredMessages}
            onSelect={(messageId) => {
              if (onSearchResult(messageId)) setView('info');
            }}
          />
        ) : view === 'media' ? (
          <GroupMediaDocsPanel
            mediaItems={groupMediaItems.media}
            docItems={groupMediaItems.docs}
            linkItems={groupMediaItems.links}
            locale={locale}
            t={t}
            onBack={() => setView('info')}
            onSelectMessage={(messageId) => {
              if (onSearchResult(messageId)) setView('info');
            }}
            onPreviewMedia={onPreviewMedia}
            onDownloadAttachment={onDownloadAttachment}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <h2 className="text-base font-semibold text-white">{t.chat.groupInfo}</h2>
              <button ref={closeButtonRef} type="button" onClick={onClose} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/62 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50" aria-label={t.common.close}>
                <X size={16} />
              </button>
            </div>
            <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6">
              <div className="text-center">
                <GroupInfoAvatarGroup participants={participants} t={t} />
                <div className="mt-4">
                  <GroupNameEditor
                    value={groupNameDraft}
                    title={groupName}
                    editing={editingName}
                    canEdit={isOwner}
                    busy={updatingGroupName}
                    changed={groupNameChanged}
                    t={t}
                    onEdit={() => setEditingName(true)}
                    onChange={setGroupNameDraft}
                    onSave={saveGroupName}
                    onCancel={() => {
                      setGroupNameDraft(conversation.title ?? '');
                      setEditingName(false);
                    }}
                  />
                  <p className="mt-1 text-sm text-white/45">{t.chat.groupMemberCount(participants.length)}</p>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {isOwner && (
                    <GroupInfoAction icon={<UserPlus size={19} />} label={t.chat.addMember} onClick={onToggleAddMembers} disabled={busy} />
                  )}
                  <GroupInfoAction icon={<Search size={19} />} label={t.chat.searchMessages} onClick={() => setView('search')} />
                  <GroupInfoAction icon={<Star size={19} />} label={t.chat.starredMessages} onClick={() => { setView('starred'); onLoadStarredMessages(); }} />
                </div>
              </div>

              {addMembersOpen && isOwner && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white/75">{t.chat.addMember}</p>
                    <Button type="button" onClick={onAddMembers} disabled={addingMembers || selectedAddMemberIds.length === 0} className="gap-2 px-3 py-1.5 text-xs">
                      {addingMembers ? <Spinner /> : <Plus size={13} />}
                      {t.chat.addMembers}
                    </Button>
                  </div>
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} />
                    <input
                      value={addMemberSearch}
                      onChange={(event) => onAddMemberSearch(event.target.value)}
                      placeholder={t.chat.searchMembers}
                      className="h-10 w-full rounded-full border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/40"
                    />
                  </label>
                  <div className="chat-scrollbar mt-3 max-h-56 overflow-y-auto divide-y divide-white/[0.06] pr-1">
                    {addableParticipants.length === 0 ? (
                      <p className="px-2 py-6 text-center text-sm text-white/45">{t.chat.noParticipantsFound}</p>
                    ) : addableParticipants.map((participant) => {
                      const selected = selectedAddMemberIds.includes(participant.userId);
                      return (
                        <button key={participant.userId} type="button" onClick={() => onToggleAddMember(participant.userId)} disabled={addingMembers} className="flex w-full min-w-0 items-center gap-3 px-2 py-3 text-left transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60" aria-pressed={selected}>
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-black ${selected ? 'border-accent/40 bg-accent text-[#04100b]' : 'border-white/15 bg-black/20 text-transparent'}`}>✓</span>
                          <ProfilePhoto name={participant.name} avatarUrl={participant.avatarUrl} dicebearStyle={participant.dicebearStyle} dicebearSeed={participant.dicebearSeed} size="sm" className="h-9 w-9 rounded-full border-emerald-300/15 bg-emerald-300/10 text-xs text-emerald-100" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-white">{participant.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-white/45">{participant.email}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isOwner && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="mb-2 text-sm font-semibold text-white/70">{t.chat.groupPermissions}</p>
                  <div className="flex items-center gap-2">
                    <GroupOwnerCombobox
                      participants={transferCandidates}
                      value={transferTargetUserId}
                      disabled={busy || transferCandidates.length === 0}
                      t={t}
                      onChange={setTransferTargetUserId}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const target = transferCandidates.find((participant) => participant.userId === transferTargetUserId);
                        if (!target) return;
                        if (window.confirm(t.chat.transferOwnershipConfirm(target.name))) onTransferOwnership(target.userId);
                      }}
                      disabled={transferringOwnership || !transferTargetUserId}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-accent/20 bg-accent/12 px-3 text-xs font-semibold text-accent transition hover:border-accent/35 hover:bg-accent/18 focus:border-accent/35 focus:bg-accent/18 focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {transferringOwnership ? <Spinner /> : t.chat.transferOwnershipAction}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 border-t border-white/10 pt-5">
                <GroupInfoRow icon={<LockKeyhole size={18} />} label={t.chat.encryption} description={t.chat.e2eeDescription} />
                <GroupInfoRow icon={muted ? <BellOff size={18} /> : <Bell size={18} />} label={t.chat.notificationSettings} description={muted ? t.chat.muted : t.chat.notificationsOn} onClick={onToggleMute} disabled={notificationSettingsBusy} />
                <GroupInfoRow icon={<ImageIcon size={18} />} label={t.chat.mediaLinksAndDocs} onClick={() => setView('media')} />
                <GroupInfoRow icon={<Star size={18} />} label={t.chat.starredMessages} onClick={() => { setView('starred'); onLoadStarredMessages(); }} />
                <GroupInfoRow icon={<Eraser size={18} />} label={t.chat.clearChat} onClick={onClearChat} />
              </div>

              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white/70">{t.chat.membersCount(participants.length)}</h3>
                  {isOwner && (
                    <button type="button" onClick={onToggleAddMembers} disabled={busy} className="grid h-9 w-9 place-items-center rounded-full text-white/62 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-55" aria-label={t.chat.addMember} title={t.chat.addMember}>
                      <UserPlus size={16} />
                    </button>
                  )}
                </div>
                {error ? (
                  <div className="flex items-center justify-between gap-3 px-2 py-3 text-sm text-rose-100">
                    <span>{error}</span>
                    <button type="button" onClick={onRetry} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-950 transition hover:bg-white">{t.common.retry}</button>
                  </div>
                ) : loading ? (
                  <ConversationSkeleton />
                ) : (
                  <div className="chat-scrollbar max-h-[21rem] overflow-y-auto divide-y divide-white/[0.06] pr-1">
                    {visibleParticipants.map((participant) => {
                      const participantIsOwner = participant.role === 'OWNER';
                      const isCurrentUser = participant.userId === currentUserId;
                      const canRemove = isOwner && !participantIsOwner && !isCurrentUser;
                      return (
                        <div key={participant.userId} className="flex min-w-0 items-center gap-3 px-2 py-3 transition hover:bg-white/[0.035]">
                          <ProfilePhoto name={participant.name} avatarUrl={participant.avatarUrl} dicebearStyle={participant.dicebearStyle} dicebearSeed={participant.dicebearSeed} size="sm" className="h-10 w-10 rounded-full border-emerald-300/15 bg-emerald-300/10 text-xs text-emerald-100" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{isCurrentUser ? t.chat.you : participant.name}</p>
                            <p className="mt-0.5 truncate text-xs text-white/45">{participant.email}</p>
                          </div>
                          {participantIsOwner && <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-white/65">{t.chat.groupAdmin}</span>}
                          {canRemove && (
                            <button type="button" onClick={() => onRemoveMember(participant.userId)} disabled={Boolean(removingUserId) || addingMembers || leavingGroup} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-rose-100/70 transition hover:bg-rose-300/10 hover:text-rose-50 focus:bg-rose-300/10 focus:text-rose-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-55" aria-label={t.chat.removeMember} title={t.chat.removeMember}>
                              {removingUserId === participant.userId ? <Spinner /> : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {hasMoreParticipants && (
                  <button
                    type="button"
                    onClick={() => setVisibleParticipantCount((current) => Math.min(current + groupMembersPageSize, participants.length))}
                    className="mt-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/62 transition hover:border-white/14 hover:bg-white/[0.055] hover:text-white focus:border-accent/30 focus:bg-accent/10 focus:text-accent focus:outline-none"
                  >
                    {t.chat.loadMore}
                  </button>
                )}
              </div>

              <div className="mt-6 border-t border-white/10 pt-4">
                {isOwner && <p className="mb-2 text-xs text-amber-100">{t.chat.groupOwnerLeaveBlocked}</p>}
                <button type="button" onClick={onLeaveGroup} disabled={isOwner || busy} className="flex w-full items-center justify-center gap-2 rounded-full border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2.5 text-sm font-semibold text-rose-100 transition hover:border-rose-200/35 hover:bg-rose-300/12 disabled:cursor-not-allowed disabled:opacity-55">
                  {leavingGroup ? <Spinner /> : <X size={14} />}
                  {t.chat.exitGroup}
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function GroupMediaDocsPanel({
  mediaItems,
  docItems,
  linkItems,
  locale,
  t,
  onBack,
  onSelectMessage,
  onPreviewMedia,
  onDownloadAttachment,
}: {
  mediaItems: GroupMediaItem[];
  docItems: GroupMediaItem[];
  linkItems: GroupLinkItem[];
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  onBack: () => void;
  onSelectMessage: (messageId: string) => void;
  onPreviewMedia: (message: ChatMessage, attachment: EncryptedAttachmentPayload, preview: AttachmentPreview) => void;
  onDownloadAttachment: (message: ChatMessage, attachment: EncryptedAttachmentPayload) => void;
}) {
  const [tab, setTab] = useState<GroupMediaPanelTab>('media');
  const tabs: GroupMediaPanelTab[] = ['media', 'docs', 'links'];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full text-white/65 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none" aria-label={t.common.back}>
          <ArrowLeft size={18} />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{t.chat.mediaLinksAndDocs}</h2>
      </div>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-black/18 p-1">
          {tabs.map((item) => {
            const active = tab === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition ${active ? 'bg-accent/14 text-accent' : 'text-white/48 hover:bg-white/[0.05] hover:text-white/78'}`}
                aria-pressed={active}
              >
                {groupMediaTabLabel(item, t)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {tab === 'media' && (
          mediaItems.length === 0 ? (
            <GroupMediaEmptyState text={t.chat.noMediaYet} />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {mediaItems.map(({ message, attachment, preview }) => {
                const previewReady = preview?.status === 'loaded' && Boolean(preview.objectUrl);
                return (
                  <button
                    key={attachment.attachmentId}
                    type="button"
                    onClick={() => {
                      if (preview && previewReady) onPreviewMedia(message, attachment, preview);
                      else onSelectMessage(message.id);
                    }}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.045] text-white/55 transition hover:border-accent/30 focus:border-accent/35 focus:outline-none"
                    title={attachment.fileName}
                  >
                    {previewReady && isVideoAttachment(attachment) ? (
                      <>
                        <video src={preview?.objectUrl} aria-label={attachment.fileName} muted playsInline preload="metadata" className="h-full w-full bg-black object-cover" />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm">
                            <Play size={18} fill="currentColor" className="ml-0.5" />
                          </span>
                        </span>
                      </>
                    ) : previewReady ? (
                      <img src={preview?.objectUrl} alt={attachment.fileName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-2">
                        <ImageIcon size={19} />
                        <span className="max-w-full truncate px-2 text-[11px] font-medium">{attachment.fileName || t.chat.photo}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )
        )}
        {tab === 'docs' && (
          docItems.length === 0 ? (
            <GroupMediaEmptyState text={t.chat.noDocumentsYet} />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {docItems.map(({ message, attachment }) => {
                const fileSize = formatFileSize(attachment.size, locale);
                const metadata = [attachmentFileTypeLabel(attachment, t), fileSize, formatDate(message.createdAt, locale)].filter(Boolean).join(' • ');
                return (
                  <div key={attachment.attachmentId} className="flex min-w-0 items-center gap-3 px-2 py-3">
                    <button type="button" onClick={() => onSelectMessage(message.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-100">
                        <FileText size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white/82">{attachment.fileName || t.chat.encryptedAttachment}</span>
                        <span className="mt-0.5 block truncate text-xs text-white/42">{metadata}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => onDownloadAttachment(message, attachment)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/58 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none" aria-label={`${t.chat.downloadAttachment} ${attachment.fileName}`}>
                      <Download size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )
        )}
        {tab === 'links' && (
          linkItems.length === 0 ? (
            <GroupMediaEmptyState text={t.chat.noLinksYet} />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {linkItems.map(({ message, url, domain }) => (
                <a
                  key={`${message.id}-${url}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-2 py-3 transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none"
                >
                  <span className="block truncate text-sm font-semibold text-white/82">{domain}</span>
                  <span className="mt-1 block truncate text-xs text-white/52">{url}</span>
                  <span className="mt-1 block text-[11px] text-white/35">{formatDate(message.createdAt, locale)}</span>
                </a>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function GroupMediaEmptyState({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/52">{text}</div>;
}

function GroupStarredMessagesPanel({
  messages,
  loadedMessageIds,
  loading,
  error,
  decryptedMessages,
  t,
  onBack,
  onRetry,
  onSelect,
}: {
  messages: ChatMessage[];
  loadedMessageIds: Set<string>;
  loading: boolean;
  error: string;
  decryptedMessages: Record<string, string>;
  t: ReturnType<typeof useI18n>['t'];
  onBack: () => void;
  onRetry: () => void;
  onSelect: (messageId: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full text-white/65 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none" aria-label={t.common.back}>
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-base font-semibold text-white">{t.chat.starredMessages}</h2>
      </div>
      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {error ? (
          <div className="flex items-center justify-between gap-3 px-2 py-3 text-sm text-rose-100">
            <span>{error}</span>
            <button type="button" onClick={onRetry} className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-950 transition hover:bg-white">{t.common.retry}</button>
          </div>
        ) : loading ? (
          <ConversationSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/52">{t.chat.noStarredMessagesYet}</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {messages.map((message) => {
              const preview = messageReplyPreview(message, decryptedMessages, t);
              const loaded = loadedMessageIds.has(message.id);
              return (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => loaded && onSelect(message.id)}
                  disabled={!loaded}
                  className="block w-full px-2 py-3 text-left transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <p className="line-clamp-2 text-sm leading-5 text-white/72">{preview}</p>
                  {!loaded && <p className="mt-1 text-xs text-white/38">{t.chat.messageUnavailable}</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupMessageSearchPanel({
  groupName,
  query,
  dateValue,
  minDate,
  maxDate,
  results,
  locale,
  t,
  onBack,
  onQueryChange,
  onDateChange,
  onSelect,
}: {
  groupName: string;
  query: string;
  dateValue: string;
  minDate: string;
  maxDate: string;
  results: ChatSearchResult[];
  locale: string;
  t: ReturnType<typeof useI18n>['t'];
  onBack: () => void;
  onQueryChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onSelect: (messageId: string) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full text-white/65 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none" aria-label={t.common.back}>
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-base font-semibold text-white">{t.chat.searchMessages}</h2>
      </div>
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="relative">
          <button type="button" onClick={() => setCalendarOpen((open) => !open)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/65 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none" aria-label={t.chat.searchByDate} title={t.chat.searchByDate} aria-expanded={calendarOpen}>
            <CalendarSearch size={18} />
          </button>
          {calendarOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-xl border border-white/10 bg-[#07100d]/98 p-2 shadow-2xl shadow-black/45 backdrop-blur-xl">
              <input
                type="date"
                value={dateValue}
                min={minDate}
                max={maxDate}
                onChange={(event) => {
                  onDateChange(event.target.value);
                  setCalendarOpen(false);
                }}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none transition focus:border-accent/40 [color-scheme:dark]"
                aria-label={t.chat.searchByDate}
              />
            </div>
          )}
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/[0.07] px-4 py-2.5">
          <Search size={16} className="text-white/42" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t.chat.search}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/42"
          />
        </label>
      </div>
      <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        {!query.trim() ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/52">{t.chat.searchMessagesInGroup(groupName)}</div>
        ) : results.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/52">{t.chat.noConversationMatches}</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {results.map((result) => (
              <button key={result.message.id} type="button" onClick={() => onSelect(result.message.id)} className="block w-full px-2 py-3 text-left transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-white">{result.senderLabel}</p>
                  <p className="shrink-0 text-[11px] text-white/35">{formatDate(result.createdAt, locale)}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/52">{result.preview}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupInfoAvatarGroup({ participants, t }: { participants: ChatGroupParticipant[]; t: ReturnType<typeof useI18n>['t'] }) {
  const visible = participants.slice(0, 3);
  const extraCount = Math.max(0, participants.length - visible.length);
  return (
    <div className="mx-auto flex justify-center -space-x-3">
      {visible.map((participant) => (
        <span key={participant.userId} title={participant.name} aria-label={participant.name}>
          <ProfilePhoto name={participant.name} avatarUrl={participant.avatarUrl} dicebearStyle={participant.dicebearStyle} dicebearSeed={participant.dicebearSeed} size="lg" className="h-16 w-16 rounded-full border-2 border-[#07100d] bg-emerald-300/10 text-base text-emerald-100 shadow-lg shadow-black/20" />
        </span>
      ))}
      {extraCount > 0 && (
        <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-[#07100d] bg-white/[0.08] text-sm font-semibold text-white/72 shadow-lg shadow-black/20" title={t.chat.moreMembers(extraCount)} aria-label={t.chat.moreMembers(extraCount)}>+{extraCount}</span>
      )}
    </div>
  );
}

function GroupNameEditor({
  value,
  title,
  editing,
  canEdit,
  busy,
  changed,
  t,
  onEdit,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  title: string;
  editing: boolean;
  canEdit: boolean;
  busy: boolean;
  changed: boolean;
  t: ReturnType<typeof useI18n>['t'];
  onEdit: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!editing) {
    return (
      <div className="flex min-w-0 items-center justify-center gap-2">
        <h2 className="truncate text-2xl font-semibold text-white">{title}</h2>
        {canEdit && (
          <button type="button" onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-full text-white/62 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none" aria-label={t.chat.editGroupName} title={t.chat.editGroupName}>
            <Pencil size={15} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-sm items-center gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={80}
        disabled={busy}
        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-accent/45 disabled:cursor-not-allowed disabled:opacity-55"
      />
      <button type="button" onClick={onSave} disabled={busy || !value.trim() || !changed} className="grid h-9 w-9 place-items-center rounded-full text-accent transition hover:bg-accent/10 focus:bg-accent/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45" aria-label={t.chat.saveGroupName} title={t.chat.saveGroupName}>
        {busy ? <Spinner /> : <Check size={16} />}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="grid h-9 w-9 place-items-center rounded-full text-white/62 transition hover:bg-white/[0.08] hover:text-white focus:bg-white/[0.08] focus:text-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-45" aria-label={t.common.cancel} title={t.common.cancel}>
        <X size={16} />
      </button>
    </div>
  );
}

function GroupInfoAction({ icon, label, disabled = false, onClick }: { icon: ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group flex min-w-0 flex-col items-center gap-2 rounded-xl p-1.5 transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-55">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white/[0.07] text-white/72 transition group-hover:bg-accent/14 group-hover:text-accent group-focus:bg-accent/14 group-focus:text-accent">
        {icon}
      </span>
      <span className="max-w-full truncate text-xs font-medium text-white/70">{label}</span>
    </button>
  );
}

function GroupOwnerCombobox({ participants, value, disabled, t, onChange }: { participants: ChatGroupParticipant[]; value: string; disabled: boolean; t: ReturnType<typeof useI18n>['t']; onChange: (userId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedParticipant = participants.find((participant) => participant.userId === value);
  const normalizedQuery = normalizeConversationSearchValue(query);
  const filteredParticipants = participants.filter((participant) => memberMatchesTransferSearch(participant, normalizedQuery));

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-left text-sm text-white outline-none transition hover:border-white/18 hover:bg-white/[0.06] focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-55"
        role="combobox"
        aria-expanded={open}
      >
        {selectedParticipant ? (
          <span className="flex min-w-0 items-center gap-2">
            <ProfilePhoto name={selectedParticipant.name} avatarUrl={selectedParticipant.avatarUrl} dicebearStyle={selectedParticipant.dicebearStyle} dicebearSeed={selectedParticipant.dicebearSeed} size="sm" className="h-6 w-6 rounded-full border-emerald-300/15 bg-emerald-300/10 text-[10px] text-emerald-100" />
            <span className="truncate font-medium">{selectedParticipant.name}</span>
          </span>
        ) : (
          <span className="truncate text-white/42">{t.chat.selectNewOwner}</span>
        )}
        <ChevronDown size={15} className={`shrink-0 text-white/42 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#07100d]/98 shadow-2xl shadow-black/45 backdrop-blur-xl">
          <div className="border-b border-white/10 p-2">
            <label className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-2">
              <Search size={14} className="text-white/38" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.chat.searchMember}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/38"
              />
            </label>
          </div>
          <div className="chat-scrollbar max-h-64 overflow-y-auto py-1">
            {filteredParticipants.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-white/45">{t.chat.noMembersFound}</p>
            ) : filteredParticipants.map((participant) => (
              <button
                key={participant.userId}
                type="button"
                onClick={() => {
                  onChange(participant.userId);
                  setOpen(false);
                  setQuery('');
                }}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.05] focus:bg-white/[0.05] focus:outline-none"
              >
                <ProfilePhoto name={participant.name} avatarUrl={participant.avatarUrl} dicebearStyle={participant.dicebearStyle} dicebearSeed={participant.dicebearSeed} size="sm" className="h-8 w-8 rounded-full border-emerald-300/15 bg-emerald-300/10 text-xs text-emerald-100" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{participant.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-white/45">{participant.email}</span>
                </span>
                {value === participant.userId && <Check size={15} className="shrink-0 text-accent" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function memberMatchesTransferSearch(member: ChatGroupParticipant, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  return [member.name, member.email].some((value) => (
    normalizeConversationSearchValue(value).includes(normalizedQuery)
  ));
}

function GroupInfoRow({ icon, label, description, onClick, disabled = false }: { icon: ReactNode; label: string; description?: string; onClick?: () => void; disabled?: boolean }) {
  const content = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/62">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white/78">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-white/42">{description}</span>}
      </span>
    </>
  );
  if (!onClick) return <div className="flex items-center gap-3 px-2 py-3">{content}</div>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex w-full items-center gap-3 px-2 py-3 text-left transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none disabled:cursor-wait disabled:opacity-60">
      {content}
    </button>
  );
}

function ConversationSection({ title, count, collapsed, onToggle, children }: { title: string; count: number; collapsed: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-1 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown size={14} className={`shrink-0 text-white/38 transition ${collapsed ? '-rotate-90' : ''}`} />
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-white/38">{title}</span>
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/42">{count}</span>
      </button>
      {!collapsed && <div className="space-y-2">{children}</div>}
    </section>
  );
}

function ConversationSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <div className="h-4 w-2/3 rounded bg-white/10" />
          <div className="mt-3 h-3 w-1/2 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function sortConversations(conversations: ChatConversation[]) {
  return [...conversations].sort((first, second) => {
    const firstTime = new Date(first.lastMessageAt ?? first.updatedAt).getTime();
    const secondTime = new Date(second.lastMessageAt ?? second.updatedAt).getTime();
    return secondTime - firstTime;
  });
}

function isGroupConversation(conversation: ChatConversation | null | undefined) {
  return conversation?.type === 'GROUP';
}

function conversationMuted(conversation: ChatConversation | null | undefined, currentUserId: string | undefined) {
  if (!conversation || !currentUserId) return false;
  return Boolean(conversation.participants.find((participant) => participant.userId === currentUserId)?.mutedAt);
}

function conversationRecipientLabel(conversation: ChatConversation, currentUserId: string | undefined, fallback: string) {
  if (isGroupConversation(conversation)) return conversation.title?.trim() || fallback;
  if (!currentUserId) return fallback;
  const otherParticipants = currentUserId
    ? conversation.participants.filter((participant) => participant.userId !== currentUserId)
    : [];
  const names = otherParticipants.map((participant) => participant.name).filter(Boolean);
  return names.length ? names.join(', ') : fallback;
}

function conversationRecipient(conversation: ChatConversation, currentUserId: string | undefined) {
  if (!currentUserId) return null;
  return conversation.participants.find((participant) => participant.userId !== currentUserId) ?? null;
}

function ConversationAvatar({ conversation, participant, fallback, size }: { conversation?: ChatConversation | null; participant?: ChatConversation['participants'][number] | null; fallback: string; size: 'sm' | 'md' }) {
  const className = size === 'sm' ? 'h-10 w-10 rounded-full border-emerald-300/15 bg-emerald-300/10 text-xs text-emerald-100' : 'h-11 w-11 rounded-full border-emerald-300/15 bg-emerald-300/10 text-sm text-emerald-100';
  if (isGroupConversation(conversation)) {
    return (
      <div className={`grid shrink-0 place-items-center ${className}`}>
        <Users size={size === 'sm' ? 17 : 18} />
      </div>
    );
  }
  return <ProfilePhoto name={participant?.name ?? fallback} avatarUrl={participant?.avatarUrl} dicebearStyle={participant?.dicebearStyle} dicebearSeed={participant?.dicebearSeed} size={size === 'sm' ? 'sm' : 'md'} className={className} />;
}

function GroupHeaderAvatarGroup({ participants, t }: { participants: ChatConversation['participants']; t: ReturnType<typeof useI18n>['t'] }) {
  const visible = participants.slice(0, 3);
  const extraCount = Math.max(0, participants.length - visible.length);
  return (
    <div className="flex shrink-0 -space-x-2">
      {visible.map((participant) => (
        <span key={participant.userId} title={participant.name} aria-label={participant.name}>
          <ProfilePhoto
            name={participant.name}
            avatarUrl={participant.avatarUrl}
            dicebearStyle={participant.dicebearStyle}
            dicebearSeed={participant.dicebearSeed}
            size="sm"
            alt=""
            className="h-10 w-10 rounded-full border-2 border-[#0b1210] bg-emerald-300/10 text-[11px] text-emerald-100 shadow-lg shadow-black/20"
          />
        </span>
      ))}
      {extraCount > 0 && <span className="grid h-10 w-10 place-items-center rounded-full border-2 border-[#0b1210] bg-white/[0.08] text-[11px] font-semibold text-white/72 shadow-lg shadow-black/20" title={t.chat.moreMembers(extraCount)} aria-label={t.chat.moreMembers(extraCount)}>+{extraCount}</span>}
    </div>
  );
}

function isOwnMessage(message: ChatMessage, currentUserId: string | undefined) {
  return Boolean(currentUserId && message.senderId === currentUserId);
}

function conversationPreview(conversation: ChatConversation, currentUserId: string | undefined, t: ReturnType<typeof useI18n>['t'], localPreview: string | null = null) {
  if (!conversation.lastMessageAt) return t.chat.noActivity;
  if (localPreview) return localPreview;
  if (currentUserId && conversation.lastMessageSenderId === currentUserId) return t.chat.sentSecurely;
  return (conversation.unreadCount ?? 0) > 0 ? t.chat.newSecureMessage : t.chat.secureMessage;
}

function conversationFilterLabel(filter: ConversationFilter, t: ReturnType<typeof useI18n>['t']) {
  if (filter === 'unread') return t.chat.filterUnread;
  if (filter === 'groups') return t.chat.filterGroups;
  if (filter === 'favourites') return t.chat.filterFavourites;
  return t.chat.filterAll;
}

function normalizeConversationSearchValue(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function conversationMatchesSearch(conversation: ChatConversation, currentUserId: string | undefined, fallback: string, query: string) {
  const normalizedQuery = normalizeConversationSearchValue(query);
  if (!normalizedQuery) return true;
  return conversationSearchValues(conversation, currentUserId, fallback).some((value) => (
    normalizeConversationSearchValue(value).includes(normalizedQuery)
  ));
}

function conversationSearchValues(conversation: ChatConversation, currentUserId: string | undefined, fallback: string) {
  const label = conversationRecipientLabel(conversation, currentUserId, fallback);
  const participantValues = conversation.participants.flatMap((participant) => [
    participant.name,
    participant.title,
    participant.role,
  ]);
  const typeLabel = isGroupConversation(conversation) ? 'group' : 'direct';
  return [label, conversation.title, typeLabel, ...participantValues];
}

function groupMediaTabLabel(tab: GroupMediaPanelTab, t: ReturnType<typeof useI18n>['t']) {
  if (tab === 'docs') return t.chat.docs;
  if (tab === 'links') return t.chat.links;
  return t.chat.media;
}

function buildGroupMediaPanelItems(messages: ChatMessage[], decryptedMessages: Record<string, string>, previews: Record<string, AttachmentPreview>) {
  const media: GroupMediaItem[] = [];
  const docs: GroupMediaItem[] = [];
  const links: GroupLinkItem[] = [];
  messages.forEach((message) => {
    if (message.deletedForEveryoneAt) return;
    const decrypted = decryptedMessages[message.id];
    const attachment = parseAttachmentPayload(decrypted);
    if (attachment && !attachment.viewOnce) {
      const item = { message, attachment, preview: previews[attachment.attachmentId] };
      if (isPreviewableMediaAttachment(attachment)) media.push(item);
      else if (attachment.attachmentType === 'document' || attachment.attachmentType === 'file') docs.push(item);
      return;
    }
    extractLinksFromText(messageTextFromPayload(decrypted)).forEach((url) => {
      links.push({ message, url, domain: domainForUrl(url) });
    });
  });
  return { media, docs, links };
}

function extractLinksFromText(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  return Array.from(new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, ''))));
}

function domainForUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function latestConversationMessagePreview(messages: ChatMessage[], decryptedMessages: Record<string, string>, conversationId: string, t: ReturnType<typeof useI18n>['t'], openedAttachmentIds: Set<string>) {
  const latestMessage = [...messages].reverse().find((message) => message.conversationId === conversationId);
  if (!latestMessage) return null;
  if (latestMessage.deletedForEveryoneAt) return t.chat.messageDeletedTombstone;
  const decrypted = decryptedMessages[latestMessage.id];
  const attachment = parseAttachmentPayload(decrypted);
  if (attachment) return attachmentPreviewLabel(attachment, t, openedAttachmentIds);
  const text = messageTextFromPayload(decrypted).trim();
  return text || null;
}

function parseAttachmentPayload(value: string | undefined): EncryptedAttachmentPayload | null {
  const envelope = parseChatPayloadEnvelope(value);
  if (envelope?.attachment) return envelope.attachment;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedAttachmentPayload>;
    if (
      parsed.kind !== 'attachment' ||
      typeof parsed.attachmentId !== 'string' ||
      typeof parsed.fileName !== 'string' ||
      typeof parsed.mimeType !== 'string' ||
      typeof parsed.size !== 'number' ||
      typeof parsed.fileKey !== 'string' ||
      typeof parsed.fileNonce !== 'string' ||
      parsed.attachmentAlgorithm !== CHAT_ATTACHMENT_ENCRYPTION_ALGORITHM
    ) {
      return null;
    }
    return {
      ...parsed,
      attachmentType: parsed.attachmentType ?? attachmentKindForMimeType(parsed.mimeType),
      viewOnce: parsed.viewOnce === true,
    } as EncryptedAttachmentPayload;
  } catch {
    return null;
  }
}

function parseChatPayloadEnvelope(value: string | undefined): ChatPayloadEnvelope | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ChatPayloadEnvelope>;
    if (parsed.kind !== 'chat-message') return null;
    const attachment = parsed.attachment ? normalizeAttachmentPayload(parsed.attachment) : undefined;
    return {
      kind: 'chat-message',
      text: typeof parsed.text === 'string' ? parsed.text : undefined,
      attachment: attachment ?? undefined,
      replyTo: parsed.replyTo && typeof parsed.replyTo.messageId === 'string' ? { messageId: parsed.replyTo.messageId } : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeAttachmentPayload(value: unknown): EncryptedAttachmentPayload | null {
  const parsed = value as Partial<EncryptedAttachmentPayload>;
  if (
    !parsed ||
    parsed.kind !== 'attachment' ||
    typeof parsed.attachmentId !== 'string' ||
    typeof parsed.fileName !== 'string' ||
    typeof parsed.mimeType !== 'string' ||
    typeof parsed.size !== 'number' ||
    typeof parsed.fileKey !== 'string' ||
    typeof parsed.fileNonce !== 'string' ||
    parsed.attachmentAlgorithm !== CHAT_ATTACHMENT_ENCRYPTION_ALGORITHM
  ) {
    return null;
  }
  return {
    ...parsed,
    attachmentType: parsed.attachmentType ?? attachmentKindForMimeType(parsed.mimeType),
    viewOnce: parsed.viewOnce === true,
  } as EncryptedAttachmentPayload;
}

function messageTextFromPayload(value: string | undefined) {
  const envelope = parseChatPayloadEnvelope(value);
  if (envelope) return envelope.text ?? '';
  return value ?? '';
}

function messageReplyPreview(message: ChatMessage | null, decryptedMessages: Record<string, string>, t: ReturnType<typeof useI18n>['t']) {
  if (!message) return t.chat.messageUnavailable;
  if (message.deletedForEveryoneAt) return t.chat.originalMessageDeleted;
  const decrypted = decryptedMessages[message.id];
  if (!decrypted) return t.chat.messageUnavailable;
  const attachment = parseAttachmentPayload(decrypted);
  if (attachment) return attachmentPreviewLabel(attachment, t);
  const text = messageTextFromPayload(decrypted).trim();
  return text || t.chat.secureMessage;
}

function normalizeSearchQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function buildConversationSearchResults({
  messages,
  decryptedMessages,
  query,
  conversation,
  currentUserId,
  t,
}: {
  messages: ChatMessage[];
  decryptedMessages: Record<string, string>;
  query: string;
  conversation: ChatConversation | undefined;
  currentUserId: string | undefined;
  t: ReturnType<typeof useI18n>['t'];
}) {
  if (!query) return [];
  const normalizedQuery = query.toLowerCase();
  const results: ChatSearchResult[] = [];
  for (const message of messages) {
    if (message.deletedForEveryoneAt) continue;
    const preview = searchableMessagePreview(message, decryptedMessages, t);
    const normalizedPreview = preview.toLowerCase();
    const matchIndex = normalizedPreview.indexOf(normalizedQuery);
    if (matchIndex === -1) continue;
    results.push({
      message,
      senderLabel: messageAuthorLabel(message, conversation ?? null, currentUserId, t),
      preview,
      typeLabel: searchableMessageTypeLabel(message, decryptedMessages, t),
      createdAt: message.createdAt,
      matchIndex,
    });
    if (results.length >= 50) break;
  }
  return results;
}

function searchableMessagePreview(message: ChatMessage, decryptedMessages: Record<string, string>, t: ReturnType<typeof useI18n>['t']) {
  const decrypted = decryptedMessages[message.id];
  if (!decrypted) return t.chat.messageUnavailable;
  const attachment = parseAttachmentPayload(decrypted);
  if (attachment) return attachmentPreviewLabel(attachment, t);
  const text = messageTextFromPayload(decrypted).trim();
  return text || t.chat.secureMessage;
}

function searchableMessageTypeLabel(message: ChatMessage, decryptedMessages: Record<string, string>, t: ReturnType<typeof useI18n>['t']) {
  const decrypted = decryptedMessages[message.id];
  if (!decrypted) return t.chat.messageUnavailable;
  const attachment = parseAttachmentPayload(decrypted);
  if (!attachment) return t.chat.secureMessage;
  return attachmentPreviewLabel(attachment, t);
}

function messageAuthorLabel(message: ChatMessage | null, conversation: ChatConversation | null, currentUserId: string | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (!message) return t.chat.messageUnavailable;
  if (currentUserId && message.senderId === currentUserId) return t.chat.you;
  return conversation?.participants.find((participant) => participant.userId === message.senderId)?.name || t.chat.sentByParticipant;
}

function canDeleteForEveryone(message: ChatMessage | null, currentUserId: string | undefined) {
  if (!message || !currentUserId || message.senderId !== currentUserId || message.deletedForEveryoneAt) return false;
  return Date.now() - new Date(message.createdAt).getTime() <= deleteForEveryoneWindowMs;
}

function canEditMessage(message: ChatMessage, currentUserId: string | undefined, decryptedMessages: Record<string, string>) {
  if (!currentUserId || message.senderId !== currentUserId || message.deletedForEveryoneAt) return false;
  if (Date.now() - new Date(message.createdAt).getTime() > editMessageWindowMs) return false;
  const decrypted = decryptedMessages[message.id];
  if (!decrypted || decrypted === '') return false;
  if (parseAttachmentPayload(decrypted)) return false;
  return Boolean(messageTextFromPayload(decrypted).trim());
}

function normalizeReactionSummaries(reactions: ChatReactionSummary[], currentUserId: string | undefined): ChatReactionSummary[] {
  return reactions
    .filter((reaction) => allowedReactionEmojis.includes(reaction.emoji as typeof allowedReactionEmojis[number]) && reaction.count > 0)
    .map((reaction) => ({
      ...reaction,
      reactedByCurrentUser: Boolean(currentUserId && reaction.userIds?.includes(currentUserId)) || reaction.reactedByCurrentUser,
    }));
}

function replyTargetIdFromPayload(value: string | undefined) {
  return parseChatPayloadEnvelope(value)?.replyTo?.messageId ?? '';
}

function buildOutboundMessagePayload({ text, attachment, replyToMessageId }: { text: string; attachment: EncryptedAttachmentPayload | null; replyToMessageId: string }) {
  if (!replyToMessageId && attachment) return JSON.stringify(attachment);
  if (!replyToMessageId && !attachment) return text;
  const envelope: ChatPayloadEnvelope = {
    kind: 'chat-message',
    ...(text ? { text } : {}),
    ...(attachment ? { attachment } : {}),
    ...(replyToMessageId ? { replyTo: { messageId: replyToMessageId } } : {}),
  };
  return JSON.stringify(envelope);
}

function attachmentKindForFile(file: File): AttachmentKind {
  return attachmentKindForMimeType(file.type);
}

function attachmentKindForMimeType(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (documentAttachmentTypes.has(mimeType) || mimeType === 'image/svg+xml') return 'document';
  return 'file';
}

function isAllowedAttachment(file: File, pickerKind: AttachmentPickerKind) {
  if (pickerKind === 'media') return mediaAttachmentTypes.has(file.type) || file.type.startsWith('video/');
  return documentAttachmentTypes.has(file.type) || file.type === '';
}

function isImageAttachment(attachment: EncryptedAttachmentPayload) {
  return attachment.attachmentType === 'photo' && attachment.mimeType.startsWith('image/') && attachment.mimeType !== 'image/svg+xml';
}

function isVideoAttachment(attachment: EncryptedAttachmentPayload) {
  return attachment.attachmentType === 'video' || attachment.mimeType.toLowerCase().startsWith('video/');
}

function isPreviewableMediaAttachment(attachment: EncryptedAttachmentPayload) {
  return isImageAttachment(attachment) || isVideoAttachment(attachment);
}

function waitForImageUrl(url: string, timeoutMs = imagePreviewLoadTimeoutMs) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image();
    let settled = false;
    const timeout = window.setTimeout(() => {
      settle(() => reject(new Error('Image preview timed out.')));
    }, timeoutMs);
    function settle(callback: () => void) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      callback();
    }
    image.onload = () => settle(() => resolve());
    image.onerror = () => settle(() => reject(new Error('Image could not be loaded.')));
    image.src = url;
    if (typeof image.decode === 'function') {
      void image.decode().then(() => settle(() => resolve())).catch(() => {
        if (image.complete && image.naturalWidth > 0) {
          settle(() => resolve());
          return;
        }
        settle(() => reject(new Error('Image could not be decoded.')));
      });
    }
    if (image.complete && image.naturalWidth > 0) settle(() => resolve());
  });
}

function waitForVideoUrl(url: string, timeoutMs = imagePreviewLoadTimeoutMs) {
  return new Promise<void>((resolve, reject) => {
    const video = document.createElement('video');
    let settled = false;
    const timeout = window.setTimeout(() => {
      settle(() => reject(new Error('Video preview timed out.')));
    }, timeoutMs);
    function settle(callback: () => void) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      callback();
    }
    video.preload = 'metadata';
    video.playsInline = true;
    video.onloadedmetadata = () => settle(() => resolve());
    video.onerror = () => settle(() => reject(new Error('Video metadata could not be loaded.')));
    video.src = url;
    video.load();
  });
}

function fallbackImageFileName(mimeType?: string) {
  const extension = imageExtensionForMimeType(mimeType);
  return `image-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function imageExtensionForMimeType(mimeType?: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function attachmentPreviewLabel(attachment: EncryptedAttachmentPayload, t: ReturnType<typeof useI18n>['t'], openedAttachmentIds: Set<string> = new Set()) {
  if (attachment.viewOnce && attachment.attachmentType === 'photo') {
    return openedAttachmentIds.has(attachment.attachmentId) ? t.chat.photoOpened : t.chat.viewOncePhoto;
  }
  if (attachment.attachmentType === 'photo') return t.chat.photo;
  if (attachment.attachmentType === 'video') return t.chat.video;
  if (attachment.attachmentType === 'document') return t.chat.document;
  return t.chat.secureAttachment;
}

function attachmentComposerStatusLabel(status: AttachmentComposerStatus, t: ReturnType<typeof useI18n>['t']) {
  if (status === 'encrypting') return t.chat.attachmentEncrypting;
  if (status === 'uploading') return t.chat.attachmentUploading;
  if (status === 'sending') return t.chat.attachmentSending;
  if (status === 'sent') return t.chat.attachmentSent;
  if (status === 'failed') return t.chat.attachmentFailedRetry;
  return t.chat.attachmentSelected;
}

function buildMessageRenderItems(messages: ChatMessage[], locale: string, todayLabel: string, yesterdayLabel: string): MessageRenderItem[] {
  const items: MessageRenderItem[] = [];
  let previousDayKey = '';
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const dayKey = localDayKey(message.createdAt);
    if (dayKey !== previousDayKey) {
      items.push({ type: 'separator', key: `day-${dayKey}`, label: dateSeparatorLabel(message.createdAt, locale, todayLabel, yesterdayLabel) });
      previousDayKey = dayKey;
    }
    const flags = senderGroupFlags(messages, index);
    items.push({ type: 'message', message, ...flags });
  }
  return items;
}

function senderGroupFlags(messages: ChatMessage[], index: number) {
  const current = messages[index];
  const previous = messages[index - 1];
  const next = messages[index + 1];
  // Group only adjacent visible messages from the same sender on the same local day.
  const canGroupCurrent = Boolean(current && !current.deletedForEveryoneAt);
  const previousSameSender = Boolean(
    canGroupCurrent &&
    previous &&
    !previous.deletedForEveryoneAt &&
    previous.senderId === current.senderId &&
    localDayKey(previous.createdAt) === localDayKey(current.createdAt),
  );
  const nextSameSender = Boolean(
    canGroupCurrent &&
    next &&
    !next.deletedForEveryoneAt &&
    next.senderId === current.senderId &&
    localDayKey(next.createdAt) === localDayKey(current.createdAt),
  );
  return {
    previousSameSender,
    nextSameSender,
    isFirstInSenderGroup: !previousSameSender,
    isLastInSenderGroup: !nextSameSender,
  };
}

function localDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dateSeparatorLabel(value: string, locale: string, todayLabel: string, yesterdayLabel: string) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (localDayKey(value) === localDayKey(today.toISOString())) return todayLabel;
  if (localDayKey(value) === localDayKey(yesterday.toISOString())) return yesterdayLabel;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function isNearMessageListBottom(container: HTMLDivElement) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 120;
}

function uploadChatAttachmentWithProgress(conversationId: string, body: FormData, onProgress: (percent: number | null) => void): Promise<ChatAttachmentUploadResponse> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const timeout = window.setTimeout(() => {
      request.abort();
      reject(new DOMException('Attachment upload timed out.', 'AbortError'));
    }, attachmentOperationTimeoutMs);

    request.open('POST', apiUrl(`/chat/conversations/${conversationId}/attachments`));
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      onProgress(event.lengthComputable && event.total > 0 ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : null);
    };
    request.onerror = () => reject(new Error('Attachment upload failed.'));
    request.onabort = () => reject(new DOMException('Attachment upload aborted.', 'AbortError'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('Attachment upload failed.'));
        return;
      }
      try {
        resolve(JSON.parse(request.responseText) as ChatAttachmentUploadResponse);
      } catch (error) {
        reject(error);
      }
    };
    request.onloadend = () => window.clearTimeout(timeout);
    request.send(body);
  });
}

async function responseArrayBufferWithProgress(response: Response, onProgress?: (percent: number | null) => void) {
  if (!onProgress || !response.body) return response.arrayBuffer();
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    onProgress(null);
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress(Math.min(100, Math.round((received / contentLength) * 100)));
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

function attachmentFileTypeLabel(attachment: EncryptedAttachmentPayload, t: ReturnType<typeof useI18n>['t']) {
  if (attachment.mimeType === 'application/pdf') return t.chat.pdf;
  if (attachment.mimeType === 'text/plain') return t.chat.txt;
  if (attachment.mimeType === 'image/svg+xml') return t.chat.svg;
  if (attachment.attachmentType === 'video') return t.chat.video;
  if (attachment.attachmentType === 'document') return t.chat.document;
  return t.chat.file;
}

function attachmentFileTypeLabelForFile(file: File, t: ReturnType<typeof useI18n>['t']) {
  if (file.type === 'application/pdf') return t.chat.pdf;
  if (file.type === 'text/plain') return t.chat.txt;
  if (file.type === 'image/svg+xml') return t.chat.svg;
  const extension = file.name.split('.').pop()?.trim();
  if (extension && extension.length <= 5 && /^[a-z0-9]+$/i.test(extension)) return extension.toUpperCase();
  const kind = attachmentKindForFile(file);
  if (kind === 'photo') return t.chat.photo;
  if (kind === 'video') return t.chat.video;
  if (kind === 'document') return t.chat.document;
  return t.chat.file;
}

function presenceLabel(update: { isOnline: boolean; lastSeenAt?: string | null } | null, locale: string, t: ReturnType<typeof useI18n>['t']) {
  if (update?.isOnline) return t.chat.online;
  if (update?.lastSeenAt) return t.chat.lastSeen(formatDate(update.lastSeenAt, locale));
  return t.chat.offline;
}

function latestSeenOwnMessageId(messages: ChatMessage[], currentUserId: string | undefined, conversation: ChatConversation | undefined) {
  if (!currentUserId) return null;
  if (isGroupConversation(conversation)) return null;
  const otherParticipant = conversation?.participants.find((participant) => participant.userId !== currentUserId);
  if (!otherParticipant?.lastReadAt) return null;
  const readAt = new Date(otherParticipant.lastReadAt).getTime();
  const latestSeen = [...messages].reverse().find((message) => message.senderId === currentUserId && readAt >= new Date(message.createdAt).getTime());
  return latestSeen?.id ?? null;
}

function messageStatusLabel(message: ChatMessage, conversation: ChatConversation | undefined, currentUserId: string | undefined, latestOwnSeenMessageId: string | null, locale: string, t: ReturnType<typeof useI18n>['t']) {
  if (!currentUserId || message.senderId !== currentUserId || message.deletedForEveryoneAt) return '';
  if (isGroupConversation(conversation)) return t.chat.sent;
  const otherParticipant = conversation?.participants.find((participant) => participant.userId !== currentUserId);
  if (otherParticipant?.lastReadAt && new Date(otherParticipant.lastReadAt).getTime() >= new Date(message.createdAt).getTime()) {
    return message.id === latestOwnSeenMessageId ? t.chat.seenAt(formatTime(otherParticipant.lastReadAt, locale)) : '';
  }
  if (message.deliveredAt) return t.chat.delivered;
  return t.chat.sent;
}

function chatSocketErrorLabel(code: string, t: ReturnType<typeof useI18n>['t']) {
  if (code === 'conversation_not_joined') return t.chat.conversationNotConnected;
  if (code === 'message_edit_rejected') return t.chat.messageEditFailed;
  if (code === 'message_reaction_rejected') return t.chat.reactionSaveFailed;
  return t.chat.sendFailed;
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function localDateInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatMediaDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return '';
  const totalSeconds = Math.round(duration);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, '0');
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
}

function formatFileSize(size: number, locale: string) {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) {
    const value = size / 1024;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} KB`;
  }
  const value = size / (1024 * 1024);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} MB`;
}

function realtimeStatusLabel(status: 'connected' | 'reconnecting' | 'offline', hasConversation: boolean, conversationReady: boolean, t: ReturnType<typeof useI18n>['t']) {
  if (status === 'connected' && hasConversation && !conversationReady) return t.chat.conversationNotConnected;
  if (status === 'connected') return t.chat.realtimeConnected;
  if (status === 'reconnecting') return t.chat.realtimeReconnecting;
  return t.chat.realtimeOffline;
}

function realtimeStatusClassName(status: 'connected' | 'reconnecting' | 'offline') {
  if (status === 'connected') return 'border-emerald-300/15 bg-emerald-300/10 text-emerald-100';
  if (status === 'reconnecting') return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
  return 'border-white/10 bg-white/[0.04] text-white/56';
}

function keyStatusLabel(status: ChatKeySetupState, t: ReturnType<typeof useI18n>['t']) {
  if (status === 'ready') return t.chat.keyReady;
  if (status === 'restore-required') return t.chat.restoreEncryptedChat;
  if (status === 'rotating') return t.chat.creatingNewIdentity;
  if (status === 'failed') return t.chat.keySetupFailed;
  return t.chat.keyPreparing;
}

function keyStatusClassName(status: ChatKeySetupState) {
  if (status === 'ready') return 'border-emerald-300/15 bg-emerald-300/10 text-emerald-100';
  if (status === 'restore-required') return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
  if (status === 'failed') return 'border-rose-300/20 bg-rose-300/10 text-rose-100';
  return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
}

function composerPlaceholder(state: { selectedConversation: boolean; keyStatus: ChatKeySetupState; recipientKey: boolean; realtimeReady: boolean }, t: ReturnType<typeof useI18n>['t']) {
  if (!state.selectedConversation) return t.chat.selectConversation;
  if (state.keyStatus === 'preparing') return t.chat.keyPreparing;
  if (state.keyStatus === 'restore-required' || state.keyStatus === 'rotating') return t.chat.restoreEncryptedChat;
  if (state.keyStatus === 'failed') return t.chat.keySetupFailed;
  if (!state.recipientKey) return t.chat.recipientKeyMissing;
  return state.realtimeReady ? t.chat.composePlaceholder : t.chat.conversationNotConnected;
}

async function encryptDirectMessagePayload(plaintext: string, privateKey: CryptoKey, senderKey: ChatDeviceKey | null, recipientKey: ChatDeviceKey | null) {
  if (!senderKey || !recipientKey) throw new Error('Message key metadata is missing.');
  const recipientPublicKey = await importPublicKey(recipientKey.publicKey);
  const encrypted = await encryptChatMessage(plaintext, privateKey, recipientPublicKey);
  return {
    ...encrypted,
    encryptionKeyVersion: recipientKey.id,
    senderKeyVersionId: senderKey.id,
    recipientKeyVersionId: recipientKey.id,
  };
}

async function encryptGroupMessagePayload(plaintext: string, privateKey: CryptoKey, senderKey: ChatDeviceKey | null, recipientKeys: ChatDeviceKey[]) {
  if (!senderKey) throw new Error('Sender key metadata is missing.');
  const recipients: GroupEncryptedPayload['recipients'] = {};
  await Promise.all(recipientKeys.map(async (recipientKey) => {
    const recipientPublicKey = await importPublicKey(recipientKey.publicKey);
    const encrypted = await encryptChatMessage(plaintext, privateKey, recipientPublicKey);
    recipients[recipientKey.userId] = {
      encryptedPayload: encrypted.encryptedPayload,
      encryptionNonce: encrypted.encryptionNonce,
      encryptionKeyVersion: recipientKey.id,
    };
  }));
  return {
    encryptedPayload: JSON.stringify({ kind: 'group-message', version: 1, recipients } satisfies GroupEncryptedPayload),
    encryptionNonce: 'group',
    encryptionAlgorithmVersion: CHAT_ENCRYPTION_ALGORITHM,
    encryptionKeyVersion: groupMessageKeyVersion,
    senderKeyVersionId: senderKey.id,
  };
}

async function decryptDirectMessagePayload(message: ChatMessage, privateKey: CryptoKey, publicKeyValue: string) {
  if (!message.encryptedPayload || !message.encryptionNonce) throw new Error('Encrypted message metadata is missing.');
  const publicKey = await importPublicKey(publicKeyValue);
  return decryptChatMessage(message.encryptedPayload, message.encryptionNonce, privateKey, publicKey);
}

async function decryptGroupMessagePayload(message: ChatMessage, currentUserId: string, privateKey: CryptoKey, publicKeyValue: string) {
  const payload = parseGroupEncryptedPayload(message.encryptedPayload);
  const recipientPayload = payload?.recipients[currentUserId];
  if (!recipientPayload) throw new Error('Encrypted group payload is missing for this participant.');
  const publicKey = await importPublicKey(publicKeyValue);
  return decryptChatMessage(recipientPayload.encryptedPayload, recipientPayload.encryptionNonce, privateKey, publicKey);
}

function parseGroupEncryptedPayload(value?: string): GroupEncryptedPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as GroupEncryptedPayload;
    if (parsed?.kind !== 'group-message' || parsed.version !== 1 || !parsed.recipients || typeof parsed.recipients !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isGroupEncryptedMessage(message: ChatMessage) {
  return message.encryptionKeyVersion === groupMessageKeyVersion;
}

function publicKeyForMessage(message: ChatMessage, currentUserId: string, conversation: ChatConversation | undefined, keys: ChatDeviceKey[]) {
  if (isGroupEncryptedMessage(message)) {
    if (message.senderKeyVersionId) return keys.find((key) => key.id === message.senderKeyVersionId) ?? null;
    return keys.find((key) => key.userId === message.senderId && key.algorithm === CHAT_ENCRYPTION_ALGORITHM) ?? null;
  }
  if (message.senderId !== currentUserId) {
    if (message.senderKeyVersionId) return keys.find((key) => key.id === message.senderKeyVersionId) ?? null;
    return keys.find((key) => key.userId === message.senderId && key.algorithm === CHAT_ENCRYPTION_ALGORITHM) ?? null;
  }
  if (message.recipientKeyVersionId) return keys.find((key) => key.id === message.recipientKeyVersionId) ?? null;
  if (message.encryptionKeyVersion) {
    const exactLegacyKey = keys.find((key) => key.id === message.encryptionKeyVersion);
    if (exactLegacyKey) return exactLegacyKey;
  }
  const recipient = conversation?.participants.find((participant) => participant.userId !== currentUserId);
  if (!recipient) return null;
  return keys.find((key) => key.userId === recipient.userId && key.algorithm === CHAT_ENCRYPTION_ALGORITHM) ?? null;
}

function privateKeyForMessage(
  message: ChatMessage,
  currentUserId: string,
  keys: ChatDeviceKey[],
  localKeys: LocalChatKeyPair[],
) {
  let keyVersionId: string | null | undefined;
  if (isGroupEncryptedMessage(message)) {
    keyVersionId = parseGroupEncryptedPayload(message.encryptedPayload)?.recipients[currentUserId]?.encryptionKeyVersion;
  } else {
    keyVersionId = message.senderId === currentUserId
      ? message.senderKeyVersionId
      : message.recipientKeyVersionId ?? message.encryptionKeyVersion;
  }
  if (!keyVersionId) return null;
  const publicKey = keys.find((key) => key.id === keyVersionId)?.publicKey;
  return localKeys.find((key) => key.publicKey === publicKey)?.privateKey ?? null;
}
