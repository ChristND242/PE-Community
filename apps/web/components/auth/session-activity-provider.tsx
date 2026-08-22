'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import {
  LOCAL_ACTIVITY_THROTTLE_MS,
  SERVER_ACTIVITY_THROTTLE_MS,
  SESSION_ACTIVITY_CHANNEL,
  SESSION_ACTIVITY_STORAGE_KEY,
  acquireSessionRenewalLock,
  countdownParts,
  parseSessionActivityMessage,
  publishSessionActivityMessage,
  releaseSessionRenewalLock,
  sessionDeadline,
  type SessionActivityMessage,
  type SessionActivityStatus,
} from '../../lib/session-activity';
import { SessionExpiryDialog } from './session-expiry-dialog';

const STATUS_RETRY_MS = 5_000;
const LOCK_RETRY_MS = 1_500;

export function SessionActivityProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(300);
  const [renewing, setRenewing] = useState(false);
  const [renewalError, setRenewalError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const idleExpiresAtRef = useRef(0);
  const absoluteExpiresAtRef = useRef(0);
  const warningDurationMsRef = useRef(5 * 60 * 1000);
  const serverTimeOffsetMsRef = useRef(0);
  const lastLocalActivityAtRef = useRef(0);
  const lastServerActivitySyncAtRef = useRef(0);
  const renewalInFlightRef = useRef(false);
  const expirationInFlightRef = useRef(false);
  const warningVisibleRef = useRef(false);
  const oneMinuteAnnouncedRef = useRef(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabIdRef = useRef('');
  const recomputeRef = useRef<() => void>(() => undefined);
  const renewRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);

  const clearDeadlineTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    warningTimerRef.current = null;
    expiryTimerRef.current = null;
  }, []);

  const expireSession = useCallback(async (broadcast = true) => {
    if (expirationInFlightRef.current) return;
    expirationInFlightRef.current = true;
    clearDeadlineTimers();
    try {
      await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include', keepalive: true });
    } catch {
      // The server still rejects the elapsed idle deadline even when the client is offline.
    } finally {
      if (broadcast) publishSessionActivityMessage({ type: 'expired', at: Date.now() });
      window.location.replace('/login?reason=inactivity');
    }
  }, [clearDeadlineTimers]);

  const showWarning = useCallback(() => {
    if (warningVisibleRef.current) return;
    warningVisibleRef.current = true;
    setWarningVisible(true);
    setRenewalError(false);
    oneMinuteAnnouncedRef.current = false;
    const seconds = Math.max(0, Math.ceil((sessionDeadline(idleExpiresAtRef.current, absoluteExpiresAtRef.current) - serverNow()) / 1000));
    setSecondsRemaining(seconds);
    setAnnouncement(t.auth.sessionFiveMinutesRemaining);
  }, [t.auth.sessionFiveMinutesRemaining]);

  const recomputeDeadlines = useCallback(() => {
    clearDeadlineTimers();
    const deadline = sessionDeadline(idleExpiresAtRef.current, absoluteExpiresAtRef.current);
    if (!deadline) return;
    const now = serverNow();
    if (now >= deadline) {
      void expireSession();
      return;
    }
    const warningAt = idleExpiresAtRef.current - warningDurationMsRef.current;
    if (now >= warningAt) {
      showWarning();
    } else {
      warningTimerRef.current = setTimeout(showWarning, warningAt - now);
    }
    expiryTimerRef.current = setTimeout(() => void expireSession(), deadline - now);
  }, [clearDeadlineTimers, expireSession, showWarning]);
  recomputeRef.current = recomputeDeadlines;

  const acceptStatus = useCallback((status: SessionActivityStatus, broadcast = false) => {
    const idleExpiresAt = Date.parse(status.idleExpiresAt);
    const absoluteExpiresAt = Date.parse(status.absoluteExpiresAt);
    const authoritativeNow = Date.parse(status.serverNow);
    if (!Number.isFinite(idleExpiresAt) || !Number.isFinite(absoluteExpiresAt) || !Number.isFinite(authoritativeNow)) return;
    serverTimeOffsetMsRef.current = authoritativeNow - Date.now();
    idleExpiresAtRef.current = idleExpiresAt;
    absoluteExpiresAtRef.current = absoluteExpiresAt;
    warningDurationMsRef.current = Math.max(1_000, (status.idleTimeoutSeconds - status.warningAfterSeconds) * 1_000);
    lastServerActivitySyncAtRef.current = Date.now();
    warningVisibleRef.current = false;
    setWarningVisible(false);
    setRenewalError(false);
    oneMinuteAnnouncedRef.current = false;
    setAnnouncement('');
    recomputeRef.current();
    if (broadcast) {
      publishSessionActivityMessage({ type: 'renewed', idleExpiresAt, absoluteExpiresAt, serverNow: authoritativeNow, at: Date.now() });
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/auth/session/status'), { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) {
        await expireSession();
        return false;
      }
      if (!response.ok) throw new Error('Session status unavailable.');
      acceptStatus(await response.json() as SessionActivityStatus);
      return true;
    } catch {
      if (statusRetryRef.current) clearTimeout(statusRetryRef.current);
      statusRetryRef.current = setTimeout(() => void checkStatus(), STATUS_RETRY_MS);
      recomputeRef.current();
      return false;
    }
  }, [acceptStatus, expireSession]);

  const renewSession = useCallback(async (force = false) => {
    const now = Date.now();
    if (document.visibilityState !== 'visible' || renewalInFlightRef.current) return;
    if (!force && now - lastServerActivitySyncAtRef.current < SERVER_ACTIVITY_THROTTLE_MS) return;
    if (!acquireSessionRenewalLock(tabIdRef.current, now)) {
      if (lockRetryRef.current) clearTimeout(lockRetryRef.current);
      lockRetryRef.current = setTimeout(() => void renewRef.current(warningVisibleRef.current), LOCK_RETRY_MS);
      return;
    }

    renewalInFlightRef.current = true;
    setRenewing(true);
    setRenewalError(false);
    try {
      const response = await fetch(apiUrl('/auth/session/activity'), { method: 'POST', credentials: 'include' });
      if (response.status === 401) {
        await expireSession();
        return;
      }
      if (!response.ok) throw new Error('Session activity could not be confirmed.');
      acceptStatus(await response.json() as SessionActivityStatus, true);
    } catch {
      setRenewalError(true);
      recomputeRef.current();
    } finally {
      renewalInFlightRef.current = false;
      setRenewing(false);
      releaseSessionRenewalLock(tabIdRef.current);
    }
  }, [acceptStatus, expireSession]);
  renewRef.current = renewSession;

  const recordTrustedActivity = useCallback((event: Event) => {
    if (!event.isTrusted || document.visibilityState !== 'visible') return;
    if (event instanceof KeyboardEvent && event.key === 'Escape' && warningVisibleRef.current) return;
    const now = Date.now();
    if (event.type === 'pointermove' && now - lastLocalActivityAtRef.current < LOCAL_ACTIVITY_THROTTLE_MS) return;
    lastLocalActivityAtRef.current = now;
    void renewRef.current(warningVisibleRef.current);
  }, []);

  useEffect(() => {
    tabIdRef.current = crypto.randomUUID();
    void checkStatus();
    const passiveOptions: AddEventListenerOptions = { passive: true, capture: true };
    const passiveEvents = ['pointerdown', 'pointermove', 'scroll', 'wheel', 'touchstart'] as const;
    passiveEvents.forEach((eventName) => document.addEventListener(eventName, recordTrustedActivity, passiveOptions));
    document.addEventListener('keydown', recordTrustedActivity, true);

    async function handleFocus(event: FocusEvent) {
      if (!event.isTrusted || document.visibilityState !== 'visible') return;
      if (await checkStatus()) void renewRef.current(warningVisibleRef.current);
    }
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void checkStatus();
    }
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      passiveEvents.forEach((eventName) => document.removeEventListener(eventName, recordTrustedActivity, passiveOptions));
      document.removeEventListener('keydown', recordTrustedActivity, true);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearDeadlineTimers();
      if (statusRetryRef.current) clearTimeout(statusRetryRef.current);
      if (lockRetryRef.current) clearTimeout(lockRetryRef.current);
      releaseSessionRenewalLock(tabIdRef.current);
    };
  }, [checkStatus, clearDeadlineTimers, recordTrustedActivity]);

  useEffect(() => {
    function receiveMessage(message: SessionActivityMessage) {
      if (message.type === 'renewed') {
        idleExpiresAtRef.current = message.idleExpiresAt;
        absoluteExpiresAtRef.current = message.absoluteExpiresAt;
        serverTimeOffsetMsRef.current = message.serverNow - Date.now();
        lastServerActivitySyncAtRef.current = message.at;
        warningVisibleRef.current = false;
        setWarningVisible(false);
        setRenewalError(false);
        recomputeRef.current();
      } else if (message.type === 'expired') {
        void expireSession(false);
      } else {
        window.location.replace('/login');
      }
    }

    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(SESSION_ACTIVITY_CHANNEL) : null;
    if (channel) channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseSessionActivityMessage(event.data);
      if (message) receiveMessage(message);
    };
    function handleStorage(event: StorageEvent) {
      if (event.key !== SESSION_ACTIVITY_STORAGE_KEY || !event.newValue) return;
      try {
        const message = parseSessionActivityMessage(JSON.parse(event.newValue));
        if (message) receiveMessage(message);
      } catch {
        // Ignore malformed same-origin storage values.
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => {
      channel?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [expireSession]);

  useEffect(() => {
    if (!warningVisible) return;
    function updateCountdown() {
      const remaining = Math.max(0, Math.ceil((sessionDeadline(idleExpiresAtRef.current, absoluteExpiresAtRef.current) - serverNow()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 60 && remaining > 0 && !oneMinuteAnnouncedRef.current) {
        oneMinuteAnnouncedRef.current = true;
        setAnnouncement(t.auth.sessionOneMinuteRemaining);
      }
      if (remaining <= 0) {
        setAnnouncement(t.auth.sessionExpiredAnnouncement);
        void expireSession();
      }
    }
    updateCountdown();
    const interval = setInterval(updateCountdown, 1_000);
    return () => clearInterval(interval);
  }, [expireSession, t.auth.sessionExpiredAnnouncement, t.auth.sessionOneMinuteRemaining, warningVisible]);

  const countdown = countdownParts(secondsRemaining).text;
  return (
    <>
      {children}
      {warningVisible && (
        <SessionExpiryDialog
          title={t.auth.sessionExpiringSoon}
          description={t.auth.sessionExpiryInstruction}
          countdown={countdown}
          continueLabel={t.auth.continueSession}
          renewingLabel={t.auth.renewingSession}
          retryMessage={renewalError ? t.auth.sessionRenewalFailed : ''}
          announcement={announcement}
          renewing={renewing}
          onContinue={() => void renewSession(true)}
        />
      )}
    </>
  );

  function serverNow() {
    return Date.now() + serverTimeOffsetMsRef.current;
  }
}
