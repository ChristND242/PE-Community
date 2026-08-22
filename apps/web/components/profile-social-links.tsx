'use client';

import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ApiRequestError, apiFetch } from '../lib/api';
import {
  normalizeProfileIdentifier,
  profileLinkDefinition,
  profileLinkPlatforms,
  profileLinkPreviewHref,
  type ProfileLinkDto,
  type ProfileLinkPlatform,
  type ProfileLinkVisibility,
} from '../lib/profile-links';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import { AppSelect } from './app-select';
import { ProfilePlatformCombobox } from './profile-platform-combobox';
import { Button, ConfirmDialog, LoadingButton } from './ui';

const maxLinks = 15;
type DashboardLabels = ReturnType<typeof useI18n>['t']['dashboard'];
type Draft = { platform: ProfileLinkPlatform; label: string; identifier: string; url: string; visibility: ProfileLinkVisibility };
const emptyDraft: Draft = { platform: 'WEBSITE', label: '', identifier: '', url: '', visibility: 'PUBLIC' };

export function ProfileSocialLinks({ endpoint, initialLinks = [], onChange, canManage = true }: { endpoint: string; initialLinks?: ProfileLinkDto[]; onChange?: (links: ProfileLinkDto[]) => void; canManage?: boolean }) {
  const { t } = useI18n();
  const [links, setLinks] = useState(initialLinks);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => setLinks(initialLinks), [initialLinks]);

  const labels = platformLabels(t.dashboard);
  const availablePlatforms = useMemo(() => profileLinkPlatforms.filter((platform) => {
    const used = links.some((link) => link.platform === platform.value);
    return platform.allowMultiple || !used || draft.platform === platform.value;
  }), [draft.platform, links]);
  const selectedDefinition = profileLinkDefinition(draft.platform);

  function commit(next: ProfileLinkDto[]) {
    setLinks(next);
    onChange?.(next);
  }

  async function createLink() {
    const validation = validateDraft(draft, t.dashboard);
    if (validation) { setFieldError(validation); return; }
    if (busy) return;
    setBusy('create');
    setFieldError('');
    try {
      const created = await apiFetch<ProfileLinkDto>(endpoint, { method: 'POST', body: JSON.stringify(profileLinkPayload(draft, true)) });
      commit([...links, created]);
      setDraft(emptyDraft);
      setAddOpen(false);
      toast.success(t.dashboard.profileLinkAdded);
    } catch (error) {
      const message = profileLinkErrorMessage(error, t.dashboard);
      setFieldError(message);
      toast.error(message);
    } finally { setBusy(''); }
  }

  function beginEdit(link: ProfileLinkDto) {
    setEditingId(link.id);
    setEditDraft({ platform: link.platform, label: link.label ?? '', identifier: link.identifier ?? '', url: link.url ?? '', visibility: link.visibility });
    setFieldError('');
  }

  async function saveEdit() {
    if (!editingId || busy) return;
    const validation = validateDraft(editDraft, t.dashboard);
    if (validation) { setFieldError(validation); return; }
    setBusy(`edit:${editingId}`);
    setFieldError('');
    try {
      const updated = await apiFetch<ProfileLinkDto>(`${endpoint}/${editingId}`, { method: 'PATCH', body: JSON.stringify(profileLinkPayload(editDraft, false)) });
      commit(links.map((link) => link.id === updated.id ? updated : link));
      setEditingId(null);
      toast.success(t.dashboard.profileLinkUpdated);
    } catch (error) {
      const message = profileLinkErrorMessage(error, t.dashboard);
      setFieldError(message);
      toast.error(message);
    } finally { setBusy(''); }
  }

  async function removeLink() {
    if (!removingId || busy) return;
    setBusy(`remove:${removingId}`);
    try {
      await apiFetch(`${endpoint}/${removingId}`, { method: 'DELETE' });
      commit(links.filter((link) => link.id !== removingId).map((link, position) => ({ ...link, position })));
      setRemovingId(null);
      toast.success(t.dashboard.profileLinkRemoved);
    } catch { toast.error(t.dashboard.profileLinkRemoveFailed); } finally { setBusy(''); }
  }

  async function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= links.length || busy) return;
    const previous = links;
    const next = [...links];
    [next[index], next[target]] = [next[target], next[index]];
    const positioned = next.map((link, position) => ({ ...link, position }));
    commit(positioned);
    setBusy('order');
    try {
      const ordered = await apiFetch<ProfileLinkDto[]>(`${endpoint}/order`, { method: 'PUT', body: JSON.stringify({ orderedIds: positioned.map((link) => link.id) }) });
      commit(ordered);
    } catch {
      commit(previous);
      toast.error(t.dashboard.profileLinkOrderFailed);
    } finally { setBusy(''); }
  }

  return (
    <div className="space-y-3 md:col-span-2">
      {links.length ? (
        <div className="divide-y divide-white/[0.07] overflow-hidden rounded-xl border border-white/[0.08] bg-black/15">
          {links.map((link, index) => {
            const definition = profileLinkDefinition(link.platform);
            const Icon = definition.icon;
            const editing = editingId === link.id;
            return (
              <div key={link.id} className="p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-emerald-200"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{link.label || labels[link.platform]}</p><p className="truncate text-xs text-white/42" title={link.displayValue}>{link.displayValue || t.dashboard.profileLinkLegacyUnavailable}</p></div>
                  <span className="hidden rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase text-white/45 sm:inline-flex">{visibilityLabel(link.visibility, t.dashboard)}</span>
                  {canManage && <div className="flex shrink-0 items-center">
                    <IconButton label={t.dashboard.profileLinkMoveUp} disabled={index === 0 || Boolean(busy)} onClick={() => void move(index, -1)}><ChevronUp size={14} /></IconButton>
                    <IconButton label={t.dashboard.profileLinkMoveDown} disabled={index === links.length - 1 || Boolean(busy)} onClick={() => void move(index, 1)}><ChevronDown size={14} /></IconButton>
                    <IconButton label={t.dashboard.profileLinkEdit} disabled={Boolean(busy)} onClick={() => beginEdit(link)}><Pencil size={14} /></IconButton>
                    <IconButton label={t.dashboard.profileLinkRemove} disabled={Boolean(busy)} onClick={() => setRemovingId(link.id)}><Trash2 size={14} /></IconButton>
                  </div>}
                </div>
                {editing && <div className="mt-3 grid gap-3 border-t border-white/[0.07] pt-3 sm:grid-cols-2"><LinkFields draft={editDraft} setDraft={setEditDraft} definition={definition} labels={t.dashboard} /><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" className="bg-white/10 text-white hover:bg-white/15" onClick={() => setEditingId(null)}>{t.common.cancel}</Button><LoadingButton type="button" loading={busy === `edit:${link.id}`} onClick={() => void saveEdit()}>{t.common.saveChanges}</LoadingButton></div>{fieldError && <p className="text-xs text-rose-200 sm:col-span-2">{fieldError}</p>}</div>}
              </div>
            );
          })}
        </div>
      ) : <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/42">{t.dashboard.profileLinksEmpty}</p>}

      {canManage && <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/15">
        <div className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-semibold text-white">{t.dashboard.profileLinkAdd}</p><p className="mt-1 text-xs text-white/42">{links.length >= maxLinks ? t.dashboard.profileLinkLimitReached : t.dashboard.profileLinkAddDescription}</p></div><button type="button" disabled={links.length >= maxLinks} aria-expanded={addOpen} aria-label={t.dashboard.profileLinkToggleAdd} onClick={() => setAddOpen((current) => !current)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/55 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40 disabled:opacity-35"><ChevronDown size={16} className={cn('transition-transform', addOpen && 'rotate-180')} /></button></div>
        {addOpen && <div className="grid gap-3 border-t border-white/[0.07] p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><span className="text-xs font-semibold text-white/65">{t.dashboard.profileLinkPlatform}</span><ProfilePlatformCombobox value={draft.platform} options={availablePlatforms} labels={labels} searchLabel={t.dashboard.profileLinkSearchPlatforms} emptyLabel={t.dashboard.profileLinkNoPlatforms} onChange={(platform) => { setDraft((current) => ({ ...current, platform, label: '', identifier: '', url: '' })); setFieldError(''); }} /></div>
          <LinkFields draft={draft} setDraft={setDraft} definition={selectedDefinition} labels={t.dashboard} />
          {fieldError && <p className="text-xs text-rose-200 sm:col-span-2">{fieldError}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" className="bg-white/10 text-white hover:bg-white/15" onClick={() => { setDraft(emptyDraft); setFieldError(''); setAddOpen(false); }}>{t.common.cancel}</Button><LoadingButton type="button" loading={busy === 'create'} disabled={Boolean(busy)} onClick={() => void createLink()}><Plus size={15} />{t.dashboard.profileLinkAddAction}</LoadingButton></div>
        </div>}
      </div>}
      <ConfirmDialog open={Boolean(removingId)} title={t.dashboard.profileLinkRemove} description={t.dashboard.profileLinkRemoveConfirm} confirmLabel={t.dashboard.profileLinkRemove} cancelLabel={t.common.cancel} loading={busy.startsWith('remove:')} onConfirm={() => void removeLink()} onCancel={() => setRemovingId(null)} />
    </div>
  );
}

function LinkFields({ draft, setDraft, definition, labels }: { draft: Draft; setDraft: (draft: Draft) => void; definition: ReturnType<typeof profileLinkDefinition>; labels: DashboardLabels }) {
  const previewHref = definition.inputKind === 'IDENTIFIER' ? profileLinkPreviewHref(draft.platform, draft.identifier) : null;
  return <>
    {draft.platform === 'OTHER' && <label><span className="text-xs font-semibold text-white/65">{labels.profileLinkCustomLabel}</span><input value={draft.label} maxLength={50} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-emerald-300/40" /></label>}
    {definition.inputKind === 'IDENTIFIER' ? <label><span className="text-xs font-semibold text-white/65">{labels.profileLinkIdentifier}</span><input value={draft.identifier} maxLength={255} placeholder={definition.placeholder} autoComplete="off" onChange={(event) => setDraft({ ...draft, identifier: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-300/40" /><span className="mt-1.5 block text-[11px] leading-4 text-white/38">{labels.profileLinkIdentifierHelp(labelsForPlatform(draft.platform, labels))}</span>{previewHref && draft.platform !== 'DISCORD' && <span className="mt-1 block truncate text-[11px] text-emerald-200/55" title={previewHref}>{labels.profileLinkDestination}: {previewHref}</span>}</label> : <label><span className="text-xs font-semibold text-white/65">{labels.profileLinkUrl}</span><input type="url" value={draft.url} maxLength={2048} placeholder={definition.placeholder} onChange={(event) => setDraft({ ...draft, url: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-300/40" /></label>}
    <label><span className="text-xs font-semibold text-white/65">{labels.profileLinkVisibility}</span><AppSelect value={draft.visibility} options={[{ value: 'PUBLIC', label: labels.profileLinkPublic }, { value: 'MEMBERS', label: labels.profileLinkMembers }, { value: 'PRIVATE', label: labels.profileLinkPrivate }]} onChange={(value) => setDraft({ ...draft, visibility: value as ProfileLinkVisibility })} dense className="mt-2 w-full" /></label>
  </>;
}

function profileLinkPayload(draft: Draft, includePlatform: boolean) {
  const definition = profileLinkDefinition(draft.platform);
  return {
    ...(includePlatform ? { platform: draft.platform } : {}),
    ...(definition.inputKind === 'IDENTIFIER' ? { identifier: normalizeProfileIdentifier(draft.platform, draft.identifier) } : { url: draft.url.trim() }),
    ...(draft.platform === 'OTHER' ? { label: draft.label.trim() } : {}),
    visibility: draft.visibility,
  };
}

function validateDraft(draft: Draft, labels: DashboardLabels) {
  if (draft.platform === 'OTHER' && !draft.label.trim()) return labels.profileLinkCustomLabelRequired;
  if (profileLinkDefinition(draft.platform).inputKind === 'IDENTIFIER') {
    const value = draft.identifier.trim();
    if (!value) return labels.profileLinkIdentifierInvalid;
    if (value.includes('://') || value.includes('/') || value.includes('?') || value.includes('#')) return labels.profileLinkIdentifierOnly;
    return '';
  }
  try { const url = new URL(draft.url); return url.protocol === 'https:' && !url.username && !url.password ? '' : labels.profileLinkInvalidUrl; } catch { return labels.profileLinkInvalidUrl; }
}

function profileLinkErrorMessage(error: unknown, labels: DashboardLabels) {
  if (!(error instanceof ApiRequestError)) return labels.profileLinkSaveFailed;
  try {
    const response = JSON.parse(error.message) as { code?: string; message?: string | { code?: string } };
    const code = response.code ?? (typeof response.message === 'object' ? response.message.code : undefined);
    if (code === 'PROFILE_LINK_IDENTIFIER_REQUIRED' || code === 'PROFILE_LINK_IDENTIFIER_INVALID') return labels.profileLinkIdentifierInvalid;
    if (code === 'PROFILE_LINK_URL_NOT_ALLOWED') return labels.profileLinkIdentifierOnly;
    if (code === 'PROFILE_LINK_PLATFORM_EXISTS') return labels.profileLinkPlatformExists;
    if (code === 'PROFILE_LINK_LIMIT_REACHED') return labels.profileLinkLimitReached;
    if (code === 'PROFILE_LINK_URL_REQUIRED' || code === 'PROFILE_LINK_URL_INVALID' || code === 'PROFILE_LINK_IDENTIFIER_NOT_ALLOWED') return labels.profileLinkInvalidUrl;
  } catch {
    return labels.profileLinkSaveFailed;
  }
  return labels.profileLinkSaveFailed;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-full text-white/38 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/35 disabled:cursor-not-allowed disabled:opacity-25">{children}</button>;
}

function visibilityLabel(value: ProfileLinkVisibility, labels: DashboardLabels) { return value === 'PUBLIC' ? labels.profileLinkPublic : value === 'MEMBERS' ? labels.profileLinkMembers : labels.profileLinkPrivate; }
function labelsForPlatform(platform: ProfileLinkPlatform, labels: DashboardLabels) { return platformLabels(labels)[platform]; }
function platformLabels(labels: DashboardLabels): Record<ProfileLinkPlatform, string> { return { WEBSITE: labels.website, LINKEDIN: labels.linkedin, X: labels.twitter, FACEBOOK: labels.profilePlatformFacebook, INSTAGRAM: labels.profilePlatformInstagram, YOUTUBE: labels.profilePlatformYouTube, TIKTOK: labels.profilePlatformTikTok, GITHUB: labels.profilePlatformGitHub, GITLAB: labels.profilePlatformGitLab, DISCORD: labels.profilePlatformDiscord, WHATSAPP: labels.profilePlatformWhatsApp, TELEGRAM: labels.profilePlatformTelegram, MASTODON: labels.profilePlatformMastodon, THREADS: labels.profilePlatformThreads, BLUESKY: labels.profilePlatformBluesky, OTHER: labels.profileLinkOther }; }
