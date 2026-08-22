'use client';

import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { hasPermission, PERMISSIONS, type PermissionUser } from '../lib/permissions';
import { LoadingButton, TableErrorState, TableSkeleton } from './ui';
import { ChatMediaStorageTable, CommunityChatDevicesTable } from './chat-governance-tables';

type GovernanceSettings = {
  maxActiveChatDevices: number;
  chatMediaQuotaBytes: string | null;
  chatMediaWarningPercent: number;
  chatAttachmentMaxBytes: number;
  timezone: string;
};

export function ChatGovernanceSettings({ user }: { user: PermissionUser }) {
  const { t } = useI18n();
  const canManageLimit = hasPermission(user, PERMISSIONS.chatDeviceLimitManage);
  const canViewDevices = hasPermission(user, PERMISSIONS.chatDevicesView);
  const canRevokeDevices = hasPermission(user, PERMISSIONS.chatDevicesRevoke);
  const canViewStorage = hasPermission(user, PERMISSIONS.chatStorageView);
  const canManageStorage = hasPermission(user, PERMISSIONS.chatStorageManage);
  const canDeleteMedia = hasPermission(user, PERMISSIONS.chatMediaDelete);
  const [settings, setSettings] = useState<GovernanceSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<GovernanceSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      if (canManageLimit || canManageStorage || canViewStorage) {
        const data = await apiFetch<GovernanceSettings>('/chat/admin/settings');
        setSettings(data);
        setSavedSettings(data);
      }
    } catch {
      setError(t.admin.chatGovernanceLoadFailed);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!settings || busy) return;
    if (!Number.isInteger(settings.maxActiveChatDevices) || settings.maxActiveChatDevices < 1 || settings.maxActiveChatDevices > 8) {
      toast.error(t.admin.chatDeviceLimitValidation);
      return;
    }
    setBusy(true);
    try {
      const payload: Partial<GovernanceSettings> = {};
      if (canManageLimit) payload.maxActiveChatDevices = settings.maxActiveChatDevices;
      if (canManageStorage) {
        payload.chatMediaQuotaBytes = settings.chatMediaQuotaBytes;
        payload.chatMediaWarningPercent = settings.chatMediaWarningPercent;
        payload.chatAttachmentMaxBytes = settings.chatAttachmentMaxBytes;
      }
      const updated = await apiFetch<GovernanceSettings>('/chat/admin/settings', { method: 'PATCH', body: JSON.stringify(payload) });
      setSettings(updated);
      setSavedSettings(updated);
      toast.success(t.admin.chatGovernanceSaved);
    } catch {
      toast.error(t.admin.chatGovernanceSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />;
  if ((canManageLimit || canManageStorage || canViewStorage) && !settings) return <TableSkeleton rows={5} columns={3} />;

  return (
    <div className="space-y-5">
      {settings && (canManageLimit || canManageStorage) && (
        <section className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
          <div className="flex items-start gap-3">
            <span className="rounded-lg border border-emerald-300/15 bg-emerald-300/10 p-2 text-emerald-200"><ShieldCheck size={17} /></span>
            <div>
              <h3 className="text-sm font-semibold text-white">{t.admin.chatSecurityGovernance}</h3>
              <p className="mt-1 text-sm leading-6 text-white/48">{t.admin.chatSecurityGovernanceDescription}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {canManageLimit && <NumberInput label={t.admin.maximumActiveChatDevices} value={settings.maxActiveChatDevices} min={1} max={8} onChange={(value) => setSettings({ ...settings, maxActiveChatDevices: value })} />}
            {canManageStorage && <NumberInput label={t.admin.storageWarningPercent} value={settings.chatMediaWarningPercent} min={1} max={100} onChange={(value) => setSettings({ ...settings, chatMediaWarningPercent: value })} />}
            {canManageStorage && <NumberInput label={t.admin.chatAttachmentLimitMb} value={Math.round(settings.chatAttachmentMaxBytes / 1_048_576)} min={1} max={10} onChange={(value) => setSettings({ ...settings, chatAttachmentMaxBytes: value * 1_048_576 })} />}
            {canManageStorage && (
              <label className="block min-w-0">
                <span className="text-sm font-medium text-white/70">{t.admin.chatMediaQuotaGb}</span>
                <input type="number" min={1} value={settings.chatMediaQuotaBytes ? String(BigInt(settings.chatMediaQuotaBytes) / 1_073_741_824n) : ''} placeholder={t.admin.noQuota} onChange={(event) => setSettings({ ...settings, chatMediaQuotaBytes: /^\d+$/.test(event.target.value) ? (BigInt(event.target.value) * 1_073_741_824n).toString() : null })} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/40" />
              </label>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-white/[0.07] pt-4">
            <button type="button" disabled={!savedSettings || busy} onClick={() => setSettings(savedSettings)} className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-white/60 transition hover:bg-white/[0.05] disabled:opacity-40">{t.admin.discardChanges}</button>
            <LoadingButton loading={busy} loadingLabel={t.admin.savingSettings} disabled={JSON.stringify(settings) === JSON.stringify(savedSettings)} onClick={save}>{t.common.save}</LoadingButton>
          </div>
        </section>
      )}
      {canViewDevices && <CommunityChatDevicesTable canRevoke={canRevokeDevices} timezone={settings?.timezone ?? 'UTC'} />}
      {canViewStorage && <ChatMediaStorageTable canManage={canManageStorage} canDelete={canDeleteMedia} timezone={settings?.timezone ?? 'UTC'} />}
    </div>
  );
}

function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block min-w-0"><span className="text-sm font-medium text-white/70">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/40" /></label>;
}
