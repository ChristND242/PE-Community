'use client';

import { Database, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { enrichCurrentChatDeviceMetadata } from '../lib/chat-device-metadata';
import { useI18n } from '../lib/i18n';
import { AppSelect } from './app-select';
import { RowActionMenu } from './row-action-menu';
import { ConfirmDialog, DataTablePagination, TableEmptyState, TableErrorState, TableSkeleton } from './ui';

type Device = {
  id: string; displayName: string; generatedLabel: string | null; customDisplayName: string | null;
  deviceType: string; operatingSystemName: string | null; operatingSystemVersion: string | null;
  browserName: string | null; browserVersion: string | null; status: string; createdAt: string;
  lastSeenAt: string | null; revokedAt: string | null; fingerprintSummary: string | null;
  member: { id: string; name: string; email: string };
};
type DevicePage = { devices: Device[]; page: number; pageSize: number; pageCount: number; total: number };
type StorageSummary = {
  usage: { totalBytes: string; imageBytes: string; videoBytes: string; audioBytes: string; documentBytes: string; otherBytes: string; attachmentCount: string };
  quotaBytes: string | null;
};
type Media = {
  id: string; conversationId: string; encryptedBytes: string; mediaCategory: string; lifecycleStatus: string;
  viewOnce: boolean; createdAt: string; retentionExpiresAt: string | null; deletionRequestedAt: string | null;
  deletionCompletedAt: string | null; deletionAttempts: number; deletionErrorCategory: string | null;
  uploader: { id: string; name: string; email: string };
  conversation: { id: string; label: string; type: string };
  latestDeletionOperation: { id: string; status: string; attempts: number; errorCode: string | null } | null;
};
type MediaPage = { attachments: Media[]; page: number; pageSize: number; pageCount: number; total: number };
type Translation = ReturnType<typeof useI18n>['t'];
type PageData = { page: number; pageSize: number; total: number };
type DevicePresentationProps = {
  device: Device;
  locale: string;
  timezone: string;
  t: Translation;
  canRevoke: boolean;
  onDetails: (device: Device) => void;
  onRevoke: (device: Device) => void;
};
type MediaPresentationProps = {
  media: Media;
  locale: string;
  timezone: string;
  t: Translation;
  canDelete: boolean;
  onDetails: (media: Media) => void;
  onDelete: (media: Media) => void;
  onRetry: (media: Media) => void;
};

export function CommunityChatDevicesTable({ canRevoke, timezone }: { canRevoke: boolean; timezone: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<DevicePage | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [sortBy, setSortBy] = useState('lastSeenAt');
  const [selected, setSelected] = useState<Device | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const metadataEnrichmentAttempted = useRef(false);

  async function load() {
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search: debouncedSearch, status, deviceType, sortBy, sortOrder: 'desc' });
      setData(await apiFetch<DevicePage>(`/chat/admin/devices?${query}`));
    } catch {
      setError(t.admin.chatGovernanceLoadFailed);
    }
  }
  useEffect(() => { void load(); }, [page, pageSize, debouncedSearch, status, deviceType, sortBy]);
  useEffect(() => { setPage(1); }, [debouncedSearch, status, deviceType, sortBy]);
  useEffect(() => {
    if (metadataEnrichmentAttempted.current) return;
    metadataEnrichmentAttempted.current = true;
    void apiFetch<{ id: string; communityId: string }>('/auth/me')
      .then(enrichCurrentChatDeviceMetadata)
      .then((changed) => changed ? load() : undefined)
      .catch(() => undefined);
  }, []);

  async function revoke() {
    if (!revokeTarget || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/chat/admin/devices/${revokeTarget.id}/revoke`, { method: 'POST' });
      toast.success(t.security.chatDeviceRevoked);
      setRevokeTarget(null);
      await load();
    } catch {
      toast.error(t.security.chatDeviceRevokeFailed);
    } finally { setBusy(false); }
  }

  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/15">
      <div className="p-4"><h3 className="text-sm font-semibold text-white">{t.admin.communityChatDevices}</h3><p className="mt-1 text-sm text-white/45">{data ? t.admin.chatDeviceResultCount(data.total) : t.common.loading}</p></div>
      <div className="grid gap-2 border-y border-white/[0.07] p-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
        <label className="relative"><Search className="absolute left-3 top-2.5 text-white/30" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.admin.searchDevices} className="h-9 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-300/35" /></label>
        <FilterSelect value={status} label={t.admin.filterChatDevicesByStatus} onChange={setStatus} options={[['', t.common.all], ['ACTIVE', t.security.active], ['REVOKED', t.security.revoked]]} className="min-w-[9rem]" />
        <FilterSelect value={deviceType} label={t.admin.filterChatDevicesByType} onChange={setDeviceType} options={[['', t.common.all], ['DESKTOP', t.admin.desktop], ['MOBILE', t.admin.mobile], ['TABLET', t.admin.tablet], ['UNKNOWN', t.admin.unknown]]} />
        <FilterSelect value={sortBy} label={t.admin.sortChatDevices} onChange={setSortBy} options={[['lastSeenAt', t.admin.lastActive], ['createdAt', t.admin.added], ['displayName', t.admin.device], ['memberName', t.admin.member]]} />
      </div>
      {error ? <div className="p-4"><TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /></div> : !data ? <div className="p-4"><TableSkeleton rows={5} columns={7} /></div> : data.devices.length === 0 ? <div className="p-4"><TableEmptyState title={t.admin.noDevicesMatchFilters} /></div> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-white/[0.025] text-xs text-white/38"><tr>{[t.admin.device,t.admin.member,t.admin.operatingSystem,t.admin.browser,t.common.status,t.admin.added,t.admin.lastActive,t.common.actions].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-white/[0.06]">{data.devices.map((device) => <DeviceRow key={device.id} device={device} locale={locale} timezone={timezone} t={t} canRevoke={canRevoke} onDetails={setSelected} onRevoke={setRevokeTarget} />)}</tbody>
            </table>
          </div>
          <div className="divide-y divide-white/[0.06] md:hidden">{data.devices.map((device) => <DeviceCard key={device.id} device={device} locale={locale} timezone={timezone} t={t} canRevoke={canRevoke} onDetails={setSelected} onRevoke={setRevokeTarget} />)}</div>
          <Pagination data={data} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} t={t} />
        </>
      )}
      {selected && <DetailDrawer title={t.admin.deviceDetails} closeLabel={t.common.close} onClose={() => setSelected(null)} rows={[
        [t.admin.device, selected.displayName], [t.admin.member, `${selected.member.name} · ${selected.member.email}`],
        [t.admin.deviceType, deviceTypeLabel(selected.deviceType, t)], [t.admin.operatingSystem, versioned(selected.operatingSystemName, selected.operatingSystemVersion, t.admin.unknown)],
        [t.admin.browser, versioned(selected.browserName, selected.browserVersion, t.admin.browserDetailsUnavailable)], [t.common.status, statusLabel(selected.status, t)],
        [t.admin.added, formatDate(selected.createdAt, locale, timezone)], [t.admin.lastActive, selected.lastSeenAt ? formatDate(selected.lastSeenAt, locale, timezone) : t.admin.never],
        [t.admin.fingerprintSummary, selected.fingerprintSummary ?? t.admin.unavailable],
      ]} footer={<Link href={`/admin/members/${selected.member.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-200">{t.admin.viewMember}<ExternalLink size={14}/></Link>} />}
      <ConfirmDialog open={Boolean(revokeTarget)} title={t.security.revokeDevice} description={t.admin.revokeCommunityChatDeviceConfirm} confirmLabel={t.security.revokeDevice} cancelLabel={t.common.cancel} loading={busy} onConfirm={revoke} onCancel={() => setRevokeTarget(null)} />
    </section>
  );
}

export function ChatMediaStorageTable({ canManage, canDelete, timezone }: { canManage: boolean; canDelete: boolean; timezone: string }) {
  const { t, lang } = useI18n();
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [data, setData] = useState<MediaPage | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('encryptedSize');
  const [selected, setSelected] = useState<Media | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Media | null>(null);
  const [busy, setBusy] = useState('');
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  async function loadSummary() { setSummary(await apiFetch<StorageSummary>('/chat/admin/storage')); }
  async function loadTable() {
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search: debouncedSearch, category, status, sortBy, sortOrder: 'desc' });
      setData(await apiFetch<MediaPage>(`/chat/admin/storage/attachments?${query}`));
    } catch { setError(t.admin.chatGovernanceLoadFailed); }
  }
  useEffect(() => { void loadSummary().catch(() => setError(t.admin.chatGovernanceLoadFailed)); }, []);
  useEffect(() => { void loadTable(); }, [page, pageSize, debouncedSearch, category, status, sortBy]);
  useEffect(() => { setPage(1); }, [debouncedSearch, category, status, sortBy]);

  async function reconcile() {
    if (!canManage || busy) return;
    setBusy('reconcile');
    try { await apiFetch('/chat/admin/storage/reconcile', { method: 'POST' }); await loadSummary(); toast.success(t.admin.chatStorageReconciled); }
    catch { toast.error(t.admin.chatStorageReconcileFailed); } finally { setBusy(''); }
  }
  async function deleteMedia() {
    if (!deleteTarget || busy) return;
    setBusy(deleteTarget.id);
    try {
      await apiFetch(`/chat/admin/storage/attachments/${deleteTarget.id}/delete`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      toast.success(t.admin.chatMediaDeletionQueued); setDeleteTarget(null); await Promise.all([loadSummary(), loadTable()]);
    } catch { toast.error(t.admin.chatMediaDeletionFailed); } finally { setBusy(''); }
  }
  async function retry(media: Media) {
    const operationId = media.latestDeletionOperation?.id;
    if (!operationId || busy) return;
    setBusy(operationId);
    try { await apiFetch(`/chat/admin/storage/deletions/${operationId}/retry`, { method: 'POST' }); toast.success(t.admin.chatMediaDeletionQueued); await loadTable(); }
    catch { toast.error(t.admin.chatMediaDeletionFailed); } finally { setBusy(''); }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/15">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="text-sm font-semibold text-white">{t.admin.chatMediaStorage}</h3><p className="mt-1 text-sm text-white/45">{t.admin.encryptedMetadataOnly}</p></div>{canManage && <button type="button" disabled={Boolean(busy)} onClick={reconcile} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-white/65 hover:bg-white/[0.05] disabled:opacity-40"><RefreshCw size={14} className={busy === 'reconcile' ? 'animate-spin' : ''}/>{t.admin.reconcileStorage}</button>}</div>
      {!summary ? <div className="px-4 pb-4"><TableSkeleton rows={2} columns={3}/></div> : <><div className="grid gap-3 px-4 pb-4 sm:grid-cols-3"><Metric label={t.admin.storageUsed} value={formatBytes(summary.usage.totalBytes)}/><Metric label={t.admin.attachments} value={summary.usage.attachmentCount}/><Metric label={t.admin.storageQuota} value={summary.quotaBytes ? formatBytes(summary.quotaBytes) : t.admin.noQuota}/></div><div className="grid gap-2 px-4 pb-4 sm:grid-cols-5"><Metric label={t.admin.images} value={formatBytes(summary.usage.imageBytes)}/><Metric label={t.admin.videos} value={formatBytes(summary.usage.videoBytes)}/><Metric label={t.admin.audio} value={formatBytes(summary.usage.audioBytes)}/><Metric label={t.admin.documents} value={formatBytes(summary.usage.documentBytes)}/><Metric label={t.admin.other} value={formatBytes(summary.usage.otherBytes)}/></div></>}
      <div className="grid gap-2 border-y border-white/[0.07] p-3 md:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
        <label className="relative"><Search className="absolute left-3 top-2.5 text-white/30" size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.admin.searchEncryptedMedia} className="h-9 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-300/35"/></label>
        <FilterSelect value={category} label={t.admin.filterChatMediaByType} onChange={setCategory} options={[['',t.common.all],['IMAGE',t.admin.images],['VIDEO',t.admin.videos],['AUDIO',t.admin.audio],['DOCUMENT',t.admin.documents],['OTHER',t.admin.other]]}/>
        <FilterSelect value={status} label={t.admin.filterChatMediaByStatus} onChange={setStatus} options={[['',t.common.all],['ACTIVE',t.security.active],['PENDING_DELETION',t.admin.pendingDeletion],['DELETING',t.admin.deleting],['DELETED',t.admin.deleted],['DELETE_FAILED',t.admin.deletionFailed]]} className="min-w-[12rem]"/>
        <FilterSelect value={sortBy} label={t.admin.sortChatMedia} onChange={setSortBy} options={[['encryptedSize',t.admin.size],['createdAt',t.admin.uploaded],['mediaCategory',t.admin.mediaType],['lifecycleStatus',t.common.status]]}/>
      </div>
      {error ? <div className="p-4"><TableErrorState title={error} retryLabel={t.common.retry} onRetry={loadTable}/></div> : !data ? <div className="p-4"><TableSkeleton rows={6} columns={7}/></div> : data.attachments.length === 0 ? <div className="p-4"><TableEmptyState title={t.admin.noEncryptedMediaMatchFilters}/></div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/[0.025] text-xs text-white/38"><tr>{[t.admin.attachment,t.admin.mediaType,t.admin.conversation,t.admin.uploadedBy,t.admin.size,t.admin.uploaded,t.common.status,t.common.actions].map((label)=><th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.06]">{data.attachments.map((media)=><MediaRow key={media.id} media={media} locale={locale} timezone={timezone} t={t} canDelete={canDelete} onDetails={setSelected} onDelete={setDeleteTarget} onRetry={retry}/>)}</tbody></table></div>
        <div className="divide-y divide-white/[0.06] md:hidden">{data.attachments.map((media)=><MediaCard key={media.id} media={media} locale={locale} timezone={timezone} t={t} canDelete={canDelete} onDetails={setSelected} onDelete={setDeleteTarget} onRetry={retry}/>)}</div>
        <Pagination data={data} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} t={t}/>
      </>}
      {selected && <DetailDrawer title={t.admin.mediaDetails} closeLabel={t.common.close} onClose={()=>setSelected(null)} rows={[[t.admin.attachment,mediaLabel(selected.mediaCategory,t)],[t.admin.attachmentId,selected.id],[t.admin.mediaType,selected.mediaCategory],[t.admin.size,formatBytes(selected.encryptedBytes)],[t.admin.conversation,selected.conversation.label],[t.admin.uploadedBy,`${selected.uploader.name} · ${selected.uploader.email}`],[t.admin.uploaded,formatDate(selected.createdAt,locale,timezone)],[t.common.status,mediaStatusLabel(selected.lifecycleStatus,t)],[t.admin.retentionDate,selected.retentionExpiresAt?formatDate(selected.retentionExpiresAt,locale,timezone):t.admin.none],[t.admin.deletionAttempts,String(selected.deletionAttempts)]]}/>}
      <ConfirmDialog open={Boolean(deleteTarget)} title={t.admin.deleteEncryptedMedia} description={t.admin.chatMediaDeletionDetailedConfirm} confirmLabel={t.admin.deleteEncryptedMedia} cancelLabel={t.common.cancel} loading={Boolean(busy)} onConfirm={deleteMedia} onCancel={()=>setDeleteTarget(null)}/>
    </section>
  );
}

function DeviceRow({ device, locale, timezone, t, canRevoke, onDetails, onRevoke }: DevicePresentationProps) {
  return <tr><td className="px-3 py-3"><Primary title={localizedDeviceName(device, t)} subtitle={device.generatedLabel ? deviceTypeLabel(device.deviceType, t) : t.admin.migratedDevice}/></td><td className="px-3 py-3"><Primary title={device.member.name} subtitle={device.member.email}/></td><td className="px-3 py-3 text-white/60">{versioned(device.operatingSystemName, device.operatingSystemVersion, t.admin.unknown)}</td><td className="px-3 py-3 text-white/60">{versioned(device.browserName, device.browserVersion, t.admin.browserDetailsUnavailable)}</td><td className="px-3 py-3">{statusLabel(device.status, t)}</td><td className="px-3 py-3 text-xs text-white/45">{formatDate(device.createdAt, locale, timezone)}</td><td className="px-3 py-3 text-xs text-white/45">{device.lastSeenAt ? formatDate(device.lastSeenAt, locale, timezone) : t.admin.never}</td><td className="px-3 py-3"><RowActionMenu label={t.common.actions} actions={[{ label: t.common.details, run: () => onDetails(device) }, { label: t.admin.viewMember, href: `/admin/members/${device.member.id}` }, ...(canRevoke && device.status === 'ACTIVE' ? [{ label: t.security.revokeDevice, run: () => onRevoke(device), danger: true }] : [])]}/></td></tr>;
}

function DeviceCard({ device, locale, timezone, t, canRevoke, onDetails, onRevoke }: DevicePresentationProps) {
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><Primary title={localizedDeviceName(device, t)} subtitle={`${device.member.name} · ${device.member.email}`}/><RowActionMenu label={t.common.actions} actions={[{ label: t.common.details, run: () => onDetails(device) }, { label: t.admin.viewMember, href: `/admin/members/${device.member.id}` }, ...(canRevoke && device.status === 'ACTIVE' ? [{ label: t.security.revokeDevice, run: () => onRevoke(device), danger: true }] : [])]}/></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs text-white/45"><span>{versioned(device.operatingSystemName, device.operatingSystemVersion, t.admin.unknown)}</span><span>{versioned(device.browserName, device.browserVersion, t.admin.browserDetailsUnavailable)}</span><span>{statusLabel(device.status, t)}</span><span>{device.lastSeenAt ? formatDate(device.lastSeenAt, locale, timezone) : t.admin.never}</span></div></article>;
}

function MediaRow({ media, locale, timezone, t, canDelete, onDetails, onDelete, onRetry }: MediaPresentationProps) {
  return <tr><td className="px-3 py-3"><Primary title={mediaLabel(media.mediaCategory, t)} subtitle={`…${media.id.slice(-6)}`}/></td><td className="px-3 py-3 text-white/60">{mediaLabel(media.mediaCategory, t)}</td><td className="px-3 py-3 text-white/60">{media.conversation.label}</td><td className="px-3 py-3"><Primary title={media.uploader.name} subtitle={media.uploader.email}/></td><td className="px-3 py-3 text-white/60">{formatBytes(media.encryptedBytes)}</td><td className="px-3 py-3 text-xs text-white/45">{formatDate(media.createdAt, locale, timezone)}</td><td className="px-3 py-3">{mediaStatusLabel(media.lifecycleStatus, t)}</td><td className="px-3 py-3"><RowActionMenu label={t.common.actions} actions={[{ label: t.admin.viewMetadata, run: () => onDetails(media) }, ...(canDelete && media.lifecycleStatus === 'ACTIVE' ? [{ label: t.admin.deleteEncryptedMedia, run: () => onDelete(media), danger: true }] : []), ...(canDelete && media.lifecycleStatus === 'DELETE_FAILED' && media.latestDeletionOperation ? [{ label: t.admin.retryCleanup, run: () => onRetry(media) }] : [])]}/></td></tr>;
}

function MediaCard({ media, locale, timezone, t, canDelete, onDetails, onDelete, onRetry }: MediaPresentationProps) {
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><Primary title={mediaLabel(media.mediaCategory, t)} subtitle={`…${media.id.slice(-6)} · ${formatBytes(media.encryptedBytes)}`}/><RowActionMenu label={t.common.actions} actions={[{ label: t.admin.viewMetadata, run: () => onDetails(media) }, ...(canDelete && media.lifecycleStatus === 'ACTIVE' ? [{ label: t.admin.deleteEncryptedMedia, run: () => onDelete(media), danger: true }] : []), ...(canDelete && media.lifecycleStatus === 'DELETE_FAILED' && media.latestDeletionOperation ? [{ label: t.admin.retryCleanup, run: () => onRetry(media) }] : [])]}/></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs text-white/45"><span>{media.conversation.label}</span><span>{media.uploader.name}</span><span>{mediaStatusLabel(media.lifecycleStatus, t)}</span><span>{formatDate(media.createdAt, locale, timezone)}</span></div></article>;
}

function DetailDrawer({title,closeLabel,onClose,rows,footer}:{title:string;closeLabel:string;onClose:()=>void;rows:Array<[string,string]>;footer?:React.ReactNode}){useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose]);return <div className="fixed inset-0 z-50 flex justify-end bg-black/55" role="dialog" aria-modal="true" aria-label={title}><button type="button" aria-label={closeLabel} onClick={onClose} className="absolute inset-0"/><aside className="relative z-10 h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#0b1512] p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">{title}</h2><button type="button" aria-label={closeLabel} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-white/50 hover:bg-white/[0.07]"><X size={17}/></button></div><dl className="mt-5 divide-y divide-white/[0.07]">{rows.map(([label,value])=><div key={label} className="grid gap-1 py-3"><dt className="text-xs text-white/38">{label}</dt><dd className="break-words text-sm text-white/72">{value}</dd></div>)}</dl>{footer&&<div className="mt-5 border-t border-white/[0.07] pt-4">{footer}</div>}</aside></div>}
function Pagination({ data, pageSize, onPage, onPageSize, t }: { data: PageData; pageSize: number; onPage: (page: number) => void; onPageSize: (pageSize: number) => void; t: Translation }){const start=data.total?((data.page-1)*data.pageSize)+1:0;const end=Math.min(data.page*data.pageSize,data.total);return <DataTablePagination page={data.page} pageSize={pageSize} pageSizeOptions={[10,20,50,100]} total={data.total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start,end,data.total)} onPageChange={onPage} onPageSizeChange={(next:number)=>{onPageSize(next);onPage(1);}}/>}
function FilterSelect({value,label,onChange,options,className}:{value:string;label:string;onChange:(value:string)=>void;options:Array<[string,string]>;className?:string}){return <AppSelect value={value} ariaLabel={label} options={options.map(([option,text])=>({value:option,label:text}))} onChange={onChange} className={className}/>}
function Primary({title,subtitle}:{title:string;subtitle:string}){return <div className="min-w-0"><p className="truncate font-semibold text-white/80">{title}</p><p className="mt-0.5 truncate text-xs text-white/38">{subtitle}</p></div>}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2"><p className="text-xs text-white/38">{label}</p><p className="mt-1 text-sm font-semibold text-white">{value}</p></div>}
function useDebounced(value:string){const [debounced,setDebounced]=useState(value);useEffect(()=>{const timer=window.setTimeout(()=>setDebounced(value.trim()),300);return()=>window.clearTimeout(timer);},[value]);return debounced;}
function versioned(name:string|null,version:string|null,fallback:string){return name?`${name}${version?` ${version}`:''}`:fallback;}
function formatDate(value:string,locale:string,timezone:string){return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(value));}
function statusLabel(status:string,t:Translation){return status==='ACTIVE'?t.security.active:t.security.revoked;}
function mediaStatusLabel(status:string,t:Translation){return status==='ACTIVE'?t.security.active:status==='PENDING_DELETION'?t.admin.pendingDeletion:status==='DELETING'?t.admin.deleting:status==='DELETED'?t.admin.deleted:t.admin.deletionFailed;}
function deviceTypeLabel(type:string,t:Translation){return type==='DESKTOP'?t.admin.desktop:type==='MOBILE'?t.admin.mobile:type==='TABLET'?t.admin.tablet:t.admin.unknown;}
function localizedDeviceName(device:Device,t:Translation){if(device.customDisplayName)return device.displayName;if(device.browserName&&device.operatingSystemName)return t.security.deviceOnOperatingSystem(device.browserName,device.operatingSystemName);if(device.browserName)return t.security.browserDevice(device.browserName);if(device.operatingSystemName)return t.security.operatingSystemDevice(device.operatingSystemName);return device.generatedLabel??t.security.migratedDevice;}
function mediaLabel(category:string,t:Translation){return category==='IMAGE'?t.admin.encryptedImage:category==='VIDEO'?t.admin.encryptedVideo:category==='AUDIO'?t.admin.encryptedAudio:category==='DOCUMENT'?t.admin.encryptedDocument:t.admin.encryptedAttachment;}
function formatBytes(value:string){const bytes=BigInt(value);if(bytes<1024n)return`${bytes} B`;if(bytes<1_048_576n)return`${bytes/1024n} KB`;if(bytes<1_073_741_824n)return formatUnit(bytes,1_048_576n,1,'MB');return formatUnit(bytes,1_073_741_824n,2,'GB');}
function formatUnit(value:bigint,unit:bigint,decimals:number,suffix:string){const scale=10n**BigInt(decimals);const scaled=(value*scale)/unit;return`${scaled/scale}.${String(scaled%scale).padStart(decimals,'0')} ${suffix}`;}
