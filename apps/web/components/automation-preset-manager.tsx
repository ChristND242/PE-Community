'use client';

import {
  Archive,
  ArrowLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Play,
  Search,
  SlidersHorizontal,
  UserRound,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from './app-select';
import {
  ConfirmDialog,
  LoadingButton,
  TableEmptyState,
  TableErrorState,
  TableSkeleton,
} from './ui';
import { apiFetch, COMMUNITY_ID } from '../lib/api';
import { TaskBoardMasterDetailWorkspace } from './task-board-master-detail-workspace';
import {
  automationValidationMessage,
  type AutomationValidationItem,
} from '../lib/automation-validation';
import { useI18n } from '../lib/i18n';
import { formatDate } from '../lib/utils';

type RuleType =
  | 'DUE_BEFORE'
  | 'OVERDUE'
  | 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE'
  | 'FLAG_UNASSIGNED';
type PresetListItem = {
  id: string;
  name: string;
  description?: string | null;
  ruleCount: number;
  updatedAt: string;
  createdBy?: { id: string; name: string } | null;
};
type PresetDetail = PresetListItem & {
  rules: Array<{
    id: string;
    type: RuleType;
    name?: string | null;
    enabled: boolean;
    config: Record<string, unknown>;
  }>;
};
type BoardOption = {
  id: string;
  name: string;
  linkedEvent?: { title: string } | null;
};
type PreviewAction = {
  presetRuleId: string;
  type: RuleType;
  action: 'CREATE' | 'SKIP_DUPLICATE' | 'WARNING';
  validation: Array<AutomationValidationItem & { message: string }>;
  duplicateOfRuleId?: string | null;
  config: Record<string, unknown>;
};
type Preview = {
  preset: { id: string; name: string; ruleCount: number };
  actions: PreviewAction[];
  summary: {
    willCreate: number;
    willSkipDuplicates: number;
    warnings: number;
    errors: number;
  };
};
type DetailMode = 'view' | 'edit' | 'apply';

export function AutomationPresetManager({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { lang, t } = useI18n();
  const [presets, setPresets] = useState<PresetListItem[] | null>(null);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailMode, setDetailMode] = useState<DetailMode>('view');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [targetBoardId, setTargetBoardId] = useState('');
  const [applyMode, setApplyMode] = useState<'DRAFT' | 'LIVE'>('DRAFT');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMutationError, setEditMutationError] = useState('');
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [archivePreset, setArchivePreset] = useState<PresetListItem | null>(null);
  const detailRequestRef = useRef(0);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [presetResponse, boardResponse] = await Promise.all([
        apiFetch<{ items: PresetListItem[] }>(
          `/admin/${COMMUNITY_ID}/task-board-automation-presets`,
        ),
        apiFetch<{ items: BoardOption[] }>(
          `/admin/${COMMUNITY_ID}/task-boards?page=1&pageSize=100`,
        ),
      ]);
      setPresets(presetResponse.items);
      setBoards(boardResponse.items);
      setSelectedPresetId((current) => {
        if (!current || presetResponse.items.some((preset) => preset.id === current)) {
          return current;
        }
        setSelectedPreset(null);
        setDetailMode('view');
        setMobileView('list');
        return null;
      });
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredPresets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return presets ?? [];
    return (presets ?? []).filter((preset) =>
      [preset.name, preset.description ?? '', preset.createdBy?.name ?? ''].some(
        (value) => value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [presets, query]);

  const editDirty = Boolean(
    detailMode === 'edit' &&
      selectedPreset &&
      (editForm.name !== selectedPreset.name ||
        editForm.description !== (selectedPreset.description ?? '')),
  );
  const editNameError = !editForm.name.trim()
    ? t.admin.automationPresetNameRequired
    : editForm.name.trim().length > 120
      ? t.admin.automationPresetNameTooLong
      : '';
  const editDescriptionError =
    editForm.description.trim().length > 500
      ? t.admin.automationPresetDescriptionTooLong
      : '';
  const editValid = !editNameError && !editDescriptionError;

  useEffect(() => {
    onDirtyChange?.(editDirty);
    return () => onDirtyChange?.(false);
  }, [editDirty, onDirtyChange]);

  useEffect(() => {
    if (!editDirty) return undefined;
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [editDirty]);

  async function selectPreset(presetId: string, showMobileDetail = true) {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedPresetId(presetId);
    setSelectedPreset(null);
    setDetailMode('view');
    setDetailError(false);
    setEditMutationError('');
    setDetailLoading(true);
    if (showMobileDetail) setMobileView('detail');
    try {
      const detail = await apiFetch<PresetDetail>(
        `/admin/${COMMUNITY_ID}/task-board-automation-presets/${presetId}`,
      );
      if (detailRequestRef.current !== requestId) return;
      setSelectedPreset(detail);
      setEditForm({ name: detail.name, description: detail.description ?? '' });
    } catch {
      if (detailRequestRef.current !== requestId) return;
      setDetailError(true);
      toast.error(t.admin.automationPresetDetailLoadFailed);
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }

  function requestDiscard(action: () => void) {
    if (editDirty) {
      setDiscardAction(() => action);
      return;
    }
    action();
  }

  function handleSelectPreset(presetId: string) {
    requestDiscard(() => void selectPreset(presetId));
  }

  function openEdit() {
    if (!selectedPreset) return;
    setEditForm({
      name: selectedPreset.name,
      description: selectedPreset.description ?? '',
    });
    setEditMutationError('');
    setDetailMode('edit');
  }

  function openApply() {
    if (!selectedPreset) return;
    setTargetBoardId(boards[0]?.id ?? '');
    setApplyMode('DRAFT');
    setPreview(null);
    setDetailMode('apply');
  }

  function resetToView() {
    if (selectedPreset) {
      setEditForm({
        name: selectedPreset.name,
        description: selectedPreset.description ?? '',
      });
    }
    if (saving || previewing) return;
    setDetailMode('view');
    setEditMutationError('');
    setPreview(null);
    setTargetBoardId('');
    setApplyMode('DRAFT');
  }

  function closeWorkflow() {
    requestDiscard(resetToView);
  }

  async function saveEdit() {
    if (!selectedPreset || saving || !editDirty || !editValid) return;
    setEditMutationError('');
    setSaving(true);
    try {
      await apiFetch(
        `/admin/${COMMUNITY_ID}/task-board-automation-presets/${selectedPreset.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: editForm.name,
            description: editForm.description || null,
          }),
        },
      );
      toast.success(t.admin.automationPresetUpdated);
      setDetailMode('view');
      await load();
      await selectPreset(selectedPreset.id, false);
    } catch {
      setEditMutationError(t.admin.automationPresetSaveValidationFailed);
      toast.error(t.admin.automationPresetUpdateFailed);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function loadPreview() {
    if (!selectedPreset || !targetBoardId || previewing) return;
    setPreviewing(true);
    try {
      setPreview(
        await apiFetch<Preview>(
          `/admin/${COMMUNITY_ID}/task-boards/${targetBoardId}/automation-presets/${selectedPreset.id}/preview`,
          { method: 'POST' },
        ),
      );
    } catch {
      setPreview(null);
      toast.error(t.admin.automationPresetApplyFailed);
    } finally {
      setPreviewing(false);
    }
  }

  async function applyPreset() {
    if (
      !selectedPreset ||
      !targetBoardId ||
      !preview ||
      preview.summary.errors > 0 ||
      saving
    ) {
      return;
    }
    setSaving(true);
    try {
      await apiFetch(
        `/admin/${COMMUNITY_ID}/task-boards/${targetBoardId}/automation-presets/${selectedPreset.id}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({
            duplicateStrategy: 'SKIP_DUPLICATES',
            applyMode,
          }),
        },
      );
      toast.success(t.admin.automationPresetApplied);
      setDetailMode('view');
      setPreview(null);
    } catch {
      toast.error(t.admin.automationPresetApplyFailed);
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!archivePreset || saving) return;
    const archivedId = archivePreset.id;
    const remainingPresets = (presets ?? []).filter((preset) => preset.id !== archivedId);
    setSaving(true);
    try {
      await apiFetch(
        `/admin/${COMMUNITY_ID}/task-board-automation-presets/${archivedId}`,
        { method: 'DELETE' },
      );
      toast.success(t.admin.automationPresetArchived);
      setArchivePreset(null);
      await load();
      if (selectedPresetId === archivedId) {
        const nextPreset = remainingPresets[0];
        if (nextPreset) {
          await selectPreset(nextPreset.id, false);
        } else {
          detailRequestRef.current += 1;
          setSelectedPresetId(null);
          setSelectedPreset(null);
          setDetailMode('view');
          setMobileView('list');
        }
      }
    } catch {
      toast.error(t.admin.automationPresetArchiveFailed);
    } finally {
      setSaving(false);
    }
  }

  function renderListPane(mobile: boolean) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-white/[0.08] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">
                {t.admin.automationPresets}
              </h2>
              <p className="mt-1 text-sm leading-6 text-white/48">
                {t.admin.automationPresetsDescription}
              </p>
            </div>
            <SlidersHorizontal className="shrink-0 text-accent/70" size={18} />
          </div>
          <label className="relative mt-4 block">
            <span className="sr-only">{t.admin.searchAutomationPresets}</span>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.admin.searchAutomationPresets}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/50"
            />
          </label>
        </header>

        <div className="chat-scrollbar min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <div className="p-4">
              <TableErrorState
                title={t.admin.automationPresetsLoadFailed}
                retryLabel={t.common.retry}
                onRetry={load}
              />
            </div>
          ) : !presets ? (
            <div className="p-4">
              <TableSkeleton rows={5} columns={4} />
            </div>
          ) : filteredPresets.length === 0 ? (
            <div className="p-5">
              <TableEmptyState
                title={query.trim() ? t.admin.noMatchingAutomationPresets : t.admin.noAutomationPresets}
                description={query.trim() ? undefined : t.admin.noAutomationPresetsDescription}
              />
            </div>
          ) : mobile ? (
            <div className="divide-y divide-white/[0.07]">
              {filteredPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`flex w-full items-start gap-3 px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                    selectedPresetId === preset.id
                      ? 'bg-accent/[0.09]'
                      : 'hover:bg-white/[0.035]'
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/15 bg-accent/[0.07] text-accent/80">
                    <Workflow size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white/82">
                      {preset.name}
                    </span>
                    {preset.description && (
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-white/40">
                        {preset.description}
                      </span>
                    )}
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/35">
                      <span>{t.admin.automationRuleCount(preset.ruleCount)}</span>
                      <span>{formatDate(preset.updatedAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
                    </span>
                  </span>
                  <ChevronRight size={15} aria-hidden="true" className="mt-2 shrink-0 text-white/30" />
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#09130f] text-[10px] uppercase tracking-[0.1em] text-white/38">
                <tr>
                  <th className="px-4 py-3">{t.admin.automationPresetColumn}</th>
                  <th className="px-3 py-3">{t.admin.automationRules}</th>
                  <th className="px-3 py-3">{t.admin.updated}</th>
                  <th className="px-3 py-3">{t.admin.createdBy}</th>
                  <th className="w-10 px-3 py-3">
                    <span className="sr-only">{t.common.details}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {filteredPresets.map((preset) => {
                  const selected = selectedPresetId === preset.id;
                  return (
                    <tr
                      key={preset.id}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => handleSelectPreset(preset.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectPreset(preset.id);
                        }
                      }}
                      className={`cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                        selected
                          ? 'bg-accent/[0.09] hover:bg-accent/[0.11]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="max-w-[260px] px-4 py-4">
                        <p className="truncate font-semibold text-white/82">{preset.name}</p>
                        {preset.description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/38">
                            {preset.description}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/15 bg-accent/[0.07] px-2.5 py-1 text-xs font-semibold text-accent/85">
                          <Workflow size={12} aria-hidden="true" />
                          {preset.ruleCount}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-xs text-white/42">
                        {formatDate(preset.updatedAt, lang === 'fr' ? 'fr-FR' : 'en-US')}
                      </td>
                      <td className="max-w-36 px-3 py-4 text-xs text-white/42">
                        <span className="block truncate">{preset.createdBy?.name ?? '—'}</span>
                      </td>
                      <td className="px-3 py-4">
                        <ChevronRight size={15} aria-hidden="true" className="text-white/28" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  function renderDetailPane(mobile: boolean) {
    const summary = selectedPreset ?? presets?.find((preset) => preset.id === selectedPresetId) ?? null;
    const editFormId = selectedPreset
      ? `automation-preset-edit-${selectedPreset.id}-${mobile ? 'mobile' : 'desktop'}`
      : undefined;
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-black/10">
        <header className="flex shrink-0 items-start gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-5">
          {mobile && (
            <button
              type="button"
              onClick={() =>
                detailMode === 'view'
                  ? setMobileView('list')
                  : requestDiscard(resetToView)
              }
              aria-label={
                detailMode === 'view' ? t.admin.automationPresetBack : t.common.cancel
              }
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/55 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent/65">
              {detailMode === 'edit'
                ? t.admin.editAutomationPreset
                : detailMode === 'apply'
                  ? t.admin.applyAutomationPreset
                  : t.common.details}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">
              {summary?.name ?? t.admin.selectAutomationPreset}
            </h2>
            {summary?.description && (
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/42">
                {summary.description}
              </p>
            )}
          </div>
          {summary && (
            <span className="shrink-0 rounded-full border border-accent/15 bg-accent/[0.07] px-2.5 py-1 text-xs font-semibold text-accent/80">
              {summary.ruleCount}
            </span>
          )}
        </header>

        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto">
          {!selectedPresetId ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/30">
                <Workflow size={21} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold text-white/78">
                {t.admin.selectAutomationPreset}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-white/42">
                {t.admin.selectAutomationPresetDescription}
              </p>
            </div>
          ) : detailLoading ? (
            <div className="space-y-4 p-5">
              <div className="h-24 animate-pulse rounded-xl bg-white/[0.05]" />
              <div className="h-52 animate-pulse rounded-xl bg-white/[0.05]" />
            </div>
          ) : detailError || !selectedPreset ? (
            <div className="p-5">
              <TableErrorState
                title={t.admin.automationPresetDetailLoadFailed}
                retryLabel={t.common.retry}
                onRetry={() => selectedPresetId && void selectPreset(selectedPresetId, false)}
              />
            </div>
          ) : detailMode === 'edit' ? (
            <form
              id={editFormId}
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
              className="min-w-0"
            >
              <div className="space-y-5 p-4 sm:p-5">
                {editMutationError && (
                  <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2.5 text-sm text-rose-100">
                    {editMutationError}
                  </p>
                )}
                <Field
                  label={t.admin.automationPresetName}
                  value={editForm.name}
                  onChange={(name) => setEditForm({ ...editForm, name })}
                  error={editNameError}
                />
                <label className="block">
                  <span className="text-sm text-white/65">
                    {t.admin.automationPresetDescription}
                  </span>
                  <textarea
                    rows={4}
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm({ ...editForm, description: event.target.value })
                    }
                    aria-invalid={Boolean(editDescriptionError)}
                    className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/50"
                  />
                  {editDescriptionError && (
                    <span className="mt-1 block text-xs text-rose-200" role="alert">
                      {editDescriptionError}
                    </span>
                  )}
                </label>
                <ReadOnlyRules rules={selectedPreset.rules} t={t} />
              </div>
            </form>
          ) : detailMode === 'apply' ? (
            <div className="space-y-5 p-4 sm:p-5">
              <AppSelect
                label={t.admin.selectTargetBoard}
                value={targetBoardId}
                options={boards.map((board) => ({
                  value: board.id,
                  label: board.linkedEvent?.title ?? board.name,
                }))}
                onChange={(value) => {
                  setTargetBoardId(value);
                  setPreview(null);
                }}
              />
              <div>
                <p className="text-sm text-white/65">{t.admin.automationPresetApplyMode}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(['DRAFT', 'LIVE'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setApplyMode(mode);
                        setPreview(null);
                      }}
                      className={`rounded-lg border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        applyMode === mode
                          ? 'border-accent/30 bg-accent/[0.08] text-accent'
                          : 'border-white/[0.08] bg-black/15 text-white/50 hover:border-white/15'
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {mode === 'DRAFT'
                          ? t.admin.applyAsDraftRules
                          : t.admin.applyAsLiveRules}
                      </span>
                      {mode === 'DRAFT' && (
                        <span className="mt-1 block text-xs leading-5 text-white/35">
                          {t.admin.automationDraftApplyDescription}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <LoadingButton
                  loading={previewing}
                  loadingLabel={t.common.loading}
                  disabled={!targetBoardId}
                  onClick={loadPreview}
                >
                  {t.admin.applyPreview}
                </LoadingButton>
              </div>
              {preview && <PreviewPanel preview={preview} t={t} />}
            </div>
          ) : (
            <div className="space-y-6 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailMetric
                  icon={<Clock3 size={15} aria-hidden="true" />}
                  label={t.admin.updated}
                  value={formatDate(
                    selectedPreset.updatedAt,
                    lang === 'fr' ? 'fr-FR' : 'en-US',
                  )}
                />
                {selectedPreset.createdBy && (
                  <DetailMetric
                    icon={<UserRound size={15} aria-hidden="true" />}
                    label={t.admin.createdBy}
                    value={selectedPreset.createdBy.name}
                  />
                )}
              </div>
              <ReadOnlyRules rules={selectedPreset.rules} t={t} />
            </div>
          )}
        </div>

        {selectedPreset && !detailLoading && !detailError && (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/[0.08] bg-[#08120e]/95 p-4 sm:p-5">
            {detailMode === 'view' ? (
              <>
                <button
                  type="button"
                  onClick={() => setArchivePreset(selectedPreset)}
                  className="grid h-10 w-10 place-items-center rounded-full border border-rose-300/15 text-rose-200/60 transition hover:bg-rose-300/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/30"
                  aria-label={t.admin.archiveAutomationPreset}
                  title={t.admin.archiveAutomationPreset}
                >
                  <Archive size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={openEdit}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/10 px-4 text-sm font-semibold text-white/65 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t.common.edit}
                </button>
                <button
                  type="button"
                  onClick={openApply}
                  className="inline-flex h-10 min-w-[9rem] cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-background transition hover:bg-[#74e4b1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <Play size={14} aria-hidden="true" />
                  {t.admin.applyAutomationPreset}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={closeWorkflow}
                  disabled={saving || previewing}
                  className="h-10 rounded-full border border-white/10 px-4 text-sm font-semibold text-white/60 transition hover:bg-white/[0.06] disabled:opacity-40"
                >
                  {t.common.cancel}
                </button>
                {detailMode === 'edit' ? (
                  <LoadingButton
                    type="submit"
                    form={editFormId}
                    loading={saving}
                    loadingLabel={t.common.loading}
                    disabled={!editDirty || !editValid}
                  >
                    {t.common.save}
                  </LoadingButton>
                ) : (
                  <LoadingButton
                    loading={saving}
                    loadingLabel={t.common.loading}
                    disabled={!preview || preview.summary.errors > 0}
                    onClick={applyPreset}
                  >
                    {t.admin.applyAutomationPreset}
                  </LoadingButton>
                )}
              </>
            )}
          </footer>
        )}
      </div>
    );
  }

  return (
    <>
      <TaskBoardMasterDetailWorkspace
        mobileView={mobileView}
        renderListPane={renderListPane}
        renderDetailPane={renderDetailPane}
        resizeLabel={t.admin.resizeAutomationPresetPanes}
        testId="automation-presets"
      />
      <ConfirmDialog
        open={Boolean(archivePreset)}
        title={t.admin.archiveAutomationPreset}
        description={t.admin.archiveAutomationPresetDescription}
        confirmLabel={t.common.archive}
        cancelLabel={t.common.cancel}
        loading={saving}
        onConfirm={archive}
        onCancel={() => setArchivePreset(null)}
      />
      <ConfirmDialog
        open={Boolean(discardAction)}
        title={t.admin.discardUnsavedChanges}
        description={t.admin.discardUnsavedChangesDescription}
        confirmLabel={t.admin.discardChanges}
        cancelLabel={t.common.cancel}
        onConfirm={() => {
          const action = discardAction;
          setDiscardAction(null);
          action?.();
        }}
        onCancel={() => setDiscardAction(null)}
      />
    </>
  );
}

function PreviewPanel({
  preview,
  t,
}: {
  preview: Preview;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="space-y-4 rounded-xl border border-white/[0.08] bg-black/15 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={t.admin.willCreate} value={preview.summary.willCreate} />
        <Metric label={t.admin.skippedDuplicates} value={preview.summary.willSkipDuplicates} />
        <Metric label={t.admin.automationWarnings} value={preview.summary.warnings} />
        <Metric label={t.admin.automationErrors} value={preview.summary.errors} />
      </div>
      <div className="space-y-2">
        {preview.actions.map((action) => (
          <div
            key={action.presetRuleId}
            className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white/72">
                {automationRuleSummary(action.type, action.config, t)}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  action.action === 'SKIP_DUPLICATE'
                    ? 'bg-white/[0.06] text-white/42'
                    : action.validation.some((item) => item.severity === 'ERROR')
                      ? 'bg-rose-300/10 text-rose-100/75'
                      : action.action === 'WARNING'
                        ? 'bg-amber-300/10 text-amber-100/70'
                        : 'bg-accent/10 text-accent'
                }`}
              >
                {action.action === 'SKIP_DUPLICATE'
                  ? t.admin.willSkipDuplicates
                  : action.action === 'WARNING'
                    ? t.admin.automationWarning
                    : t.admin.willCreate}
              </span>
            </div>
            {action.validation
              .filter((item) => item.severity !== 'INFO')
              .map((item) => (
                <p key={`${item.code}-${item.field ?? ''}`} className="mt-1 text-xs text-white/38">
                  {automationValidationMessage(item.code, t)}
                </p>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadOnlyRules({
  rules,
  t,
}: {
  rules: PresetDetail['rules'];
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white/68">
          {t.admin.includedAutomationRules}
        </h3>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-white/45">
          {rules.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-black/15 px-3 py-3"
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                rule.enabled
                  ? 'bg-accent/[0.08] text-accent/75'
                  : 'bg-white/[0.04] text-white/30'
              }`}
            >
              <Workflow size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/68">
                {rule.name || automationRuleSummary(rule.type, rule.config, t)}
              </p>
              {rule.name && (
                <p className="mt-0.5 text-xs text-white/35">
                  {automationRuleSummary(rule.type, rule.config, t)}
                </p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                rule.enabled
                  ? 'bg-accent/[0.08] text-accent/75'
                  : 'bg-white/[0.05] text-white/35'
              }`}
            >
              {rule.enabled ? t.admin.automationEnabled : t.common.inactive}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-xs text-white/38">
        {icon}
        {label}
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-white/70">{value}</p>
    </div>
  );
}

function automationRuleSummary(
  type: RuleType,
  config: Record<string, unknown>,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (type === 'DUE_BEFORE') {
    return `${t.admin.automationDueBefore} · ${Number(config.hoursBeforeDue ?? 24)}h`;
  }
  if (type === 'OVERDUE') {
    return `${t.admin.automationOverdue} · ${
      config.repeatDaily === true
        ? t.admin.automationOverdueDaily
        : t.admin.automationOverdueOnce
    }`;
  }
  if (type === 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE') return t.admin.automationAutoComplete;
  return t.admin.automationFlagUnassigned;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/[0.035] p-2.5">
      <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-0.5 text-[10px] text-white/35">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-white/65">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-accent/50"
      />
      {error && (
        <span className="mt-1 block text-xs text-rose-200" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
