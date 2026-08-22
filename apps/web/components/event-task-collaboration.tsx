'use client';

import { Check, CheckCircle2, ChevronDown, ChevronUp, Download, FileText, LoaderCircle, MessageSquareText, Paperclip, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, apiUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { ProfilePhoto } from './profile-photo';
import { ConfirmDialog, LoadingButton } from './ui';

type CollaborationUser = { id: string; name: string; avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null };
type EventTaskComment = { id: string; body: string; createdAt: string; updatedAt: string; author: CollaborationUser; canArchive: boolean };
type EventTaskActivity = { id: string; type: string; metadata?: Record<string, unknown> | null; createdAt: string; actor?: CollaborationUser | null };
type EventTaskAttachment = { id: string; originalName: string; mimeType: string; sizeBytes: number; createdAt: string; uploader: CollaborationUser; canRemove: boolean };
type EventTaskChecklistItem = { id: string; title: string; isCompleted: boolean; sortOrder: number; createdAt: string; updatedAt: string; completedAt?: string | null; createdBy: CollaborationUser; completedBy?: CollaborationUser | null; canEdit: boolean; canToggle: boolean; canRemove: boolean };
type CollaborationTab = 'comments' | 'activity' | 'attachments' | 'checklist';

const maxAttachmentSize = 10 * 1024 * 1024;
const allowedAttachmentTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip', 'application/x-zip-compressed']);

export function EventTaskCollaboration({ endpointBase, taskId, canComment, refreshToken = 0, initialTab = 'comments', summary }: { endpointBase: string; taskId: string; canComment: boolean; refreshToken?: number; initialTab?: CollaborationTab; summary?: ReactNode }) {
  const { lang, t } = useI18n();
  const [tab, setTab] = useState<CollaborationTab>('comments');
  const [comments, setComments] = useState<EventTaskComment[] | null>(null);
  const [activity, setActivity] = useState<EventTaskActivity[] | null>(null);
  const [attachments, setAttachments] = useState<EventTaskAttachment[] | null>(null);
  const [checklist, setChecklist] = useState<EventTaskChecklistItem[] | null>(null);
  const [canReorderChecklist, setCanReorderChecklist] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [archiveComment, setArchiveComment] = useState<EventTaskComment | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [removeAttachment, setRemoveAttachment] = useState<EventTaskAttachment | null>(null);
  const [removingAttachment, setRemovingAttachment] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFinished, setUploadFinished] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [downloadState, setDownloadState] = useState<Record<string, 'preparing' | 'complete'>>({});
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState('');
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [checklistActionId, setChecklistActionId] = useState('');
  const requestRef = useRef(0);

  useEffect(() => { setTab(initialTab); }, [initialTab, taskId]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const [commentsResponse, activityResponse, attachmentsResponse, checklistResponse] = await Promise.all([
        apiFetch<{ comments: EventTaskComment[] }>(`${endpointBase}/comments`),
        apiFetch<{ activity: EventTaskActivity[] }>(`${endpointBase}/activity`),
        apiFetch<{ attachments: EventTaskAttachment[] }>(`${endpointBase}/attachments`),
        apiFetch<{ checklist: EventTaskChecklistItem[]; canReorder: boolean }>(`${endpointBase}/checklist`),
      ]);
      if (requestId !== requestRef.current) return;
      setComments(commentsResponse.comments);
      setActivity(activityResponse.activity);
      setAttachments(attachmentsResponse.attachments);
      setChecklist(checklistResponse.checklist);
      setCanReorderChecklist(checklistResponse.canReorder);
      setLoadError('');
    } catch {
      if (requestId === requestRef.current) setLoadError(t.common.eventTaskCollaborationLoadFailed);
    }
  }, [endpointBase, t.common.eventTaskCollaborationLoadFailed]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  async function submitComment() {
    const body = commentBody.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`${endpointBase}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      setCommentBody('');
      toast.success(t.common.eventTaskCommentAdded);
      await load();
    } catch {
      toast.error(t.common.eventTaskCommentAddFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmArchive() {
    if (!archiveComment || archiving) return;
    setArchiving(true);
    try {
      await apiFetch(`${endpointBase}/comments/${archiveComment.id}`, { method: 'DELETE' });
      toast.success(t.common.eventTaskCommentArchived);
      setArchiveComment(null);
      await load();
    } catch {
      toast.error(t.common.eventTaskCommentArchiveFailed);
    } finally {
      setArchiving(false);
    }
  }

  function addSelectedFiles(files: File[]) {
    setUploadError('');
    const next = [...selectedFiles, ...files];
    if (next.length > 3 || next.some((file) => file.size <= 0 || file.size > maxAttachmentSize || !allowedAttachmentTypes.has(file.type))) {
      setUploadError(t.common.eventTaskAttachmentValidationFailed);
      return;
    }
    setSelectedFiles(next);
    setUploadFinished(false);
  }

  async function uploadAttachments() {
    if (!selectedFiles.length || uploading) return;
    setUploading(true);
    setUploadError('');
    try {
      const body = new FormData();
      selectedFiles.forEach((file) => body.append('files', file));
      await apiFetch(`${endpointBase}/attachments`, { method: 'POST', body });
      setUploadFinished(true);
      toast.success(t.common.eventTaskAttachmentUploaded);
      await load();
    } catch {
      setUploadError(t.common.eventTaskAttachmentUploadFailed);
      toast.error(t.common.eventTaskAttachmentUploadFailed);
    } finally {
      setUploading(false);
    }
  }

  async function confirmRemoveAttachment() {
    if (!removeAttachment || removingAttachment) return;
    setRemovingAttachment(true);
    try {
      await apiFetch(`${endpointBase}/attachments/${removeAttachment.id}`, { method: 'DELETE' });
      toast.success(t.common.eventTaskAttachmentRemoved);
      setRemoveAttachment(null);
      await load();
    } catch {
      toast.error(t.common.eventTaskAttachmentRemoveFailed);
    } finally {
      setRemovingAttachment(false);
    }
  }

  async function downloadAttachment(attachment: EventTaskAttachment) {
    if (downloadState[attachment.id] === 'preparing') return;
    setDownloadState((current) => ({ ...current, [attachment.id]: 'preparing' }));
    try {
      const response = await fetch(apiUrl(`${endpointBase}/attachments/${attachment.id}/download`), { credentials: 'include' });
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = attachment.originalName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setDownloadState((current) => ({ ...current, [attachment.id]: 'complete' }));
      window.setTimeout(() => setDownloadState((current) => { const next = { ...current }; delete next[attachment.id]; return next; }), 2500);
    } catch {
      setDownloadState((current) => { const next = { ...current }; delete next[attachment.id]; return next; });
      toast.error(t.common.eventTaskAttachmentDownloadFailed);
    }
  }

  async function addChecklistItem() {
    const title = newChecklistTitle.trim();
    if (!title || checklistActionId) return;
    setChecklistActionId('new');
    try {
      await apiFetch(`${endpointBase}/checklist`, { method: 'POST', body: JSON.stringify({ title }) });
      setNewChecklistTitle('');
      toast.success(t.common.checklistItemAdded);
      await load();
    } catch {
      toast.error(t.common.couldNotSaveChecklistItem);
    } finally {
      setChecklistActionId('');
    }
  }

  async function updateChecklistItem(item: EventTaskChecklistItem) {
    const title = editingChecklistTitle.trim();
    if (!title || checklistActionId) return;
    setChecklistActionId(item.id);
    try {
      await apiFetch(`${endpointBase}/checklist/${item.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      setEditingChecklistId('');
      toast.success(t.common.checklistItemUpdated);
      await load();
    } catch {
      toast.error(t.common.couldNotUpdateChecklistItem);
    } finally {
      setChecklistActionId('');
    }
  }

  async function toggleChecklistItem(item: EventTaskChecklistItem) {
    if (!item.canToggle || checklistActionId) return;
    setChecklistActionId(item.id);
    try {
      await apiFetch(`${endpointBase}/checklist/${item.id}/toggle`, { method: 'PATCH' });
      toast.success(item.isCompleted ? t.common.checklistItemReopened : t.common.checklistItemCompleted);
      await load();
    } catch {
      toast.error(t.common.couldNotUpdateChecklistItem);
    } finally {
      setChecklistActionId('');
    }
  }

  async function removeChecklistItem(item: EventTaskChecklistItem) {
    if (!item.canRemove || checklistActionId) return;
    setChecklistActionId(item.id);
    try {
      await apiFetch(`${endpointBase}/checklist/${item.id}`, { method: 'DELETE' });
      toast.success(t.common.checklistItemRemoved);
      await load();
    } catch {
      toast.error(t.common.couldNotUpdateChecklistItem);
    } finally {
      setChecklistActionId('');
    }
  }

  async function moveChecklistItem(index: number, direction: -1 | 1) {
    if (!checklist || checklistActionId) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= checklist.length) return;
    const next = [...checklist];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setChecklistActionId('reorder');
    try {
      await apiFetch(`${endpointBase}/checklist/reorder`, { method: 'PATCH', body: JSON.stringify({ itemIds: next.map((item) => item.id) }) });
      setChecklist(next);
      await load();
    } catch {
      toast.error(t.common.couldNotUpdateChecklistItem);
    } finally {
      setChecklistActionId('');
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={t.common.eventTaskCollaboration}>
      <div className="shrink-0 px-5 pb-3 sm:px-6">
        <div className="flex items-center gap-1 rounded-lg bg-black/25 p-1 ring-1 ring-white/[0.04]">
          {(['comments', 'activity', 'attachments', 'checklist'] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`min-w-0 flex-1 rounded-md px-1.5 py-2 text-[11px] font-semibold transition sm:px-2 sm:text-xs ${tab === value ? 'bg-white/[0.09] text-white shadow-sm shadow-black/20' : 'text-white/42 hover:bg-white/[0.035] hover:text-white/72'}`}>{value === 'comments' ? t.common.comments : value === 'activity' ? t.common.activity : value === 'attachments' ? t.common.attachments : t.common.checklist}</button>)}
        </div>
      </div>

      <div className="task-discussion-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 sm:px-6">
        {summary && <div className="mb-5 rounded-lg bg-white/[0.025] p-3 ring-1 ring-white/[0.05]">{summary}</div>}
        {loadError ? <div className="rounded-lg border border-rose-200/15 bg-rose-300/[0.06] p-3 text-xs text-rose-100"><p>{loadError}</p><button type="button" onClick={() => void load()} className="mt-2 font-semibold text-white underline-offset-2 hover:underline">{t.common.retry}</button></div> : tab === 'comments' ? (
        <div>
          {comments === null ? <CollaborationSkeleton /> : comments.length === 0 ? <p className="py-4 text-center text-sm text-white/38">{t.common.noEventTaskComments}</p> : (
            <div className="space-y-3">
              {comments.map((comment) => <article key={comment.id} className="rounded-lg bg-black/20 p-3.5 ring-1 ring-white/[0.055]"><div className="flex items-start gap-3"><ProfilePhoto name={comment.author.name} avatarUrl={comment.author.avatarUrl} dicebearStyle={comment.author.dicebearStyle} dicebearSeed={comment.author.dicebearSeed} size="sm" className="h-8 w-8 rounded-full text-[10px]" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-white/80">{comment.author.name}</p><p className="mt-0.5 text-[11px] text-white/35">{formatCollaborationDate(comment.createdAt, lang)}</p></div>{comment.canArchive && <button type="button" title={t.common.archiveComment} aria-label={t.common.archiveComment} onClick={() => setArchiveComment(comment)} className="grid h-7 w-7 place-items-center rounded-full text-white/30 transition hover:bg-rose-300/10 hover:text-rose-100"><Trash2 size={13} /></button>}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-white/60">{comment.body}</p></div></div></article>)}
            </div>
          )}
        </div>
      ) : tab === 'activity' ? (
        <div>
          {activity === null ? <CollaborationSkeleton /> : activity.length === 0 ? <p className="py-4 text-center text-sm text-white/38">{t.common.noEventTaskActivity}</p> : <ol className="space-y-0">{activity.map((item, index) => <li key={item.id} className="relative flex gap-3 pb-4"><div className="relative flex w-8 shrink-0 justify-center"><span className="mt-1.5 h-2 w-2 rounded-full bg-accent/70" />{index < activity.length - 1 && <span className="absolute bottom-0 top-4 w-px bg-white/[0.08]" />}</div><div className="min-w-0 flex-1"><p className="text-sm leading-5 text-white/60">{item.actor && <span className="font-semibold text-white/80">{item.actor.name} </span>}{activityMessage(item, t)}</p><p className="mt-1 text-[11px] text-white/32">{formatCollaborationDate(item.createdAt, lang)}</p></div></li>)}</ol>}
        </div>
      ) : tab === 'attachments' ? (
        <div>
          <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{t.common.attachments}</h3><p className="mt-1 text-xs leading-5 text-white/40">{t.common.eventTaskAttachmentsDescription}</p></div>{canComment && <button type="button" onClick={() => { setUploadOpen(true); setSelectedFiles([]); setUploadFinished(false); setUploadError(''); }} title={t.common.addAttachment} aria-label={t.common.addAttachment} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/20 transition hover:bg-accent/15"><Paperclip size={15} /></button>}</div>
          {attachments === null ? <CollaborationSkeleton /> : attachments.length === 0 ? <p className="py-8 text-center text-sm text-white/38">{t.common.noEventTaskAttachments}</p> : <div className="space-y-2.5">{attachments.map((attachment) => <article key={attachment.id} className="rounded-lg bg-black/20 p-3.5 ring-1 ring-white/[0.055]"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.045] text-white/45"><FileText size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white/78">{attachment.originalName}</p><p className="mt-1 text-[11px] text-white/34">{formatBytes(attachment.sizeBytes, lang)} · {attachment.uploader.name} · {formatCollaborationDate(attachment.createdAt, lang)}</p>{downloadState[attachment.id] && <div className="mt-2 flex items-center gap-2 text-[11px] text-accent/80">{downloadState[attachment.id] === 'preparing' ? <LoaderCircle className="animate-spin" size={12} /> : <CheckCircle2 size={12} />}{downloadState[attachment.id] === 'preparing' ? t.common.preparingDownload : t.common.downloadComplete}</div>}</div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => void downloadAttachment(attachment)} title={t.common.downloadFile} aria-label={t.common.downloadFile} className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:bg-white/[0.07] hover:text-white"><Download size={14} /></button>{attachment.canRemove && <button type="button" onClick={() => setRemoveAttachment(attachment)} title={t.common.removeAttachment} aria-label={t.common.removeAttachment} className="grid h-8 w-8 place-items-center rounded-full text-rose-200/45 hover:bg-rose-300/10 hover:text-rose-100"><Trash2 size={14} /></button>}</div></div></article>)}</div>}
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">{t.common.checklistItems}</h3>{checklist && checklist.length > 0 && <p className="mt-1 text-xs leading-5 text-white/40">{t.common.checklistProgress(checklist.filter((item) => item.isCompleted).length, checklist.length)}</p>}</div>{checklist && checklist.length > 0 && <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">{checklist.filter((item) => item.isCompleted).length}/{checklist.length}</span>}</div>
          {checklist === null ? <CollaborationSkeleton /> : checklist.length === 0 ? <div className="py-8 text-center"><p className="text-sm text-white/42">{t.common.noChecklistItems}</p></div> : <div className="space-y-2">{checklist.map((item, index) => <div key={item.id} className="group flex items-start gap-2 rounded-lg bg-black/20 p-3 ring-1 ring-white/[0.055]"><button type="button" disabled={!item.canToggle || Boolean(checklistActionId)} onClick={() => void toggleChecklistItem(item)} aria-label={item.isCompleted ? t.common.checklistItemReopened : t.common.checklistItemCompleted} className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition ${item.isCompleted ? 'border-accent/50 bg-accent text-emerald-950' : 'border-white/20 text-transparent hover:border-accent/50'} disabled:cursor-not-allowed disabled:opacity-50`}><Check size={13} strokeWidth={3} /></button><div className="min-w-0 flex-1">{editingChecklistId === item.id ? <div className="flex gap-2"><input autoFocus value={editingChecklistTitle} maxLength={200} onChange={(event) => setEditingChecklistTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void updateChecklistItem(item); if (event.key === 'Escape') setEditingChecklistId(''); }} className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-sm text-white outline-none focus:border-accent/45" /><button type="button" onClick={() => void updateChecklistItem(item)} className="text-xs font-semibold text-accent">{t.common.save}</button></div> : <p className={`break-words text-sm leading-5 ${item.isCompleted ? 'text-white/36 line-through' : 'text-white/70'}`}>{item.title}</p>}<p className="mt-1 text-[10px] text-white/28">{item.createdBy.name}</p></div><div className="flex shrink-0 items-center gap-0.5">{canReorderChecklist && <><button type="button" disabled={index === 0 || Boolean(checklistActionId)} onClick={() => void moveChecklistItem(index, -1)} title={t.common.moveChecklistItemUp} aria-label={t.common.moveChecklistItemUp} className="grid h-7 w-7 place-items-center rounded-full text-white/28 hover:bg-white/[0.06] hover:text-white disabled:opacity-20"><ChevronUp size={13} /></button><button type="button" disabled={index === checklist.length - 1 || Boolean(checklistActionId)} onClick={() => void moveChecklistItem(index, 1)} title={t.common.moveChecklistItemDown} aria-label={t.common.moveChecklistItemDown} className="grid h-7 w-7 place-items-center rounded-full text-white/28 hover:bg-white/[0.06] hover:text-white disabled:opacity-20"><ChevronDown size={13} /></button></>}{item.canEdit && <button type="button" onClick={() => { setEditingChecklistId(item.id); setEditingChecklistTitle(item.title); }} title={t.common.edit} aria-label={t.common.edit} className="grid h-7 w-7 place-items-center rounded-full text-white/28 hover:bg-white/[0.06] hover:text-white"><Pencil size={12} /></button>}{item.canRemove && <button type="button" disabled={Boolean(checklistActionId)} onClick={() => void removeChecklistItem(item)} title={t.common.remove} aria-label={t.common.remove} className="grid h-7 w-7 place-items-center rounded-full text-rose-200/35 hover:bg-rose-300/10 hover:text-rose-100"><Trash2 size={12} /></button>}</div></div>)}</div>}
          {canComment && <div className="mt-4 flex gap-2"><input value={newChecklistTitle} maxLength={200} onChange={(event) => setNewChecklistTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addChecklistItem(); }} placeholder={t.common.newChecklistItem} className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none placeholder:text-white/28 focus:border-accent/45" /><button type="button" disabled={!newChecklistTitle.trim() || Boolean(checklistActionId)} onClick={() => void addChecklistItem()} title={t.common.addChecklistItem} aria-label={t.common.addChecklistItem} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-emerald-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"><Plus size={16} /></button></div>}
        </div>
      )}
      </div>

      {tab === 'comments' && canComment && <footer className="shrink-0 border-t border-white/[0.055] bg-[#07120e]/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6"><textarea value={commentBody} maxLength={1000} rows={3} onChange={(event) => setCommentBody(event.target.value)} placeholder={t.common.addEventTaskCommentPlaceholder} className="min-h-[96px] max-h-[160px] w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none placeholder:text-white/28 focus:border-accent/45" /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] tabular-nums text-white/30">{commentBody.length}/1000</span><LoadingButton loading={submitting} loadingLabel={t.common.addingComment} disabled={!commentBody.trim() || submitting} onClick={submitComment} className="h-9 px-4 text-xs"><MessageSquareText size={14} />{t.common.addComment}</LoadingButton></div></footer>}

      <ConfirmDialog open={Boolean(archiveComment)} title={t.common.archiveComment} description={t.common.archiveCommentDescription} confirmLabel={t.common.archiveComment} cancelLabel={t.common.cancel} loading={archiving} onConfirm={confirmArchive} onCancel={() => setArchiveComment(null)} />
      <ConfirmDialog open={Boolean(removeAttachment)} title={t.common.removeAttachment} description={t.common.removeAttachmentDescription} confirmLabel={t.common.removeAttachment} cancelLabel={t.common.cancel} loading={removingAttachment} onConfirm={confirmRemoveAttachment} onCancel={() => setRemoveAttachment(null)} />
      {uploadOpen && <div className="fixed inset-0 z-[140] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#08120e] p-5 shadow-2xl shadow-black/50"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-semibold text-white">{t.common.attachFiles}</h3><p className="mt-1 text-xs leading-5 text-white/42">{t.common.supportedAttachmentTypes}</p></div><button type="button" disabled={uploading} onClick={() => setUploadOpen(false)} aria-label={t.common.close} className="grid h-8 w-8 place-items-center rounded-full text-white/45 hover:bg-white/[0.07] hover:text-white"><X size={15} /></button></div><label onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('border-accent/50'); }} onDragLeave={(event) => event.currentTarget.classList.remove('border-accent/50')} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('border-accent/50'); addSelectedFiles(Array.from(event.dataTransfer.files)); }} className="mt-5 grid cursor-pointer place-items-center rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-8 text-center transition hover:border-accent/35"><Upload className="text-accent/75" size={22} /><span className="mt-3 text-sm text-white/60">{t.common.dropOrBrowseAttachments}</span><input type="file" multiple accept={Array.from(allowedAttachmentTypes).join(',')} className="sr-only" onChange={(event) => addSelectedFiles(Array.from(event.target.files ?? []))} /></label>{uploadError && <p className="mt-3 text-sm text-rose-200">{uploadError}</p>}<div className="mt-4 space-y-2">{selectedFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 rounded-lg bg-white/[0.035] p-3"><FileText className="shrink-0 text-white/40" size={15} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white/70">{file.name}</p><p className="mt-1 text-[11px] text-white/32">{formatBytes(file.size, lang)}</p></div>{uploading ? <LoaderCircle className="animate-spin text-accent" size={14} /> : uploadFinished ? <CheckCircle2 className="text-accent" size={14} /> : <button type="button" onClick={() => setSelectedFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={t.common.removeAttachment} className="text-white/35 hover:text-white"><X size={14} /></button>}</div>)}</div>{uploading && <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full w-1/2 animate-pulse rounded-full bg-accent" /></div>}<div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-white/35">{uploadFinished ? t.common.finished : uploading ? t.common.uploading : `${selectedFiles.length}/3`}</span><LoadingButton loading={uploading} loadingLabel={t.common.uploading} disabled={!selectedFiles.length || uploading || uploadFinished} onClick={uploadAttachments}>{t.common.uploadFiles}</LoadingButton></div></div></div>}
    </section>
  );
}

function CollaborationSkeleton() {
  return <div className="space-y-2 py-2"><div className="h-16 animate-pulse rounded-lg bg-white/[0.05]" /><div className="h-16 animate-pulse rounded-lg bg-white/[0.04]" /></div>;
}

function activityMessage(item: EventTaskActivity, t: ReturnType<typeof useI18n>['t']) {
  const from = stringMetadata(item.metadata, 'from');
  const to = stringMetadata(item.metadata, 'to');
  if (item.type === 'CREATED') return t.common.activityTaskCreated;
  if (item.type === 'ASSIGNED') return t.common.activityTaskAssigned;
  if (item.type === 'REASSIGNED') return t.common.activityTaskReassigned;
  if (item.type === 'UNASSIGNED') return t.common.activityTaskUnassigned;
  if (item.type === 'STATUS_CHANGED' && item.metadata?.automation === true) return t.admin.automationMovedTask;
  if (item.type === 'STATUS_CHANGED') return t.common.activityStatusChanged(eventTaskStatusLabel(from, t), eventTaskStatusLabel(to, t));
  if (item.type === 'PRIORITY_CHANGED') return t.common.activityPriorityChanged(eventTaskPriorityLabel(from, t), eventTaskPriorityLabel(to, t));
  if (item.type === 'DUE_DATE_CHANGED') return t.common.activityDueDateChanged;
  if (item.type === 'TITLE_CHANGED') return t.common.activityTitleChanged;
  if (item.type === 'DESCRIPTION_CHANGED') return t.common.activityDescriptionChanged;
  if (item.type === 'LABEL_CHANGED') return t.common.activityLabelChanged;
  if (item.type === 'COMMENT_ADDED') return t.common.activityCommentAdded;
  if (item.type === 'COMMENT_ARCHIVED') return t.common.activityCommentArchived;
  if (item.type === 'ATTACHMENT_ADDED') {
    const count = numberMetadata(item.metadata, 'count');
    return count > 1 ? t.common.activityAttachmentsAdded(count) : t.common.activityAttachmentAdded;
  }
  if (item.type === 'ATTACHMENT_ARCHIVED') return t.common.activityAttachmentArchived;
  if (item.type === 'CHECKLIST_ITEM_ADDED') return t.common.activityChecklistItemAdded;
  if (item.type === 'CHECKLIST_ITEM_UPDATED') return t.common.activityChecklistItemUpdated;
  if (item.type === 'CHECKLIST_ITEM_COMPLETED') return t.common.activityChecklistItemCompleted;
  if (item.type === 'CHECKLIST_ITEM_REOPENED') return t.common.activityChecklistItemReopened;
  if (item.type === 'CHECKLIST_ITEM_ARCHIVED') return t.common.activityChecklistItemArchived;
  if (item.type === 'CHECKLIST_REORDERED') return t.common.activityChecklistReordered;
  if (item.type === 'ARCHIVED') return t.common.activityTaskArchived;
  return t.common.activityTasksReordered;
}

function stringMetadata(metadata: Record<string, unknown> | null | undefined, key: string) {
  return typeof metadata?.[key] === 'string' ? metadata[key] as string : '';
}

function numberMetadata(metadata: Record<string, unknown> | null | undefined, key: string) {
  return typeof metadata?.[key] === 'number' ? metadata[key] as number : 0;
}

function eventTaskStatusLabel(value: string, t: ReturnType<typeof useI18n>['t']) {
  if (value === 'TODO') return t.dashboard.eventTaskTodo;
  if (value === 'IN_PROGRESS') return t.dashboard.eventTaskInProgress;
  if (value === 'DONE') return t.dashboard.eventTaskDone;
  return value;
}

function eventTaskPriorityLabel(value: string, t: ReturnType<typeof useI18n>['t']) {
  if (value === 'LOW') return t.dashboard.eventTaskLow;
  if (value === 'MEDIUM') return t.dashboard.eventTaskMedium;
  if (value === 'HIGH') return t.dashboard.eventTaskHigh;
  return value;
}

function formatCollaborationDate(value: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(value: number, lang: string) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 1 }).format(value / 1024)} KB`;
  return `${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 1 }).format(value / (1024 * 1024))} MB`;
}
