'use client';

import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect, type AppSelectContainedPositioning } from './app-select';
import { TaskBoardMasterDetailWorkspace } from './task-board-master-detail-workspace';
import {
  ConfirmDialog,
  LoadingButton,
  TableEmptyState,
  TableErrorState,
  TableSkeleton,
} from './ui';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatDate } from '../lib/utils';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type TemplateItem = {
  id?: string;
  title: string;
  description: string;
  label: string;
  priority: Priority;
  dueOffsetDays: string;
  sortOrder: number;
};
type TaskTemplate = {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  items: Array<
    Omit<TemplateItem, 'dueOffsetDays'> & { dueOffsetDays?: number | null }
  >;
  updatedAt: string;
};
type TemplateForm = {
  name: string;
  description: string;
  isActive: boolean;
  items: TemplateItem[];
};
type TaskTemplateDetailMode = 'view' | 'edit' | 'create';

const emptyItem = (): TemplateItem => ({
  title: '',
  description: '',
  label: '',
  priority: 'MEDIUM',
  dueOffsetDays: '',
  sortOrder: 0,
});
const emptyForm = (): TemplateForm => ({
  name: '',
  description: '',
  isActive: true,
  items: [emptyItem()],
});

function templateForm(template: TaskTemplate): TemplateForm {
  return {
    name: template.name,
    description: template.description ?? '',
    isActive: template.isActive,
    items: template.items.map((item, index) => ({
      ...item,
      description: item.description ?? '',
      label: item.label ?? '',
      dueOffsetDays:
        item.dueOffsetDays === null || item.dueOffsetDays === undefined
          ? ''
          : String(item.dueOffsetDays),
      sortOrder: index,
    })),
  };
}

function comparableForm(form: TemplateForm) {
  return JSON.stringify({
    name: form.name,
    description: form.description,
    isActive: form.isActive,
    items: form.items.map((item) => ({
      title: item.title,
      description: item.description,
      label: item.label,
      priority: item.priority,
      dueOffsetDays: item.dueOffsetDays,
    })),
  });
}

export function TaskTemplateManager({
  endpointBase,
  onDirtyChange,
}: {
  endpointBase: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { lang, t } = useI18n();
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [mode, setMode] = useState<TaskTemplateDetailMode>('view');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [authoritativeForm, setAuthoritativeForm] = useState<TemplateForm>(emptyForm);
  const [selectionBeforeCreate, setSelectionBeforeCreate] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiveTemplate, setArchiveTemplate] = useState<TaskTemplate | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const desktopEditorBoundaryRef = useRef<HTMLDivElement>(null);
  const mobileEditorBoundaryRef = useRef<HTMLDivElement>(null);
  const desktopEditorPortalRef = useRef<HTMLDivElement>(null);
  const mobileEditorPortalRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const items = await apiFetch<TaskTemplate[]>(endpointBase);
      setTemplates(items);
      setSelectedTemplateId((current) =>
        current && !items.some((template) => template.id === current) ? null : current,
      );
      return items;
    } catch {
      setLoadError(t.admin.taskTemplatesLoadFailed);
      return null;
    }
  }, [endpointBase, t.admin.taskTemplatesLoadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTemplate =
    templates?.find((template) => template.id === selectedTemplateId) ?? null;
  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return templates ?? [];
    return (templates ?? []).filter((template) =>
      [template.name, template.description ?? ''].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [query, templates]);

  const dirty =
    mode !== 'view' && comparableForm(form) !== comparableForm(authoritativeForm);
  const validation = validateTemplateForm(form, t);
  const valid =
    !validation.name &&
    !validation.description &&
    !validation.items &&
    validation.itemErrors.every(
      (item) => !item.title && !item.description && !item.label && !item.dueOffsetDays,
    );

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return undefined;
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [dirty]);

  function requestDiscard(action: () => void) {
    if (dirty) {
      setDiscardAction(() => action);
      return;
    }
    action();
  }

  function selectTemplate(template: TaskTemplate) {
    requestDiscard(() => {
      setSelectedTemplateId(template.id);
      setMode('view');
      setFormError('');
      setMobileView('detail');
    });
  }

  function openCreate() {
    requestDiscard(() => {
      const nextForm = emptyForm();
      setSelectionBeforeCreate(selectedTemplateId);
      setForm(nextForm);
      setAuthoritativeForm(nextForm);
      setFormError('');
      setMode('create');
      setMobileView('detail');
    });
  }

  function openEdit() {
    if (!selectedTemplate) return;
    const nextForm = templateForm(selectedTemplate);
    setForm(nextForm);
    setAuthoritativeForm(nextForm);
    setFormError('');
    setMode('edit');
  }

  function restoreView() {
    if (mode === 'create') {
      setSelectedTemplateId(selectionBeforeCreate);
      if (!selectionBeforeCreate) setMobileView('list');
    } else if (selectedTemplate) {
      const nextForm = templateForm(selectedTemplate);
      setForm(nextForm);
      setAuthoritativeForm(nextForm);
    }
    setFormError('');
    setMode('view');
  }

  function cancelForm() {
    requestDiscard(restoreView);
  }

  async function save() {
    if (saving || !dirty || !valid) return;
    setSaving(true);
    setFormError('');
    try {
      const body = {
        name: form.name,
        description: form.description || null,
        isActive: form.isActive,
        items: form.items.map((item, sortOrder) => ({
          title: item.title,
          description: item.description || null,
          label: item.label || null,
          priority: item.priority,
          dueOffsetDays: item.dueOffsetDays === '' ? null : Number(item.dueOffsetDays),
          sortOrder,
        })),
      };
      const saved = await apiFetch<TaskTemplate>(
        `${endpointBase}${mode === 'edit' && selectedTemplateId ? `/${selectedTemplateId}` : ''}`,
        {
          method: mode === 'edit' ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
      toast.success(
        mode === 'edit' ? t.admin.taskTemplateUpdated : t.admin.taskTemplateCreated,
      );
      setMode('view');
      setSelectedTemplateId(saved.id);
      setForm(templateForm(saved));
      setAuthoritativeForm(templateForm(saved));
      await load();
    } catch {
      setFormError(t.admin.taskTemplateMutationFailed);
      toast.error(t.admin.taskTemplateSaveFailed);
      const refreshedTemplates = await load();
      if (
        mode === 'edit' &&
        selectedTemplateId &&
        refreshedTemplates &&
        !refreshedTemplates.some((template) => template.id === selectedTemplateId)
      ) {
        setSelectedTemplateId(null);
        setMode('view');
        setMobileView('list');
        toast.error(t.admin.taskTemplateNoLongerAvailable);
      }
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!archiveTemplate || archiving) return;
    const archivedId = archiveTemplate.id;
    const remainingTemplates = (templates ?? []).filter(
      (template) => template.id !== archivedId,
    );
    setArchiving(true);
    try {
      await apiFetch(`${endpointBase}/${archivedId}`, { method: 'DELETE' });
      toast.success(t.admin.taskTemplateArchived);
      setArchiveTemplate(null);
      await load();
      if (selectedTemplateId === archivedId) {
        const nextTemplate = remainingTemplates[0];
        setSelectedTemplateId(nextTemplate?.id ?? null);
        setMode('view');
        if (!nextTemplate) setMobileView('list');
      }
    } catch {
      toast.error(t.admin.taskTemplateSaveFailed);
    } finally {
      setArchiving(false);
    }
  }

  function updateItem(index: number, patch: Partial<TemplateItem>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= form.items.length) return;
    setForm((current) => {
      const items = [...current.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items };
    });
  }

  function renderListPane(mobile: boolean) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-white/[0.08] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-white">{t.admin.taskTemplates}</h2>
              <p className="mt-1 text-sm leading-6 text-white/48">
                {t.admin.taskTemplatesDescription}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-background transition hover:bg-[#74e4b1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Plus size={15} aria-hidden="true" />
              <span className={mobile ? 'sr-only' : ''}>{t.admin.newTaskTemplate}</span>
            </button>
          </div>
          <label className="relative mt-4 block">
            <span className="sr-only">{t.admin.searchTaskTemplates}</span>
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.admin.searchTaskTemplates}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/50"
            />
          </label>
        </header>

        <div className="chat-scrollbar min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <div className="p-4">
              <TableErrorState title={loadError} retryLabel={t.common.retry} onRetry={load} />
            </div>
          ) : !templates ? (
            <div className="p-4">
              <TableSkeleton rows={5} columns={4} />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-5">
              <TableEmptyState
                title={query.trim() ? t.admin.noMatchingTaskTemplates : t.admin.noTaskTemplates}
                description={query.trim() ? undefined : t.admin.taskTemplatesDescription}
              />
            </div>
          ) : mobile ? (
            <div className="divide-y divide-white/[0.07]">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className={`flex w-full items-start gap-3 px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                    selectedTemplateId === template.id
                      ? 'bg-accent/[0.09]'
                      : 'hover:bg-white/[0.035]'
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/15 bg-accent/[0.07] text-accent/80">
                    <Workflow size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white/82">
                        {template.name}
                      </span>
                      <Status active={template.isActive} t={t} />
                    </span>
                    {template.description && (
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-white/40">
                        {template.description}
                      </span>
                    )}
                    <span className="mt-2 block text-[11px] text-white/35">
                      {t.admin.templateTaskCount(template.items.length)}
                    </span>
                  </span>
                  <ChevronRight size={15} aria-hidden="true" className="mt-2 text-white/30" />
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#09130f] text-[10px] uppercase tracking-[0.1em] text-white/38">
                <tr>
                  <th className="px-4 py-3">{t.admin.taskTemplateColumn}</th>
                  <th className="px-3 py-3">{t.admin.templateItems}</th>
                  <th className="px-3 py-3">{t.common.status}</th>
                  <th className="px-3 py-3">{t.admin.updated}</th>
                  <th className="w-10 px-3 py-3"><span className="sr-only">{t.common.details}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {filteredTemplates.map((template) => {
                  const selected = selectedTemplateId === template.id;
                  return (
                    <tr
                      key={template.id}
                      tabIndex={0}
                      aria-selected={selected}
                      onClick={() => selectTemplate(template)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectTemplate(template);
                        }
                      }}
                      className={`cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                        selected
                          ? 'bg-accent/[0.09] hover:bg-accent/[0.11]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="max-w-[260px] px-4 py-4">
                        <p className="truncate font-semibold text-white/82">{template.name}</p>
                        {template.description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/38">
                            {template.description}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-xs text-white/48">
                        {t.admin.templateTaskCount(template.items.length)}
                      </td>
                      <td className="px-3 py-4"><Status active={template.isActive} t={t} /></td>
                      <td className="whitespace-nowrap px-3 py-4 text-xs text-white/42">
                        {formatDate(template.updatedAt, lang === 'fr' ? 'fr-FR' : 'en-US')}
                      </td>
                      <td className="px-3 py-4"><ChevronRight size={15} aria-hidden="true" className="text-white/28" /></td>
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
    const title =
      mode === 'create'
        ? t.admin.newTaskTemplate
        : selectedTemplate?.name ?? t.admin.selectTaskTemplateRecord;
    const formId = `task-template-${mode}-${selectedTemplateId ?? 'new'}-${mobile ? 'mobile' : 'desktop'}`;
    return (
      <div
        ref={mobile ? mobileEditorPortalRef : desktopEditorPortalRef}
        className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black/10"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-5">
          {mobile && (
            <button
              type="button"
              onClick={() =>
                mode === 'view' ? setMobileView('list') : cancelForm()
              }
              aria-label={mode === 'view' ? t.admin.taskTemplateBack : t.common.cancel}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/55 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent/65">
              {mode === 'create'
                ? t.admin.newTaskTemplate
                : mode === 'edit'
                  ? t.admin.editTaskTemplate
                  : t.common.details}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">{title}</h2>
            {mode === 'view' && selectedTemplate?.description && (
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/42">
                {selectedTemplate.description}
              </p>
            )}
          </div>
          {mode === 'view' && selectedTemplate && (
            <Status active={selectedTemplate.isActive} t={t} />
          )}
        </header>

        <div
          ref={mobile ? mobileEditorBoundaryRef : desktopEditorBoundaryRef}
          className="chat-scrollbar min-h-0 flex-1 overflow-y-auto"
        >
          {mode === 'view' && !selectedTemplate ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/30">
                <Workflow size={21} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold text-white/78">{t.admin.selectTaskTemplateRecord}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-white/42">
                {t.admin.selectTaskTemplateRecordDescription}
              </p>
            </div>
          ) : mode === 'edit' || mode === 'create' ? (
            <form
              id={formId}
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              className="min-w-0"
            >
              <TemplateFormBody
                form={form}
                validation={validation}
                formError={formError}
                onFormChange={setForm}
                onUpdateItem={updateItem}
                onMoveItem={moveItem}
                containedPositioning={{
                  boundaryRef: mobile ? mobileEditorBoundaryRef : desktopEditorBoundaryRef,
                  portalRef: mobile ? mobileEditorPortalRef : desktopEditorPortalRef,
                }}
                t={t}
              />
            </form>
          ) : selectedTemplate ? (
            <div className="space-y-6 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailMetric
                  icon={<Clock3 size={15} aria-hidden="true" />}
                  label={t.admin.updated}
                  value={formatDate(selectedTemplate.updatedAt, lang === 'fr' ? 'fr-FR' : 'en-US')}
                />
                <DetailMetric
                  icon={<Workflow size={15} aria-hidden="true" />}
                  label={t.admin.templateItems}
                  value={t.admin.templateTaskCount(selectedTemplate.items.length)}
                />
              </div>
              <TemplateItems items={selectedTemplate.items} t={t} />
            </div>
          ) : null}
        </div>

        {(selectedTemplate || mode === 'create') && (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/[0.08] bg-[#08120e]/95 p-4 backdrop-blur sm:p-5">
            {mode === 'view' && selectedTemplate ? (
              <>
                <button
                  type="button"
                  onClick={() => setArchiveTemplate(selectedTemplate)}
                  aria-label={t.common.archive}
                  title={t.common.archive}
                  className="grid h-10 w-10 place-items-center rounded-full border border-rose-300/15 text-rose-200/60 transition hover:bg-rose-300/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/30"
                >
                  <Archive size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={openEdit}
                  className="inline-flex h-10 min-w-[7rem] items-center justify-center gap-2 rounded-lg border border-white/10 px-4 text-sm font-semibold text-white/65 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t.common.edit}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelForm}
                  className="h-10 rounded-lg border border-white/10 px-4 text-sm font-semibold text-white/60 transition hover:bg-white/[0.06] disabled:opacity-40"
                >
                  {t.common.cancel}
                </button>
                <LoadingButton
                  type="submit"
                  form={formId}
                  loading={saving}
                  loadingLabel={t.admin.savingEventTask}
                  disabled={!dirty || !valid}
                  className="h-10 rounded-lg px-4 text-sm font-semibold"
                >
                  {t.common.save}
                </LoadingButton>
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
        resizeLabel={t.admin.resizeTaskTemplatePanes}
        testId="task-templates"
      />
      <ConfirmDialog
        open={Boolean(archiveTemplate)}
        title={t.common.archive}
        description={t.admin.archiveTaskTemplateDescription}
        confirmLabel={t.common.archive}
        cancelLabel={t.common.cancel}
        loading={archiving}
        onConfirm={archive}
        onCancel={() => setArchiveTemplate(null)}
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

type TemplateValidation = ReturnType<typeof validateTemplateForm>;

function TemplateFormBody({
  form,
  validation,
  formError,
  onFormChange,
  onUpdateItem,
  onMoveItem,
  containedPositioning,
  t,
}: {
  form: TemplateForm;
  validation: TemplateValidation;
  formError: string;
  onFormChange: (form: TemplateForm) => void;
  onUpdateItem: (index: number, patch: Partial<TemplateItem>) => void;
  onMoveItem: (index: number, direction: -1 | 1) => void;
  containedPositioning: AppSelectContainedPositioning;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <div className="space-y-5 p-4 sm:p-5">
      {formError && (
        <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2.5 text-sm text-rose-100">
          {formError}
        </p>
      )}
      <Field
        label={t.admin.templateName}
        value={form.name}
        error={validation.name}
        onChange={(name) => onFormChange({ ...form, name })}
      />
      <label className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-sm text-white/65">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => onFormChange({ ...form, isActive: event.target.checked })}
          className="h-4 w-4 accent-emerald-400"
        />
        {t.admin.activeTemplate}
      </label>
      <label className="block">
        <span className="text-sm text-white/70">{t.admin.templateDescription}</span>
        <textarea
          value={form.description}
          onChange={(event) => onFormChange({ ...form, description: event.target.value })}
          rows={3}
          aria-invalid={Boolean(validation.description)}
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/50"
        />
        {validation.description && <FieldError>{validation.description}</FieldError>}
      </label>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{t.admin.templateItems}</h3>
          {validation.items && <FieldError>{validation.items}</FieldError>}
        </div>
        <button
          type="button"
          onClick={() =>
            onFormChange({
              ...form,
              items: [...form.items, { ...emptyItem(), sortOrder: form.items.length }],
            })
          }
          disabled={form.items.length >= 100}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent disabled:opacity-40"
        >
          <Plus size={13} aria-hidden="true" />
          {t.admin.addTemplateItem}
        </button>
      </div>
      <div className="space-y-3">
        {form.items.map((item, index) => {
          const itemError = validation.itemErrors[index] ?? {};
          return (
            <div key={item.id ?? index} className="rounded-lg bg-black/20 p-4 ring-1 ring-white/[0.06]">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold tabular-nums text-white/30">{index + 1}</span>
                <div className="flex gap-1">
                  <IconButton label={t.admin.moveItemUp} disabled={index === 0} onClick={() => onMoveItem(index, -1)}><ArrowUp size={13} /></IconButton>
                  <IconButton label={t.admin.moveItemDown} disabled={index === form.items.length - 1} onClick={() => onMoveItem(index, 1)}><ArrowDown size={13} /></IconButton>
                  <IconButton label={t.admin.removeTemplateItem} disabled={form.items.length === 1} onClick={() => onFormChange({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={13} /></IconButton>
                </div>
              </div>
              <div className="mt-3 grid min-w-0 gap-3">
                <Field label={t.admin.eventTaskTitle} value={item.title} error={itemError.title} onChange={(title) => onUpdateItem(index, { title })} />
                <Field label={t.admin.eventTaskLabel} value={item.label} error={itemError.label} onChange={(label) => onUpdateItem(index, { label })} />
                <AppSelect value={item.priority} label={t.admin.eventTaskPriority} options={(['LOW', 'MEDIUM', 'HIGH'] as Priority[]).map((priority) => ({ value: priority, label: priorityLabel(priority, t) }))} containedPositioning={containedPositioning} onChange={(priority) => onUpdateItem(index, { priority })} />
                <Field label={t.admin.dueOffsetDays} hint={t.admin.dueOffsetDaysDescription} type="number" value={item.dueOffsetDays} error={itemError.dueOffsetDays} onChange={(dueOffsetDays) => onUpdateItem(index, { dueOffsetDays })} />
                <label className="sm:col-span-2">
                  <span className="text-sm text-white/70">{t.admin.eventTaskDescription}</span>
                  <textarea value={item.description} onChange={(event) => onUpdateItem(index, { description: event.target.value })} rows={2} aria-invalid={Boolean(itemError.description)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/50" />
                  {itemError.description && <FieldError>{itemError.description}</FieldError>}
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplateItems({ items, t }: { items: TaskTemplate['items']; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white/68">{t.admin.templateItems}</h3>
        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-white/45">{items.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={item.id ?? index} className="rounded-lg border border-white/[0.07] bg-black/15 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/70">{item.title}</p>
                {item.description && <p className="mt-1 text-xs leading-5 text-white/38">{item.description}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-white/42">{priorityLabel(item.priority, t)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/34">
              {item.label && <span>{item.label}</span>}
              {item.dueOffsetDays !== null && item.dueOffsetDays !== undefined && <span>{t.admin.taskTemplateDueOffset(item.dueOffsetDays)}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function validateTemplateForm(form: TemplateForm, t: ReturnType<typeof useI18n>['t']) {
  return {
    name: !form.name.trim()
      ? t.admin.taskTemplateNameRequired
      : form.name.trim().length > 160
        ? t.admin.taskTemplateNameTooLong
        : '',
    description:
      form.description.trim().length > 1000
        ? t.admin.taskTemplateDescriptionTooLong
        : '',
    items:
      form.items.length === 0
        ? t.admin.taskTemplateItemRequired
        : form.items.length > 100
          ? t.admin.taskTemplateTooManyItems
          : '',
    itemErrors: form.items.map((item) => {
      const dueOffset = item.dueOffsetDays === '' ? null : Number(item.dueOffsetDays);
      return {
        title: !item.title.trim()
          ? t.admin.taskTemplateItemTitleRequired
          : item.title.trim().length > 160
            ? t.admin.taskTemplateItemTitleTooLong
            : '',
        description:
          item.description.trim().length > 2000
            ? t.admin.taskTemplateItemDescriptionTooLong
            : '',
        label:
          item.label.trim().length > 60 ? t.admin.taskTemplateItemLabelTooLong : '',
        dueOffsetDays:
          dueOffset !== null &&
          (!Number.isInteger(dueOffset) || dueOffset < -3650 || dueOffset > 3650)
            ? t.admin.taskTemplateDueOffsetInvalid
            : '',
      };
    }),
  };
}

function Field({ label, hint, value, type = 'text', error, onChange }: { label: string; hint?: string; value: string; type?: string; error?: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm text-white/70">{label}</span>
      {hint && <span className="ml-2 text-xs text-white/32">{hint}</span>}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/50" />
      {error && <FieldError>{error}</FieldError>}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-xs text-rose-200" role="alert">{children}</span>;
}

function Status({ active, t }: { active: boolean; t: ReturnType<typeof useI18n>['t'] }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? 'bg-accent/10 text-accent' : 'bg-white/[0.06] text-white/40'}`}>{active ? t.admin.activeTemplate : t.common.inactive}</span>;
}

function DetailMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-xs text-white/38">{icon}{label}</div><p className="mt-2 truncate text-sm font-semibold text-white/70">{value}</p></div>;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-full text-white/40 hover:bg-white/[0.07] hover:text-white disabled:opacity-20">{children}</button>;
}

function priorityLabel(priority: Priority, t: ReturnType<typeof useI18n>['t']) {
  return priority === 'LOW' ? t.admin.eventTaskLow : priority === 'HIGH' ? t.admin.eventTaskHigh : t.admin.eventTaskMedium;
}
