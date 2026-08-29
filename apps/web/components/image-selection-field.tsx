'use client';

import { ImageIcon, ImagePlus, Link2, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Spinner } from './ui';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export type ImageSelection = {
  mode: 'NONE' | 'UPLOAD' | 'EXTERNAL';
  file: File | null;
  url: string;
  changed: boolean;
};

export type ImageSelectionFieldPhase = 'EMPTY' | 'UPLOAD_SELECTING' | 'URL_ENTERING' | 'IMAGE_SELECTED';

export type ImageSelectionFieldWorkflow = {
  phase: ImageSelectionFieldPhase;
  replacing: boolean;
};

export type ImageSelectionFieldAction = 'START_UPLOAD' | 'START_URL' | 'START_REPLACE' | 'CANCEL' | 'SELECT' | 'REMOVE';

export const imageSelectionAccept = 'image/jpeg,image/png,image/webp';
export const imageSelectionMaxBytes = 5 * 1024 * 1024;

type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function detectImageMime(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export async function normalizeImageFile(file: File, fallbackBasename = 'image-selection') {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const detectedMime = detectImageMime(bytes);
  if (!detectedMime) return null;
  if (file.type === detectedMime || (file.type === 'image/jpg' && detectedMime === 'image/jpeg')) return file;
  const extension = detectedMime === 'image/jpeg' ? '.jpg' : detectedMime === 'image/png' ? '.png' : '.webp';
  const basename = file.name.replace(/\.[^.]+$/, '') || fallbackBasename;
  return new File([file], `${basename}${extension}`, { type: detectedMime, lastModified: file.lastModified });
}

export function initialImageSelection(imageUrl?: string | null, imageSource?: 'UPLOAD' | 'EXTERNAL' | null): ImageSelection {
  return {
    mode: imageSource === 'EXTERNAL' ? 'EXTERNAL' : imageSource === 'UPLOAD' ? 'UPLOAD' : 'NONE',
    file: null,
    url: imageUrl ?? '',
    changed: false,
  };
}

export function validImageUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function hasSelectedImage(value: ImageSelection) {
  if (value.mode === 'UPLOAD') return Boolean(value.file || value.url);
  return value.mode === 'EXTERNAL' && validImageUrl(value.url);
}

export function initialImageSelectionFieldWorkflow(value: ImageSelection): ImageSelectionFieldWorkflow {
  return { phase: hasSelectedImage(value) ? 'IMAGE_SELECTED' : 'EMPTY', replacing: false };
}

export function transitionImageSelectionField(
  workflow: ImageSelectionFieldWorkflow,
  action: ImageSelectionFieldAction,
  hasSelectedImage: boolean,
): ImageSelectionFieldWorkflow {
  if (action === 'START_UPLOAD') return { phase: 'UPLOAD_SELECTING', replacing: false };
  if (action === 'START_URL') return { phase: 'URL_ENTERING', replacing: false };
  if (action === 'START_REPLACE') return { phase: 'IMAGE_SELECTED', replacing: true };
  if (action === 'SELECT') return { phase: 'IMAGE_SELECTED', replacing: false };
  if (action === 'REMOVE') return { phase: 'EMPTY', replacing: false };
  return { phase: hasSelectedImage ? 'IMAGE_SELECTED' : 'EMPTY', replacing: false };
}

export function imageSelectionValidation(value: ImageSelection, labels: { fileRequired: string; invalidUrl: string }) {
  if (value.mode === 'UPLOAD' && value.changed && !value.file) return labels.fileRequired;
  if (value.mode === 'EXTERNAL' && (!value.url.trim() || !validImageUrl(value.url))) return labels.invalidUrl;
  return null;
}

export type ImageSelectionFieldLabels = {
  title: string;
  optional: string;
  description: string;
  noImage: string;
  emptyDescription: string;
  upload: string;
  useUrl: string;
  url: string;
  chooseFile: string;
  replace: string;
  remove: string;
  preview: string;
  apply: string;
  cancel: string;
  supportedFiles: string;
  loadFailed: string;
  saving: string;
  invalidType: string;
  tooLarge: string;
  invalidUrl: string;
};

export function ImageSelectionField({ value, onChange, labels, className, disabled = false, loading = false, errorMessage = '', urlPlaceholder = 'https://example.com/image.jpg', fallbackBasename = 'image-selection' }: {
  value: ImageSelection;
  onChange: (value: ImageSelection) => void;
  labels: ImageSelectionFieldLabels;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  errorMessage?: string;
  urlPlaceholder?: string;
  fallbackBasename?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [workflow, setWorkflow] = useState(() => initialImageSelectionFieldWorkflow(value));
  const [urlDraft, setUrlDraft] = useState('');
  const [objectUrl, setObjectUrl] = useState('');
  const [error, setError] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [checkingFile, setCheckingFile] = useState(false);
  const selected = hasSelectedImage(value);

  useEffect(() => {
    if (!value.file) {
      setObjectUrl('');
      return;
    }
    const next = URL.createObjectURL(value.file);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [value.file]);

  useEffect(() => {
    setPreviewFailed(false);
    setWorkflow((current) => {
      if (selected && current.phase === 'EMPTY') return initialImageSelectionFieldWorkflow(value);
      if (!selected && current.phase === 'IMAGE_SELECTED') return initialImageSelectionFieldWorkflow(value);
      return current;
    });
  }, [selected, value.file, value.mode, value.url]);

  const externalPreview = value.mode === 'EXTERNAL' && validImageUrl(value.url) ? value.url.trim() : '';
  const previewUrl = value.mode === 'UPLOAD' ? (objectUrl || (!value.changed ? value.url : '')) : externalPreview;
  const controlsDisabled = disabled || loading || checkingFile;

  function move(action: ImageSelectionFieldAction) {
    setError('');
    setWorkflow((current) => transitionImageSelectionField(current, action, selected));
  }

  function startUrl() {
    setUrlDraft(value.mode === 'EXTERNAL' ? value.url : '');
    move('START_URL');
  }

  function cancelSelection() {
    setUrlDraft('');
    if (inputRef.current) inputRef.current.value = '';
    move('CANCEL');
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    if (file.size > imageSelectionMaxBytes) {
      setError(labels.tooLarge);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setCheckingFile(true);
    try {
      const normalizedFile = await normalizeImageFile(file, fallbackBasename);
      if (!normalizedFile) {
        setError(labels.invalidType);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      setError('');
      setPreviewFailed(false);
      onChange({ mode: 'UPLOAD', file: normalizedFile, url: '', changed: true });
      move('SELECT');
    } catch {
      setError(labels.invalidType);
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setCheckingFile(false);
    }
  }

  function applyUrl() {
    const nextUrl = urlDraft.trim();
    if (!validImageUrl(nextUrl)) {
      setError(labels.invalidUrl);
      return;
    }
    setError('');
    setPreviewFailed(false);
    onChange({ mode: 'EXTERNAL', file: null, url: nextUrl, changed: true });
    move('SELECT');
  }

  function removeImage() {
    setUrlDraft('');
    setPreviewFailed(false);
    onChange({ mode: 'NONE', file: null, url: '', changed: true });
    move('REMOVE');
  }

  const actionClassName = 'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-xs font-semibold text-[var(--app-control-foreground)] transition hover:border-[rgb(var(--app-accent-rgb)/0.35)] hover:bg-[var(--app-panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent-rgb)/0.35)] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <fieldset disabled={controlsDisabled} aria-busy={loading} className={cn('md:col-span-2', className)}>
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <legend className="text-sm font-semibold text-[var(--app-foreground)]">{labels.title}</legend>
          <p className="mt-1 text-xs leading-5 text-[var(--app-muted-foreground)]">{labels.description}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-[var(--app-muted-foreground)]">{labels.optional}</span>
      </div>

      {workflow.phase === 'EMPTY' && (
        <div className="flex min-h-32 flex-col justify-center gap-4 rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-muted)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-accent)]"><ImageIcon size={18} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--app-foreground)]">{labels.noImage}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--app-muted-foreground)]">{labels.emptyDescription}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={() => move('START_UPLOAD')} className={actionClassName}><Upload size={15} aria-hidden="true" />{labels.upload}</button>
            <button type="button" onClick={startUrl} className={actionClassName}><Link2 size={15} aria-hidden="true" />{labels.useUrl}</button>
          </div>
        </div>
      )}

      {workflow.phase === 'IMAGE_SELECTED' && !workflow.replacing && (
        <SelectedImagePreview previewUrl={previewUrl} previewFailed={previewFailed} labels={labels} actionClassName={actionClassName} onPreviewFailed={() => setPreviewFailed(true)} onReplace={() => move('START_REPLACE')} onRemove={removeImage} />
      )}

      {workflow.phase === 'IMAGE_SELECTED' && workflow.replacing && (
        <div className="grid overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] sm:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
          <CurrentImageSummary previewUrl={previewUrl} previewFailed={previewFailed} labels={labels} onPreviewFailed={() => setPreviewFailed(true)} />
          <div className="flex flex-col justify-center gap-3 border-t border-[var(--app-border)] p-4 sm:border-l sm:border-t-0">
            <p className="text-sm font-semibold text-[var(--app-foreground)]">{labels.replace}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => move('START_UPLOAD')} className={actionClassName}><Upload size={15} aria-hidden="true" />{labels.upload}</button>
              <button type="button" onClick={startUrl} className={actionClassName}><Link2 size={15} aria-hidden="true" />{labels.useUrl}</button>
              <button type="button" onClick={cancelSelection} className={cn(actionClassName, 'border-transparent bg-transparent')}>{labels.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {workflow.phase === 'UPLOAD_SELECTING' && (
        <div className="grid overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] sm:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
          <CurrentImageSummary previewUrl={previewUrl} previewFailed={previewFailed} labels={labels} onPreviewFailed={() => setPreviewFailed(true)} />
          <div className="flex flex-col justify-center gap-3 border-t border-[var(--app-border)] p-4 sm:border-l sm:border-t-0">
            <div><p className="text-sm font-semibold text-[var(--app-foreground)]">{labels.upload}</p><p className="mt-1 text-xs text-[var(--app-muted-foreground)]">{labels.supportedFiles}</p></div>
            <input ref={inputRef} type="file" accept={imageSelectionAccept} className="sr-only" onChange={(event) => { void chooseFile(event.target.files?.[0]); }} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className={actionClassName}>{checkingFile ? <Spinner /> : <ImagePlus size={15} aria-hidden="true" />}{labels.chooseFile}</button>
              <button type="button" onClick={cancelSelection} className={cn(actionClassName, 'border-transparent bg-transparent')}>{labels.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {workflow.phase === 'URL_ENTERING' && (
        <div className="grid overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)] sm:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
          <CurrentImageSummary previewUrl={previewUrl} previewFailed={previewFailed} labels={labels} onPreviewFailed={() => setPreviewFailed(true)} />
          <div className="flex flex-col justify-center gap-3 border-t border-[var(--app-border)] p-4 sm:border-l sm:border-t-0">
            <label>
              <span className="text-sm font-semibold text-[var(--app-foreground)]">{labels.url}</span>
              <input type="url" value={urlDraft} onChange={(event) => { setUrlDraft(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyUrl(); } }} placeholder={urlPlaceholder} aria-invalid={Boolean(error)} className="mt-2 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2.5 text-sm text-[var(--app-foreground)] outline-none transition placeholder:text-[var(--app-muted-foreground)] focus:border-[var(--app-accent)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent-rgb)/0.2)]" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={applyUrl} className={cn(actionClassName, 'border-transparent bg-[var(--app-accent)] text-[var(--app-accent-foreground)] hover:bg-[var(--app-accent-hover)]')}>{labels.apply}</button>
              <button type="button" onClick={cancelSelection} className={cn(actionClassName, 'border-transparent bg-transparent')}>{labels.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {loading && <p className="mt-2 flex items-center gap-2 text-xs text-[var(--app-muted-foreground)]"><Spinner />{labels.saving}</p>}
      {(error || errorMessage) && <p role="alert" className="app-text-danger mt-2 text-xs">{error || errorMessage}</p>}
    </fieldset>
  );
}

function CurrentImageSummary({ previewUrl, previewFailed, labels, onPreviewFailed }: { previewUrl: string; previewFailed: boolean; labels: ImageSelectionFieldLabels; onPreviewFailed: () => void }) {
  return (
    <div className="flex min-h-28 items-center gap-3 p-4">
      {previewUrl && !previewFailed ? <div className="aspect-video w-28 shrink-0 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]"><img src={previewUrl} alt="" decoding="async" referrerPolicy="no-referrer" onError={onPreviewFailed} className="h-full w-full object-cover" /></div> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-muted-foreground)]"><ImageIcon size={18} aria-hidden="true" /></span>}
      <div className="min-w-0"><p className="text-sm font-semibold text-[var(--app-foreground)]">{previewUrl ? labels.preview : labels.noImage}</p><p className="mt-1 text-xs leading-5 text-[var(--app-muted-foreground)]">{previewFailed ? labels.loadFailed : previewUrl ? labels.replace : labels.emptyDescription}</p></div>
    </div>
  );
}

function SelectedImagePreview({ previewUrl, previewFailed, labels, actionClassName, onPreviewFailed, onReplace, onRemove }: { previewUrl: string; previewFailed: boolean; labels: ImageSelectionFieldLabels; actionClassName: string; onPreviewFailed: () => void; onReplace: () => void; onRemove: () => void }) {
  return (
    <div className="relative aspect-[16/9] w-full max-w-2xl rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-muted)]">
      <div className="absolute inset-0 overflow-hidden rounded-xl">
        {previewUrl && !previewFailed ? <img src={previewUrl} alt={labels.preview} decoding="async" referrerPolicy="no-referrer" onError={onPreviewFailed} className="h-full w-full object-cover" /> : <div className="grid h-full min-h-40 place-items-center px-5 text-center"><div><ImageIcon className="mx-auto text-[var(--app-muted-foreground)]" size={26} aria-hidden="true" /><p className="mt-3 text-sm font-semibold text-[var(--app-foreground)]">{labels.loadFailed}</p></div></div>}
      </div>
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-dialog)] p-1.5 text-[var(--app-control-foreground)] shadow-xl shadow-black/30">
        <button type="button" onClick={onReplace} className={cn(actionClassName, 'border-transparent bg-[var(--app-panel-muted)] text-[var(--app-control-foreground)] hover:bg-[var(--app-panel)]')}>{labels.replace}</button>
        <Tooltip><TooltipTrigger asChild><button type="button" onClick={onRemove} aria-label={labels.remove} className="app-text-danger grid h-9 w-9 cursor-pointer place-items-center rounded-lg transition hover:bg-[var(--app-panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/35 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={16} aria-hidden="true" /></button></TooltipTrigger><TooltipContent className="z-[60]">{labels.remove}</TooltipContent></Tooltip>
      </div>
    </div>
  );
}
