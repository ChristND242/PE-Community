'use client';

import { Bell, Eye, MonitorSmartphone, Save, Search, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RowActionMenu } from '../../../components/row-action-menu';
import { AppShell } from '../../../components/shell';
import { Card, ConfirmDialog, DataTablePagination, LoadingButton, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { enrichCurrentChatDeviceMetadata } from '../../../lib/chat-device-metadata';
import { useI18n } from '../../../lib/i18n';
import { getLocalChatDeviceIdentity } from '../../../lib/chat-key-store';
import { cn } from '../../../lib/utils';

type Preferences = {
  announcementNotifications: boolean;
  eventNotifications: boolean;
  birthdayReminderNotifications: boolean;
  passportExpirationRemindersEnabled: boolean;
};

type TabKey = 'notifications' | 'privacy' | 'devices';
type CurrentUser = { id: string; communityId: string };
type ChatDevice = { id: string; displayName: string; generatedLabel: string | null; customDisplayName: string | null; deviceType: string; operatingSystemName: string | null; operatingSystemVersion: string | null; browserName: string | null; browserVersion: string | null; status: string; createdAt: string; lastSeenAt: string | null; revokedAt: string | null; current: boolean; keyVersion: number | null };
type ChatDevicesResponse = { activeCount: number; limit: number; overLimit: boolean; devices: ChatDevice[]; page: number; pageSize: number; pageCount: number; total: number; timezone: string };

export default function MemberSettingsPage() {
  const { t, lang } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>('notifications');
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [savedPreferences, setSavedPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [chatDevices, setChatDevices] = useState<ChatDevicesResponse | null>(null);
  const [deviceBusyId, setDeviceBusyId] = useState('');
  const [devicePage, setDevicePage] = useState(1);
  const [devicePageSize, setDevicePageSize] = useState(10);
  const [deviceSearch, setDeviceSearch] = useState('');
  const debouncedDeviceSearch = useDebouncedValue(deviceSearch);
  const [deviceStatus, setDeviceStatus] = useState('');
  const [deviceSort, setDeviceSort] = useState('lastSeenAt');
  const [selectedDevice, setSelectedDevice] = useState<ChatDevice | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ChatDevice | null>(null);
  const deviceRevocationInFlight = useRef(false);
  const metadataEnrichmentAttempted = useRef(false);
  const dirty = useMemo(() => JSON.stringify(preferences) !== JSON.stringify(savedPreferences), [preferences, savedPreferences]);

  async function load() {
    setError('');
    try {
      const [data, user] = await Promise.all([
        apiFetch<Preferences>('/me/notification-preferences'),
        apiFetch<CurrentUser>('/auth/me'),
      ]);
      const deviceIdentity = getLocalChatDeviceIdentity(user.id, user.communityId);
      const query = new URLSearchParams({ page: String(devicePage), pageSize: String(devicePageSize), search: debouncedDeviceSearch, status: deviceStatus, sortBy: deviceSort, sortOrder: 'desc' });
      const devices = await apiFetch<ChatDevicesResponse>(`/chat/devices/me?${query}`, {
        headers: { 'x-chat-device-id': deviceIdentity.deviceIdentifier },
      });
      setPreferences(data);
      setSavedPreferences(data);
      setChatDevices(devices);
      if (!metadataEnrichmentAttempted.current) {
        metadataEnrichmentAttempted.current = true;
        void enrichCurrentChatDeviceMetadata(user)
          .then((changed) => changed ? loadDevices(devicePage) : undefined)
          .catch(() => undefined);
      }
    } catch {
      setError(t.dashboard.settingsLoadFailed);
    }
  }

  async function loadDevices(nextPage = devicePage) {
    const user = await apiFetch<CurrentUser>('/auth/me');
    const identity = getLocalChatDeviceIdentity(user.id, user.communityId);
    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(devicePageSize), search: debouncedDeviceSearch, status: deviceStatus, sortBy: deviceSort, sortOrder: 'desc' });
    setChatDevices(await apiFetch<ChatDevicesResponse>(`/chat/devices/me?${query}`, { headers: { 'x-chat-device-id': identity.deviceIdentifier } }));
    setDevicePage(nextPage);
  }

  function requestDeviceRevocation(device: ChatDevice) {
    if (deviceBusyId || device.status === 'REVOKED') return;
    setRevokeTarget(device);
  }

  async function confirmDeviceRevocation() {
    if (!revokeTarget || deviceRevocationInFlight.current || deviceBusyId) return;
    const device = revokeTarget;
    deviceRevocationInFlight.current = true;
    setDeviceBusyId(device.id);
    try {
      const user = await apiFetch<CurrentUser>('/auth/me');
      const identity = getLocalChatDeviceIdentity(user.id, user.communityId);
      await apiFetch(`/chat/devices/${device.id}/revoke`, {
        method: 'POST',
        headers: { 'x-chat-device-id': identity.deviceIdentifier },
      });
      await loadDevices(devicePage);
      setRevokeTarget(null);
      toast.success(t.security.chatDeviceRevoked);
    } catch {
      toast.error(t.security.chatDeviceRevokeFailed);
    } finally {
      deviceRevocationInFlight.current = false;
      setDeviceBusyId('');
    }
  }

  async function renameDevice(device: ChatDevice) {
    const displayName = window.prompt(t.security.renameDevicePrompt, device.displayName)?.trim();
    if (!displayName || displayName === device.displayName) return;
    setDeviceBusyId(device.id);
    try {
      const user = await apiFetch<CurrentUser>('/auth/me');
      const identity = getLocalChatDeviceIdentity(user.id, user.communityId);
      await apiFetch(`/chat/devices/${device.id}`, { method: 'PATCH', headers: { 'x-chat-device-id': identity.deviceIdentifier }, body: JSON.stringify({ displayName }) });
      toast.success(t.security.deviceRenamed);
      await loadDevices(devicePage);
    } catch {
      toast.error(t.security.deviceRenameFailed);
    } finally { setDeviceBusyId(''); }
  }

  useEffect(() => { load(); }, [t.dashboard.settingsLoadFailed]);
  useEffect(() => {
    if (!preferences || activeTab !== 'devices') return;
    void loadDevices(1);
  }, [activeTab, debouncedDeviceSearch, devicePageSize, deviceStatus, deviceSort]);

  async function save() {
    if (!preferences || saving || !dirty) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Preferences>('/me/notification-preferences', { method: 'PATCH', body: JSON.stringify(preferences) });
      setPreferences(updated);
      setSavedPreferences(updated);
      toast.success(t.dashboard.settingsSaved);
    } catch {
      toast.error(t.dashboard.settingsSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  function update(key: keyof Preferences, value: boolean) {
    setPreferences((current) => current ? { ...current, [key]: value } : current);
  }

  const tabs = [
    { key: 'notifications' as const, label: t.dashboard.settingsNotifications, icon: Bell },
    { key: 'privacy' as const, label: t.dashboard.settingsPrivacy, icon: Eye },
    { key: 'devices' as const, label: t.security.yourDevices, icon: MonitorSmartphone },
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1040px] space-y-6 px-0 md:space-y-7">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white md:text-3xl">{t.dashboard.settingsTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.dashboard.settingsSubtitle}</p>
          </div>
        </header>

        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !preferences ? (
          <TableSkeleton rows={5} columns={2} />
        ) : (
          <div className="min-w-0 space-y-5">
            <nav className="flex min-w-0 flex-wrap gap-2 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl shadow-black/10" aria-label={t.dashboard.settingsTitle}>
              {tabs.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" aria-current={activeTab === key ? 'page' : undefined} onClick={() => setActiveTab(key)} className={cn('inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/20', activeTab === key ? 'border-accent/25 bg-accent/15 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'border-transparent text-white/58 hover:bg-white/[0.055] hover:text-white')}>
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </nav>

            {activeTab === 'notifications' && (
              <Section title={t.dashboard.notificationPreferences} description={t.dashboard.notificationPreferencesDescription}>
                <div className="divide-y divide-white/10">
                  <PreferenceRow label={t.dashboard.announcementNotifications} description={t.dashboard.announcementNotificationsDescription} checked={preferences.announcementNotifications} onChange={(value) => update('announcementNotifications', value)} />
                  <PreferenceRow label={t.dashboard.eventNotifications} description={t.dashboard.eventNotificationsDescription} checked={preferences.eventNotifications} onChange={(value) => update('eventNotifications', value)} />
                  <PreferenceRow label={t.dashboard.birthdayReminderNotifications} description={t.dashboard.birthdayReminderNotificationsDescription} checked={preferences.birthdayReminderNotifications} onChange={(value) => update('birthdayReminderNotifications', value)} />
                  <PreferenceRow label={t.dashboard.passportExpirationNotifications} description={t.dashboard.passportExpirationNotificationsDescription} checked={preferences.passportExpirationRemindersEnabled} onChange={(value) => update('passportExpirationRemindersEnabled', value)} />
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                  <button type="button" disabled={!dirty || saving} onClick={() => setPreferences(savedPreferences)} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/15 disabled:opacity-40"><Undo2 size={16} />{t.admin.discardChanges}</button>
                  <LoadingButton loading={saving} loadingLabel={t.dashboard.savingSettings} disabled={!dirty} onClick={save}><Save size={16} />{t.dashboard.saveSettings}</LoadingButton>
                </div>
              </Section>
            )}

            {activeTab === 'privacy' && (
              <Section title={t.security.privacy} description={t.security.privacyDescription}>
                <div className="grid gap-4 md:grid-cols-2">
                  <VisibilityGroup title={t.security.publicInDirectory} items={t.security.publicDirectoryItems} />
                  <VisibilityGroup title={t.security.privateToYouAndAdmins} items={t.security.privateAccountItems} />
                </div>
                <div className="mt-5 flex justify-end border-t border-white/10 pt-4">
                  <Link href="/dashboard/profile" className="inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-bold text-background transition hover:bg-[#74e4b1]">{t.security.editProfile}</Link>
                </div>
              </Section>
            )}

            {activeTab === 'devices' && (
              <Section title={t.security.yourDevices} description={t.security.yourDevicesDescription}>
                {!chatDevices ? (
                  <TableSkeleton rows={3} columns={2} />
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/15 px-4 py-3">
                      <p className="text-sm text-white/60">{t.security.activeDeviceCount(chatDevices.activeCount, chatDevices.limit)}</p>
                      {chatDevices.overLimit && <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100">{t.security.deviceLimitExceeded}</span>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto]">
                      <label className="relative"><Search className="absolute left-3 top-2.5 text-white/30" size={15}/><input value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder={t.security.searchDevices} className="h-9 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-300/35"/></label>
                      <select aria-label={t.common.status} value={deviceStatus} onChange={(event) => setDeviceStatus(event.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#0b1512] px-3 text-sm text-white/65"><option value="">{t.common.all}</option><option value="ACTIVE">{t.security.active}</option><option value="REVOKED">{t.security.revoked}</option></select>
                      <select aria-label={t.security.sortDevices} value={deviceSort} onChange={(event) => setDeviceSort(event.target.value)} className="h-9 rounded-lg border border-white/10 bg-[#0b1512] px-3 text-sm text-white/65"><option value="lastSeenAt">{t.security.lastActive}</option><option value="createdAt">{t.security.added}</option><option value="displayName">{t.security.device}</option></select>
                    </div>
                    {chatDevices.devices.length === 0 ? <TableEmptyState title={t.security.noDevicesMatchFilters}/> : (
                      <>
                        <div className="hidden overflow-x-auto rounded-xl border border-white/[0.08] md:block"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-white/[0.025] text-xs text-white/38"><tr>{[t.security.device,t.security.operatingSystem,t.security.browser,t.common.status,t.security.added,t.security.lastActive,t.common.actions].map((label)=><th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.06]">{chatDevices.devices.map((device)=><tr key={device.id}><td className="px-3 py-3"><p className="font-semibold text-white/80">{localizedMemberDeviceName(device,t)}</p><p className="text-xs text-white/38">{device.current?t.security.currentDevice:device.generatedLabel?memberDeviceTypeLabel(device.deviceType,t):t.security.migratedDevice}</p></td><td className="px-3 py-3 text-white/60">{device.operatingSystemName?`${device.operatingSystemName}${device.operatingSystemVersion?` ${device.operatingSystemVersion}`:''}`:t.security.unknown}</td><td className="px-3 py-3 text-white/60">{device.browserName?`${device.browserName}${device.browserVersion?` ${device.browserVersion}`:''}`:t.security.browserDetailsUnavailable}</td><td className="px-3 py-3 text-white/60">{device.status==='ACTIVE'?t.security.active:t.security.revoked}</td><td className="px-3 py-3 text-xs text-white/42">{formatDeviceDate(device.createdAt,lang,chatDevices.timezone)}</td><td className="px-3 py-3 text-xs text-white/42">{device.lastSeenAt?formatDeviceDate(device.lastSeenAt,lang,chatDevices.timezone):t.security.never}</td><td className="px-3 py-3"><RowActionMenu label={t.common.actions} actions={[{label:t.common.details,run:()=>setSelectedDevice(device)},...(device.status==='ACTIVE'?[{label:t.security.renameDevice,run:()=>void renameDevice(device),disabled:Boolean(deviceBusyId)},{label:t.security.revokeDevice,run:()=>requestDeviceRevocation(device),danger:true,disabled:Boolean(deviceBusyId)}]:[])]}/></td></tr>)}</tbody></table></div>
                        <div className="space-y-2 md:hidden">{chatDevices.devices.map((device)=><article key={device.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{localizedMemberDeviceName(device,t)}</p><p className="mt-1 text-xs text-white/40">{device.current?t.security.currentDevice:device.generatedLabel?memberDeviceTypeLabel(device.deviceType,t):t.security.migratedDevice}</p></div><RowActionMenu label={t.common.actions} actions={[{label:t.common.details,run:()=>setSelectedDevice(device)},...(device.status==='ACTIVE'?[{label:t.security.renameDevice,run:()=>void renameDevice(device),disabled:Boolean(deviceBusyId)},{label:t.security.revokeDevice,run:()=>requestDeviceRevocation(device),danger:true,disabled:Boolean(deviceBusyId)}]:[])]}/></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/45"><span>{device.operatingSystemName??t.security.unknown}</span><span>{device.browserName??t.security.browserDetailsUnavailable}</span><span>{device.status==='ACTIVE'?t.security.active:t.security.revoked}</span><span>{device.lastSeenAt?formatDeviceDate(device.lastSeenAt,lang,chatDevices.timezone):t.security.never}</span></div></article>)}</div>
                        <DataTablePagination page={chatDevices.page} pageSize={chatDevices.pageSize} pageSizeOptions={[10,20,50,100]} total={chatDevices.total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(chatDevices.total?((chatDevices.page-1)*chatDevices.pageSize)+1:0,Math.min(chatDevices.page*chatDevices.pageSize,chatDevices.total),chatDevices.total)} onPageChange={(next)=>void loadDevices(next)} onPageSizeChange={(next)=>{setDevicePageSize(next);setDevicePage(1);}}/>
                      </>
                    )}
                    {selectedDevice&&<div className="rounded-xl border border-white/[0.08] bg-black/20 p-4"><div className="flex items-center justify-between"><h3 className="font-semibold text-white">{t.security.deviceDetails}</h3><button type="button" onClick={()=>setSelectedDevice(null)} className="text-sm text-white/50">{t.common.close}</button></div><dl className="mt-3 grid gap-2 text-sm text-white/60"><div>{t.security.device}: {localizedMemberDeviceName(selectedDevice,t)}</div><div>{t.security.operatingSystem}: {selectedDevice.operatingSystemName??t.security.unknown}</div><div>{t.security.browser}: {selectedDevice.browserName??t.security.browserDetailsUnavailable}</div><div>{t.common.status}: {selectedDevice.status==='ACTIVE'?t.security.active:t.security.revoked}</div></dl></div>}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={t.security.revokeDeviceConfirmTitle}
        description={revokeTarget?.current ? t.security.revokeCurrentChatDeviceConfirmDescription : t.security.revokeChatDeviceConfirmDescription}
        confirmLabel={t.security.revokeDevice}
        cancelLabel={t.common.cancel}
        loading={Boolean(revokeTarget && deviceBusyId === revokeTarget.id)}
        loadingLabel={t.security.revokingDevice}
        danger
        onConfirm={() => void confirmDeviceRevocation()}
        onCancel={() => {
          if (!deviceRevocationInFlight.current) setRevokeTarget(null);
        }}
      />
    </AppShell>
  );
}

function useDebouncedValue(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function formatDeviceDate(value: string, lang: string, timezone: string) {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
}

function memberDeviceTypeLabel(type: string, t: ReturnType<typeof useI18n>['t']) {
  if (type === 'DESKTOP') return t.admin.desktop;
  if (type === 'MOBILE') return t.admin.mobile;
  if (type === 'TABLET') return t.admin.tablet;
  return t.security.unknown;
}

function localizedMemberDeviceName(device: ChatDevice, t: ReturnType<typeof useI18n>['t']) {
  if (device.customDisplayName) return device.displayName;
  if (device.browserName && device.operatingSystemName) {
    return t.security.deviceOnOperatingSystem(device.browserName, device.operatingSystemName);
  }
  if (device.browserName) return t.security.browserDevice(device.browserName);
  if (device.operatingSystemName) return t.security.operatingSystemDevice(device.operatingSystemName);
  return device.generatedLabel ?? t.security.migratedDevice;
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[1.35rem] border-white/[0.08] bg-white/[0.035] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="border-b border-white/[0.06] px-5 py-5 md:px-6">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-white md:text-lg">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/50">{description}</p>
      </div>
      <div className="min-w-0 p-5 md:p-6">{children}</div>
    </Card>
  );
}

function PreferenceRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="grid min-w-0 gap-3 border-t border-white/[0.06] py-4 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:gap-8 md:py-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-sm leading-5 text-white/45">{description}</p>
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-accent/20 sm:justify-self-end', checked ? 'border-accent/40 bg-accent/70' : 'border-white/12 bg-white/10')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-lg transition', checked ? 'left-5' : 'left-0.5')} />
      </button>
    </div>
  );
}

function VisibilityGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
      <h3 className="text-sm font-semibold tracking-[-0.01em] text-white">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-white/58">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
