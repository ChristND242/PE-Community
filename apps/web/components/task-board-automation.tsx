'use client';

import { Activity, AlertTriangle, Archive, BellRing, BookmarkPlus, Check, CheckCircle2, ChevronDown, Clock3, History, Info, ListChecks, Loader2, Plus, RotateCcw, ShieldAlert, UserX, Workflow, X, type LucideIcon } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button, ConfirmDialog, LoadingButton, TableErrorState, TableSkeleton } from './ui';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { apiFetch, COMMUNITY_ID } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatDate } from '../lib/utils';
import { automationValidationMessage, type AutomationValidationResult } from '../lib/automation-validation';
import { AutomationRunsDrawer } from './automation-runs-drawer';
import { AutomationCanvasView, type AutomationCanvasGroup, type AutomationCanvasNode } from './automation-canvas-view';

type RuleType = 'DUE_BEFORE' | 'OVERDUE' | 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE' | 'FLAG_UNASSIGNED' | 'STALE_TASK_FOLLOW_UP' | 'CHECKLIST_INCOMPLETE_BEFORE_DUE' | 'OVERDUE_ESCALATION';
type Position = { x: number; y: number };
type Rule = { id: string; type: RuleType; name?: string | null; enabled: boolean; config: Record<string, unknown>; hasDraft?: boolean; staleDraft?: boolean; currentVersion?: number; archivedAt?: string | null; archivedBy?: { id: string; name: string } | null; archiveReason?: string | null; createdFromPreset?: { id: string; name: string } | null; lastLiveRunAt?: string | null; validation?: AutomationValidationResult; lastRunAt?: string | null; lastRunStatus?: 'SUCCESS' | 'SKIPPED' | 'FAILED' | null; lastRunMode?: 'LIVE' | 'DRY_RUN' | 'TEST_NOTIFICATION' | null; lastRunSummary?: string | null };
type RuleDraft = { id?: string; type: RuleType; enabled: boolean; config: Record<string, unknown>; hasDraft?: boolean };
type RuleDraftResponse = { hasDraft: boolean; draft: { enabled: boolean; config: Record<string, unknown> } | null; live: { enabled: boolean; config: Record<string, unknown> } };
type AutomationRecipientSource = 'ASSIGNEE' | 'ADMIN' | 'OWNER';
type AutomationRecipient = { id: string; name: string; avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null; source: AutomationRecipientSource };
type BoardAssignee = Omit<AutomationRecipient, 'source'>;
type DeliveryAvailability = { channels: { inApp: { available: boolean }; email: { available: boolean; reason?: 'SMTP_NOT_CONFIGURED' | 'SMTP_DISABLED' | 'MISSING_FROM_ADDRESS' | 'UNKNOWN' } }; recipients: { administrators: AutomationRecipient[] } };
type ArchivedRulesResponse = { items: Rule[] };
type AutomationRulePickerCategory = 'due-date' | 'work-health' | 'automation';
type AutomationRulePickerOption = { type: RuleType; title: string; description: string; category: AutomationRulePickerCategory; icon: LucideIcon };

const types: RuleType[] = ['DUE_BEFORE', 'OVERDUE', 'STALE_TASK_FOLLOW_UP', 'CHECKLIST_INCOMPLETE_BEFORE_DUE', 'OVERDUE_ESCALATION', 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', 'FLAG_UNASSIGNED'];
const defaults: Record<RuleType, Record<string, unknown>> = {
  DUE_BEFORE: { hoursBeforeDue: 24, notifyAssignees: true, notifyAdmins: false, delivery: defaultDelivery() },
  OVERDUE: { notifyAssignees: true, notifyAdmins: true, repeatDaily: false, delivery: defaultDelivery() },
  STALE_TASK_FOLLOW_UP: { inactiveDays: 3, notifyAssignees: true, notifyAdmins: false, delivery: defaultDelivery() },
  CHECKLIST_INCOMPLETE_BEFORE_DUE: { hoursBeforeDue: 24, requireChecklistItems: true, notifyAssignees: true, notifyAdmins: false, delivery: defaultDelivery() },
  OVERDUE_ESCALATION: { graceDays: 2, notifyAssignees: false, notifyAdmins: true, repeatDaily: false, delivery: defaultDelivery() },
  AUTO_COMPLETE_WHEN_CHECKLIST_DONE: { requireAtLeastOneChecklistItem: true },
  FLAG_UNASSIGNED: { includeInOverview: true },
};
const nodeWidth = 248;

export function TaskBoardAutomation({ boardId, boardName, linkedEvent, lifecycle, canEdit, assignees }: { boardId: string; boardName: string; linkedEvent: boolean; lifecycle?: { status: 'ACTIVE' | 'PAUSED' | 'COMPLETED'; eventEnded: boolean }; canEdit: boolean; assignees: BoardAssignee[] }) {
  const { lang, t } = useI18n();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [archivedRules, setArchivedRules] = useState<Rule[] | null>(null);
  const [lifecycleView, setLifecycleView] = useState<'active' | 'archived'>('active');
  const [deliveryAvailability, setDeliveryAvailability] = useState<DeliveryAvailability | null>(null);
  const [error, setError] = useState(false);
  const [selectedType, setSelectedType] = useState<RuleType>('DUE_BEFORE');
  const [editor, setEditor] = useState<RuleDraft | null>(null);
  const [savingId, setSavingId] = useState('');
  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const [runsRule, setRunsRule] = useState<Rule | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [dragPositions, setDragPositions] = useState<Record<string, Position>>({});
  const [structuralPositions, setStructuralPositions] = useState<Record<string, Position>>({});
  const [openMenuRuleId, setOpenMenuRuleId] = useState<string | null>(null);
  const [openRecipientsRuleId, setOpenRecipientsRuleId] = useState<string | null>(null);
  const [editorValidation, setEditorValidation] = useState<AutomationValidationResult | null>(null);
  const [validatingEditor, setValidatingEditor] = useState(false);
  const [compactToolbarActions, setCompactToolbarActions] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const toolbarActionsRef = useRef<HTMLDivElement>(null);
  const toolbarMeasureRef = useRef<HTMLDivElement>(null);
  const validationRequestRef = useRef(0);
  const load = useCallback(async () => {
    setError(false);
    try { const [nextRules, archived, availability] = await Promise.all([apiFetch<Rule[]>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules`), apiFetch<ArchivedRulesResponse>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/archived`), apiFetch<DeliveryAvailability>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-delivery`)]); setRules(nextRules); setArchivedRules(archived.items); setDeliveryAvailability(availability); }
    catch { setError(true); }
  }, [boardId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(`pe:automation-flow-layout:${boardId}`) ?? '{}');
      if (stored && typeof stored === 'object') setStructuralPositions(stored as Record<string, Position>);
    } catch { setStructuralPositions({}); }
  }, [boardId]);
  useEffect(() => {
    if (!openMenuRuleId && !openRecipientsRuleId) return undefined;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-automation-node-menu], [data-automation-recipient-panel]')) return;
      setOpenMenuRuleId(null);
      setOpenRecipientsRuleId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpenMenuRuleId(null); setOpenRecipientsRuleId(null); } };
    document.addEventListener('pointerdown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenuRuleId, openRecipientsRuleId]);
  useEffect(() => {
    if (!editor) { validationRequestRef.current += 1; setEditorValidation(null); setValidatingEditor(false); return undefined; }
    const requestId = ++validationRequestRef.current;
    setValidatingEditor(true);
    const timeout = window.setTimeout(async () => {
      try {
        const result = await validateDraft(editor);
        if (validationRequestRef.current === requestId) setEditorValidation(result);
      } catch {
        if (validationRequestRef.current === requestId) setEditorValidation(null);
      } finally {
        if (validationRequestRef.current === requestId) setValidatingEditor(false);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [boardId, editor]);

  const labels: Record<RuleType, string> = { DUE_BEFORE: t.admin.automationDueBefore, OVERDUE: t.admin.automationOverdue, STALE_TASK_FOLLOW_UP: t.admin.automationStaleTaskFollowUp, CHECKLIST_INCOMPLETE_BEFORE_DUE: t.admin.automationChecklistIncompleteBeforeDue, OVERDUE_ESCALATION: t.admin.automationOverdueEscalation, AUTO_COMPLETE_WHEN_CHECKLIST_DONE: t.admin.automationAutoComplete, FLAG_UNASSIGNED: t.admin.automationFlagUnassigned };
  const pickerOptions: AutomationRulePickerOption[] = [
    { type: 'DUE_BEFORE', title: labels.DUE_BEFORE, description: t.admin.automationDueBeforeDescription, category: 'due-date', icon: BellRing },
    { type: 'OVERDUE', title: labels.OVERDUE, description: t.admin.automationOverdueDescription, category: 'due-date', icon: Clock3 },
    { type: 'STALE_TASK_FOLLOW_UP', title: labels.STALE_TASK_FOLLOW_UP, description: t.admin.automationStaleTaskDescription, category: 'work-health', icon: Activity },
    { type: 'CHECKLIST_INCOMPLETE_BEFORE_DUE', title: labels.CHECKLIST_INCOMPLETE_BEFORE_DUE, description: t.admin.automationChecklistIncompleteDescription, category: 'work-health', icon: ListChecks },
    { type: 'OVERDUE_ESCALATION', title: labels.OVERDUE_ESCALATION, description: t.admin.automationOverdueEscalationDescription, category: 'work-health', icon: ShieldAlert },
    { type: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', title: labels.AUTO_COMPLETE_WHEN_CHECKLIST_DONE, description: t.admin.automationAutoCompleteDescription, category: 'automation', icon: CheckCircle2 },
    { type: 'FLAG_UNASSIGNED', title: labels.FLAG_UNASSIGNED, description: t.admin.automationFlagUnassignedDescription, category: 'automation', icon: UserX },
  ];
  useLayoutEffect(() => {
    const actions = toolbarActionsRef.current;
    const measure = toolbarMeasureRef.current;
    if (!actions || !measure) return undefined;
    const update = () => setCompactToolbarActions(measure.scrollWidth > actions.clientWidth);
    const observer = new ResizeObserver(update);
    observer.observe(actions);
    update();
    return () => observer.disconnect();
  }, [lang, selectedType]);
  const grouped = useMemo(() => types.map((type) => ({ type, rules: (rules ?? []).filter((rule) => rule.type === type) })).filter((group) => group.rules.length), [rules]);
  const positions = useMemo(() => {
    const result: Record<string, Position> = {};
    grouped.forEach((group, groupIndex) => group.rules.forEach((rule, ruleIndex) => {
      const stored = rule.config.layout as Position | undefined;
      const groupX = structuralPositions[`group:${group.type}`]?.x ?? 44 + groupIndex * 350;
      result[rule.id] = dragPositions[rule.id] ?? (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? stored : { x: groupX + 12, y: 350 + ruleIndex * 160 });
    }));
    return result;
  }, [dragPositions, grouped, structuralPositions]);
  const canvasWidth = Math.max(920, grouped.length * 350 + 100, ...Object.values(positions).map((position) => position.x + nodeWidth + 48), ...Object.values(structuralPositions).map((position) => position.x + 360));
  const canvasHeight = Math.max(620, ...Object.entries(positions).map(([ruleId, position]) => position.y + (openRecipientsRuleId === ruleId ? 390 : 170)), ...Object.values(structuralPositions).map((position) => position.y + 160));
  const rootPosition = structuralPositions.root ?? { x: canvasWidth / 2 - 160, y: 32 };
  const groupPositions = Object.fromEntries(grouped.map((group, index) => [group.type, structuralPositions[`group:${group.type}`] ?? { x: 44 + index * 350, y: 190 }])) as Record<RuleType, Position>;
  const canvasGroups: AutomationCanvasGroup[] = grouped.map((group) => {
    const enabledRules = group.rules.filter((rule) => rule.enabled);
    return {
      key: group.type,
      type: group.type,
      label: labels[group.type],
      enabled: enabledRules.length,
      executed: enabledRules.filter((rule) => rule.lastRunStatus === 'SUCCESS').length,
      issueCount: group.rules.filter((rule) => validationIssues(rule.validation).length > 0).length,
      nodes: group.rules.map((rule): AutomationCanvasNode => {
        const firstIssue = validationIssues(rule.validation)[0];
        const notificationRule = isNotificationRule(rule.type);
        const closeThen = (action: () => void) => () => { setOpenMenuRuleId(null); action(); };
        return {
          id: rule.id,
          type: rule.type,
          label: ruleSummary(rule, t),
          status: ruleStatus(rule, t, Boolean(lifecycle?.eventEnded || lifecycle?.status === 'PAUSED' || lifecycle?.status === 'COMPLETED')),
          lastRunAt: rule.lastRunAt,
          lastRunStatus: rule.lastRunStatus,
          issueLabel: firstIssue ? automationValidationMessage(firstIssue.code, t) : null,
          draftLabel: rule.hasDraft ? (rule.staleDraft ? t.admin.automationDraftStale : t.admin.automationDraft) : null,
          notificationRule,
          recipients: resolvedRecipients(rule, assignees, deliveryAvailability?.recipients?.administrators ?? []).map((recipient) => ({ ...recipient, sourceLabel: recipientSourceLabel(recipient.source, t) })),
          actions: canEdit ? [
            { label: t.admin.automationEditRule, action: closeThen(() => void openRuleEditor(rule)) },
            { label: t.admin.automationRunDryTest, action: closeThen(() => void testRule(rule)) },
            ...(notificationRule ? [{ label: t.admin.automationSendTestNotification, action: closeThen(() => void testNotification(rule)) }] : []),
            { label: t.admin.automationViewRuns, action: closeThen(() => setRunsRule(rule)) },
            { label: t.admin.automationArchiveRule, action: closeThen(() => setDeleteRule(rule)), destructive: true },
          ] : [],
        };
      }),
    };
  });

  async function publishEditor() {
    if (!editor || savingId) return;
    setSavingId(editor.id ?? 'new');
    try {
      setValidatingEditor(true);
      const validation = await validateDraft(editor);
      setEditorValidation(validation);
      setValidatingEditor(false);
      if (!validation.valid) { toast.error(t.admin.automationResolveValidationErrors); return; }
      if (editor.id) {
        await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${editor.id}/draft`, { method: 'PUT', body: JSON.stringify({ enabled: editor.enabled, config: editor.config }) });
        await apiFetch<{ rule: Rule }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${editor.id}/draft/publish`, { method: 'POST' });
      } else {
        await apiFetch<Rule>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules`, { method: 'POST', body: JSON.stringify({ type: editor.type, enabled: editor.enabled, config: editor.config }) });
      }
      await load();
      toast.success(editor.id ? t.admin.automationDraftPublished : t.admin.automationRuleCreated); setEditor(null);
    } catch { setValidatingEditor(false); toast.error(editor.id ? t.admin.automationDraftPublishFailed : t.admin.automationRuleSaveFailed); } finally { setSavingId(''); }
  }
  async function saveEditorDraft() {
    if (!editor?.id || savingId || !draftStructurallyValid(editor)) return;
    setSavingId(editor.id);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${editor.id}/draft`, { method: 'PUT', body: JSON.stringify({ enabled: editor.enabled, config: editor.config }) });
      await load();
      toast.success(t.admin.automationDraftSaved);
      setEditor(null);
    } catch { toast.error(t.admin.automationDraftSaveFailed); } finally { setSavingId(''); }
  }
  async function openRuleEditor(rule: Rule) {
    try {
      const response = await apiFetch<RuleDraftResponse>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/draft`);
      const source = response.draft ?? response.live;
      setEditor({ id: rule.id, type: rule.type, enabled: source.enabled, config: { ...source.config, ...(rule.config.layout ? { layout: rule.config.layout } : {}) }, hasDraft: response.hasDraft });
    } catch {
      toast.error(t.admin.automationRuleSaveFailed);
    }
  }
  function validateDraft(draft: RuleDraft) {
    return apiFetch<AutomationValidationResult>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/validate`, {
      method: 'POST',
      body: JSON.stringify({ ruleId: draft.id, type: draft.type, enabled: draft.enabled, config: draft.config }),
    });
  }
  async function archiveRule() {
    if (!deleteRule || savingId) return;
    setSavingId(deleteRule.id);
    try { await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${deleteRule.id}/archive`, { method: 'POST', body: JSON.stringify({}) }); await load(); toast.success(t.admin.automationRuleArchived); setDeleteRule(null); }
    catch { toast.error(t.admin.automationRuleArchiveFailed); } finally { setSavingId(''); }
  }
  async function restoreRule(rule: Rule) {
    if (savingId) return;
    setSavingId(`restore:${rule.id}`);
    try { await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/restore`, { method: 'POST' }); await load(); toast.success(t.admin.automationRuleRestored); }
    catch { toast.error(t.admin.automationRuleRestoreFailed); } finally { setSavingId(''); }
  }
  async function testRule(rule: Rule) {
    if (savingId) return;
    setSavingId(`test:${rule.id}`);
    try { await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/test`, { method: 'POST' }); toast.success(t.admin.automationRuleTestCompleted); setRunsRule(rule); await load(); }
    catch { toast.error(t.admin.automationRuleTestFailed); } finally { setSavingId(''); }
  }
  async function testNotification(rule: Rule) {
    if (savingId) return;
    setSavingId(`notification:${rule.id}`);
    try { const response = await apiFetch<{ run: { status: 'SUCCESS' | 'SKIPPED' | 'FAILED' } }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/test-notification`, { method: 'POST' }); if (response.run.status === 'SUCCESS') toast.success(t.admin.automationTestNotificationSent); else toast.info(t.admin.automationNoSupportedChannel); }
    catch { toast.error(t.admin.automationTestNotificationFailed); } finally { setSavingId(''); }
  }
  async function persistPosition(rule: Rule, position: Position) {
    const config = { ...rule.config, layout: position };
    setRules((current) => (current ?? []).map((item) => item.id === rule.id ? { ...item, config } : item));
    try { await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: rule.enabled, config }) }); }
    catch { toast.error(t.admin.automationRuleSaveFailed); void load(); }
  }
  function startDrag(event: ReactPointerEvent, rule: Rule) {
    if (!canEdit || !canvasRef.current) return;
    event.preventDefault();
    const start = positions[rule.id];
    const origin = { x: event.clientX, y: event.clientY };
    const move = (next: PointerEvent) => setDragPositions((current) => ({ ...current, [rule.id]: { x: Math.max(16, start.x + next.clientX - origin.x), y: Math.max(300, start.y + next.clientY - origin.y) } }));
    const up = (next: PointerEvent) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); const position = { x: Math.round(Math.max(16, start.x + next.clientX - origin.x)), y: Math.round(Math.max(300, start.y + next.clientY - origin.y)) }; setDragPositions((current) => ({ ...current, [rule.id]: position })); void persistPosition(rule, position); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
  }
  function startStructuralDrag(event: ReactPointerEvent, key: string, start: Position) {
    if (!canEdit) return;
    event.preventDefault();
    const origin = { x: event.clientX, y: event.clientY };
    const move = (next: PointerEvent) => setStructuralPositions((current) => ({ ...current, [key]: { x: Math.max(16, start.x + next.clientX - origin.x), y: Math.max(16, start.y + next.clientY - origin.y) } }));
    const up = (next: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const position = { x: Math.round(Math.max(16, start.x + next.clientX - origin.x)), y: Math.round(Math.max(16, start.y + next.clientY - origin.y)) };
      setStructuralPositions((current) => { const updated = { ...current, [key]: position }; try { window.localStorage.setItem(`pe:automation-flow-layout:${boardId}`, JSON.stringify(updated)); } catch {} return updated; });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
  }

  const lifecycleNotice = lifecycle?.eventEnded ? t.admin.automationStoppedEventEnded : lifecycle?.status === 'PAUSED' ? t.admin.automationStoppedBoardPaused : lifecycle?.status === 'COMPLETED' ? t.admin.automationStoppedBoardCompleted : null;

  return <section className="space-y-4">{lifecycleNotice && <div className="flex items-start gap-2 rounded-lg border border-[var(--app-warning-border)] bg-[var(--app-warning-soft)] px-3 py-2.5 text-sm text-[var(--app-warning-foreground)] dark:border-amber-200/10 dark:bg-amber-300/[0.035] dark:text-amber-100/65"><AlertTriangle className="mt-0.5 shrink-0" size={14}/><span>{lifecycleNotice} {t.admin.automationDefinitionsRemainAvailable}</span></div>}<div className="flex flex-wrap items-start justify-between gap-4 lg:flex-nowrap"><div className="min-w-0 lg:min-w-[16rem] lg:flex-1"><h2 className="text-xl font-semibold text-white">{t.admin.automationFlow}</h2><p className="mt-1 text-sm text-white/45">{t.admin.automationFlowDescription}</p><div className="mt-3 inline-flex flex-wrap rounded-lg border border-white/[0.08] bg-black/20 p-1">{(['active','archived'] as const).map((view) => <button key={view} type="button" onClick={() => setLifecycleView(view)} aria-pressed={lifecycleView === view} className={`min-h-8 rounded-md px-3 text-xs font-semibold transition ${lifecycleView === view ? 'bg-white/[0.09] text-white' : 'text-white/38 hover:text-white/65'}`}>{view === 'active' ? t.admin.automationActiveRules : `${t.admin.automationArchivedRules} (${archivedRules?.length ?? 0})`}</button>)}</div></div>{canEdit && lifecycleView === 'active' && <div ref={toolbarActionsRef} className="relative flex w-full min-w-0 flex-wrap items-end justify-end gap-2 lg:w-auto lg:max-w-[44rem] lg:flex-1 lg:flex-nowrap">
    <div ref={toolbarMeasureRef} aria-hidden="true" className="pointer-events-none absolute invisible inline-flex w-max items-center gap-2 whitespace-nowrap"><span className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"><BookmarkPlus size={15}/>{t.admin.saveAsAutomationPreset}</span><span className="inline-flex h-10 max-w-[320px] items-center gap-2 px-3 text-sm font-semibold"><BellRing size={16}/>{pickerOptions.find((option) => option.type === selectedType)?.title}<ChevronDown size={16}/></span><span className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold"><Plus size={16}/>{t.admin.addAutomationRule}</span></div>
    <Tooltip><TooltipTrigger><Button type="button" aria-label={t.admin.saveAsAutomationPreset} disabled={!rules?.length} onClick={() => setPresetDialogOpen(true)} className={`${compactToolbarActions ? 'w-10 px-0' : 'px-4 max-sm:w-10 max-sm:px-0'} h-10 shrink-0 gap-2 border border-white/10 bg-transparent text-sm font-semibold text-white/60 shadow-none hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-35`}><BookmarkPlus size={15}/><span className={compactToolbarActions ? 'sr-only' : 'max-sm:sr-only'}>{t.admin.saveAsAutomationPreset}</span></Button></TooltipTrigger><TooltipContent>{t.admin.saveAsAutomationPreset}</TooltipContent></Tooltip>
    <AutomationRulePicker value={selectedType} options={pickerOptions} onChange={setSelectedType} ariaLabel={t.admin.automationRuleType} categoryLabels={{ 'due-date': t.admin.automationRuleCategoryDueDate, 'work-health': t.admin.automationRuleCategoryWorkHealth, automation: t.admin.automationRuleCategoryAutomation }} />
    <Tooltip><TooltipTrigger><Button type="button" aria-label={t.admin.addAutomationRule} onClick={() => setEditor({ type: selectedType, enabled: true, config: { ...defaults[selectedType] } })} className={`${compactToolbarActions ? 'w-10 px-0' : 'px-4 max-sm:w-10 max-sm:px-0'} h-10 shrink-0 gap-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30`}><Plus size={16} /><span className={compactToolbarActions ? 'sr-only' : 'max-sm:sr-only'}>{t.admin.addAutomationRule}</span></Button></TooltipTrigger><TooltipContent>{t.admin.addAutomationRule}</TooltipContent></Tooltip>
  </div>}</div>
    {error ? <TableErrorState title={t.admin.automationRulesLoadFailed} retryLabel={t.common.retry} onRetry={load} /> : !rules || !archivedRules ? <TableSkeleton rows={4} columns={2} /> : lifecycleView === 'archived' ? <ArchivedRuleList rules={archivedRules} labels={labels} locale={lang === 'fr' ? 'fr-FR' : 'en-US'} canEdit={canEdit} restoringId={savingId.startsWith('restore:') ? savingId.slice(8) : ''} onRestore={restoreRule} onHistory={setRunsRule} t={t}/> : <AutomationCanvasView canvasRef={canvasRef} width={canvasWidth} height={canvasHeight} boardName={boardName} groups={canvasGroups} positions={positions} rootPosition={rootPosition} groupPositions={groupPositions} locale={lang === 'fr' ? 'fr-FR' : 'en-US'} canMove={canEdit} openRecipientsId={openRecipientsRuleId} openMenuId={openMenuRuleId} emptyState={rules.length === 0 ? <div className="absolute left-1/2 top-[270px] w-[360px] -translate-x-1/2 rounded-xl border border-dashed border-white/10 bg-black/15 p-8 text-center"><Workflow className="mx-auto text-white/20" size={28} /><p className="mt-3 font-semibold text-white/65">{t.admin.noAutomationRules}</p><p className="mt-1 text-sm leading-6 text-white/35">{t.admin.noAutomationRulesDescription}</p></div> : null} labels={{ rootKind: linkedEvent ? t.admin.eventLinked : t.admin.standalone, rules: t.admin.automationRules, instances: t.admin.automationInstances, validationIssues: t.admin.automationValidationIssueCount, executedProgress: t.admin.automationExecutedProgress, moveNode: t.admin.moveAutomationNode, recipients: t.admin.automationRecipients, noRecipients: t.admin.automationNoResolvedRecipients, viewRecipients: t.admin.automationViewRecipients, hideRecipients: t.admin.automationHideRecipients, actions: t.common.actions }} onRootPointerDown={(event) => startStructuralDrag(event, 'root', rootPosition)} onGroupPointerDown={(event, group) => startStructuralDrag(event, `group:${group.key}`, groupPositions[group.key as RuleType])} onNodePointerDown={(event, node) => { const rule = rules.find((item) => item.id === node.id); if (rule) startDrag(event, rule); }} onRecipientsToggle={(node) => { setOpenMenuRuleId(null); setOpenRecipientsRuleId((current) => current === node.id ? null : node.id); }} onMenuToggle={(node) => { setOpenRecipientsRuleId(null); setOpenMenuRuleId((current) => current === node.id ? null : node.id); }} />}
    {editor && <RuleEditor draft={editor} labels={labels} emailAvailability={deliveryAvailability?.channels.email ?? { available: false, reason: 'UNKNOWN' }} validation={editorValidation} validating={validatingEditor} saving={Boolean(savingId)} onChange={setEditor} onCancel={() => setEditor(null)} onSaveDraft={saveEditorDraft} onPublish={publishEditor} t={t} />}
    {runsRule && <AutomationRunsDrawer boardId={boardId} rule={runsRule} ruleLabel={labels[runsRule.type]} emailAvailability={deliveryAvailability?.channels.email ?? { available: false, reason: 'UNKNOWN' }} onClose={() => setRunsRule(null)} onTested={() => void load()} onRuleChanged={(nextRule) => { setRunsRule(nextRule); void load(); }} />}
    {presetDialogOpen && <SaveAutomationPresetDialog
      boardId={boardId}
      disabledRuleCount={(rules ?? []).filter((rule) => !rule.enabled).length}
      onClose={() => setPresetDialogOpen(false)}
      t={t}
    />}
    <ConfirmDialog open={Boolean(deleteRule)} title={t.admin.automationArchiveRuleQuestion} description={t.admin.automationArchiveRuleDescription} confirmLabel={t.admin.automationArchiveRule} cancelLabel={t.common.cancel} loading={Boolean(deleteRule && savingId === deleteRule.id)} onConfirm={archiveRule} onCancel={() => setDeleteRule(null)} /></section>;
}

function AutomationRulePicker({ value, options, onChange, ariaLabel, categoryLabels }: { value: RuleType; options: AutomationRulePickerOption[]; onChange: (value: RuleType) => void; ariaLabel: string; categoryLabels: Record<AutomationRulePickerCategory, string> }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.type === value) ?? options[0];
  const categories: AutomationRulePickerCategory[] = ['due-date', 'work-health', 'automation'];
  const SelectedIcon = selected.icon;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', closeOnPointerDown);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnPointerDown);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    const positionMenu = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const viewportPadding = 8;
      const width = Math.min(400, window.innerWidth - viewportPadding * 2);
      const measuredHeight = menuRef.current?.offsetHeight ?? 560;
      const spaceBelow = window.innerHeight - trigger.bottom - 12;
      const spaceAbove = trigger.top - 12;
      const placeAbove = spaceBelow < Math.min(measuredHeight, 420) && spaceAbove > spaceBelow;
      const availableHeight = Math.max(96, Math.min(window.innerHeight - viewportPadding * 2, placeAbove ? spaceAbove : spaceBelow));
      const height = Math.min(measuredHeight, availableHeight);
      setMenuStyle({
        position: 'fixed',
        left: Math.max(viewportPadding, Math.min(trigger.right - width, window.innerWidth - width - viewportPadding)),
        top: placeAbove ? Math.max(viewportPadding, trigger.top - height - 8) : Math.min(trigger.bottom + 8, window.innerHeight - height - viewportPadding),
        width,
        maxHeight: availableHeight,
        visibility: 'visible',
      });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  return <div ref={rootRef} className="w-full min-w-0 basis-full sm:min-w-[12rem] sm:max-w-[320px] sm:flex-1 sm:basis-[14rem]">
    <button ref={triggerRef} type="button" title={selected.title} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }} className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 text-left text-sm font-semibold text-white/82 shadow-lg shadow-black/10 transition hover:border-accent/35 hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">
      <SelectedIcon className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">{selected.title}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-white/45 transition ${open ? 'rotate-180 text-accent' : ''}`} />
    </button>
    {open && createPortal(<div ref={menuRef} role="listbox" aria-label={ariaLabel} style={menuStyle} className="chat-scrollbar z-[220] overflow-y-auto rounded-xl border border-white/10 bg-[#07100b]/[0.98] p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
      {categories.map((category, categoryIndex) => <section key={category} aria-labelledby={`automation-rule-category-${category}`} className={categoryIndex ? 'mt-1 border-t border-white/[0.06] pt-1' : ''}>
        <h3 id={`automation-rule-category-${category}`} className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/65">{categoryLabels[category]}</h3>
        <div className="space-y-0.5">{options.filter((option) => option.category === category).map((option) => {
          const active = option.type === value;
          const Icon = option.icon;
          return <button key={option.type} type="button" role="option" aria-selected={active} onClick={() => { onChange(option.type); setOpen(false); triggerRef.current?.focus(); }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30 ${active ? 'bg-accent/[0.11] text-white' : 'text-white/72 hover:bg-white/[0.05] hover:text-white'}`}>
            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${active ? 'border-accent/25 bg-accent/[0.08] text-accent' : 'border-white/[0.08] bg-white/[0.035] text-white/48'}`}><Icon size={16} /></span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold leading-5">{option.title}</span><span className="rounded-full border border-white/[0.08] bg-black/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/35">{categoryLabels[category]}</span></span><span className="mt-0.5 block text-xs leading-5 text-white/42">{option.description}</span></span>
            {active && <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />}
          </button>;
        })}</div>
      </section>)}
    </div>, document.body)}
  </div>;
}

function ArchivedRuleList({ rules, labels, locale, canEdit, restoringId, onRestore, onHistory, t }: { rules: Rule[]; labels: Record<RuleType, string>; locale: string; canEdit: boolean; restoringId: string; onRestore: (rule: Rule) => void; onHistory: (rule: Rule) => void; t: ReturnType<typeof useI18n>['t'] }) {
  if (!rules.length) return <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-10 text-center"><Archive className="mx-auto text-white/20" size={26}/><p className="mt-3 font-semibold text-white/58">{t.admin.automationNoArchivedRules}</p></div>;
  return <div className="grid gap-3 lg:grid-cols-2">{rules.map((rule) => <article key={rule.id} className="rounded-xl border border-white/[0.08] bg-black/15 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[10px] font-semibold text-white/45">{t.admin.automationArchived}</span>{rule.staleDraft && <span className="rounded-full border border-amber-200/15 bg-amber-300/[0.05] px-2 py-0.5 text-[10px] font-semibold text-amber-100/70">{t.admin.automationDraftStale}</span>}</div><h3 className="mt-2 truncate text-sm font-semibold text-white/75">{rule.name || labels[rule.type]}</h3><p className="mt-1 text-xs text-white/35">{labels[rule.type]}</p></div><Archive className="shrink-0 text-white/22" size={18}/></div><dl className="mt-4 space-y-2 text-xs"><LifecycleRow label={t.admin.automationArchivedAt} value={rule.archivedAt ? formatDate(rule.archivedAt, locale) : t.common.empty}/>{rule.archivedBy && <LifecycleRow label={t.admin.automationArchivedBy} value={rule.archivedBy.name}/>}<LifecycleRow label={t.admin.automationLastLiveRun} value={rule.lastLiveRunAt ? formatDate(rule.lastLiveRunAt, locale) : t.common.empty}/>{rule.createdFromPreset && <LifecycleRow label={t.admin.automationCreatedFromPreset} value={rule.createdFromPreset.name}/>}</dl>{rule.archiveReason && <p className="mt-3 text-xs leading-5 text-white/38">{rule.archiveReason}</p>}<div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3"><button type="button" onClick={() => onHistory(rule)} className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-white/55 hover:bg-white/[0.05] hover:text-white"><History size={13}/>{t.admin.automationHistory}</button>{canEdit && <LoadingButton loading={restoringId === rule.id} loadingLabel={t.common.loading} onClick={() => onRestore(rule)} className="h-9 px-3 text-xs"><RotateCcw size={13}/>{t.admin.automationRestoreRule}</LoadingButton>}</div></article>)}</div>;
}

function LifecycleRow({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><dt className="text-white/30">{label}</dt><dd className="text-right text-white/55">{value}</dd></div>; }

function SaveAutomationPresetDialog({ boardId, disabledRuleCount, onClose, t }: { boardId: string; disabledRuleCount: number; onClose: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [includeDisabledRules, setIncludeDisabledRules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', close); };
  }, [onClose, saving]);
  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-presets/save`, { method: 'POST', body: JSON.stringify({ name, description: description || null, includeDisabledRules }) });
      toast.success(t.admin.automationPresetCreated);
      onClose();
    } catch {
      toast.error(t.admin.automationPresetCreateFailed);
    } finally {
      setSaving(false);
    }
  }
  if (!mounted) return null;
  return createPortal(<div className="fixed inset-0 z-[230] grid h-dvh place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-md"><section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-xl border border-white/10 bg-[#08120e] p-5 shadow-2xl shadow-black/60 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">{t.admin.saveAsAutomationPreset}</h2><p className="mt-1 text-sm leading-6 text-white/42">{t.admin.saveAsAutomationPresetDescription}</p></div><button type="button" onClick={onClose} disabled={saving} aria-label={t.common.close} className="grid h-9 w-9 place-items-center rounded-full text-white/45 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"><X size={16}/></button></div><div className="mt-5 space-y-4"><label className="block"><span className="text-sm text-white/65">{t.admin.automationPresetName}</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-accent/50"/></label><label className="block"><span className="text-sm text-white/65">{t.admin.automationPresetDescription}</span><textarea value={description} maxLength={500} rows={3} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/50"/></label>{disabledRuleCount > 0 && <label className="flex cursor-pointer items-center gap-2 text-sm text-white/55"><input type="checkbox" checked={includeDisabledRules} onChange={(event) => setIncludeDisabledRules(event.target.checked)} className="accent-emerald-400"/>{t.admin.includeDisabledAutomationRules}</label>}</div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-full border border-white/10 px-4 text-sm font-semibold text-white/60 hover:bg-white/[0.06] disabled:opacity-40">{t.common.cancel}</button><LoadingButton loading={saving} loadingLabel={t.common.loading} disabled={!name.trim()} onClick={save}>{t.admin.saveAsAutomationPreset}</LoadingButton></div></section></div>, document.body);
}

function RuleEditor({ draft, labels, emailAvailability, validation, validating, saving, onChange, onCancel, onSaveDraft, onPublish, t }: { draft: RuleDraft; labels: Record<RuleType, string>; emailAvailability: DeliveryAvailability['channels']['email']; validation: AutomationValidationResult | null; validating: boolean; saving: boolean; onChange: (draft: RuleDraft) => void; onCancel: () => void; onSaveDraft: () => void; onPublish: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  const [mounted, setMounted] = useState(false);
  const config = draft.config;
  const valid = ruleDraftValid(draft, emailAvailability.available);
  const structurallyValid = draftStructurallyValid(draft);
  const patch = (key: string, value: unknown) => onChange({ ...draft, config: { ...config, [key]: value } });

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', close); };
  }, [onCancel, saving]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[210] grid h-dvh place-items-center overflow-y-auto px-4 py-6 backdrop-blur-md sm:py-8">
      <button type="button" aria-label={t.common.close} onClick={() => { if (!saving) onCancel(); }} className="absolute inset-0 h-full w-full bg-black/80 backdrop-blur-md" />
      <section role="dialog" aria-modal="true" aria-labelledby="automation-rule-dialog-title" className="chat-scrollbar relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#06110d] p-6 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent/65">{draft.id ? t.common.edit : t.admin.addAutomationRule}</p>{draft.hasDraft && <span className="rounded-full border border-amber-200/15 bg-amber-300/[0.06] px-2 py-0.5 text-[10px] font-semibold text-amber-100/70">{t.admin.automationDraft}</span>}</div><h3 id="automation-rule-dialog-title" className="mt-1 text-lg font-semibold text-white">{labels[draft.type]}</h3></div><button type="button" aria-label={t.common.close} onClick={onCancel} disabled={saving} className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40"><X size={15} /></button></div>
        <div className="mt-5 space-y-4">
          <CheckField label={draft.enabled ? t.admin.automationEnabled : t.admin.automationDisabled} checked={draft.enabled} onChange={(enabled) => onChange({ ...draft, enabled })}/>
          {(draft.type === 'DUE_BEFORE' || draft.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') && <label className="block text-sm text-white/60">{t.admin.automationSendReminder}<span className="mt-2 flex items-center gap-2"><input type="number" min={1} max={720} value={Number(config.hoursBeforeDue ?? 24)} onChange={(event) => patch('hoursBeforeDue', Number(event.target.value))} className="h-10 w-24 rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-accent/50"/><span>{t.admin.automationHoursBeforeDue}</span></span></label>}
          {draft.type === 'STALE_TASK_FOLLOW_UP' && <label className="block text-sm text-white/60">{t.admin.automationInactiveFor}<span className="mt-2 flex items-center gap-2"><input type="number" min={1} max={30} value={Number(config.inactiveDays ?? 3)} onChange={(event) => patch('inactiveDays', Number(event.target.value))} className="h-10 w-24 rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-accent/50"/><span>{t.admin.automationDays}</span></span></label>}
          {draft.type === 'OVERDUE_ESCALATION' && <label className="block text-sm text-white/60">{t.admin.automationEscalateAfter}<span className="mt-2 flex items-center gap-2"><input type="number" min={1} max={30} value={Number(config.graceDays ?? 2)} onChange={(event) => patch('graceDays', Number(event.target.value))} className="h-10 w-24 rounded-lg border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-accent/50"/><span>{t.admin.automationDaysOverdue}</span></span></label>}
          {draft.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE' && <CheckField label={t.admin.automationRequireChecklist} checked={config.requireChecklistItems !== false} onChange={(value) => patch('requireChecklistItems', value)}/>}
          {isNotificationRule(draft.type) && <div><p className="text-sm text-white/60">{t.admin.automationRecipients}</p><CheckField label={t.admin.automationAssignees} checked={config.notifyAssignees === true} onChange={(value) => patch('notifyAssignees', value)}/><CheckField label={t.admin.automationAdmins} checked={config.notifyAdmins === true} onChange={(value) => patch('notifyAdmins', value)}/>{(draft.type === 'OVERDUE' || draft.type === 'OVERDUE_ESCALATION') && <CheckField label={t.admin.automationRepeatDaily} checked={config.repeatDaily === true} onChange={(value) => patch('repeatDaily', value)}/>}</div>}
          {isNotificationRule(draft.type) && <DeliveryFields
            config={config}
            emailAvailability={emailAvailability}
            allowUnavailableEmail={Boolean(draft.id)}
            onChange={(nextDelivery) => patch('delivery', nextDelivery)}
            t={t}
          />}
          {draft.type === 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE' && <CheckField label={t.admin.automationRequireChecklist} checked={config.requireAtLeastOneChecklistItem !== false} onChange={(value) => patch('requireAtLeastOneChecklistItem', value)}/>}
          {draft.type === 'FLAG_UNASSIGNED' && <CheckField label={t.admin.automationShowUnassigned} checked={config.includeInOverview !== false} onChange={(value) => patch('includeInOverview', value)}/>}
        </div>
        <ValidationSummary validation={validation} validating={validating} t={t}/>
        <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-full border border-white/10 px-4 text-sm font-semibold text-white/60 hover:bg-white/[0.06] disabled:opacity-40">{t.common.cancel}</button>{draft.id && <button type="button" onClick={onSaveDraft} disabled={!structurallyValid || saving} className="h-10 rounded-full border border-accent/20 bg-accent/[0.06] px-4 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40">{t.admin.automationSaveDraft}</button>}<LoadingButton loading={saving} loadingLabel={t.common.loading} disabled={!valid || validation?.valid === false || validating || saving} onClick={onPublish}>{draft.id ? t.admin.automationPublishNow : t.admin.saveAutomationRule}</LoadingButton></div>
      </section>
    </div>,
    document.body,
  );
}

function ValidationSummary({ validation, validating, t }: { validation: AutomationValidationResult | null; validating: boolean; t: ReturnType<typeof useI18n>['t'] }) {
  return <section className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center gap-2"><h4 className="text-sm font-semibold text-white/72">{t.admin.automationRuleCheck}</h4>{validating && <Loader2 className="animate-spin text-white/35" size={14}/>}</div>{validating && !validation ? <p className="mt-2 text-xs text-white/38">{t.admin.automationValidatingRule}</p> : validation && validation.items.length > 0 ? <div className="mt-3 space-y-2">{validation.items.map((item) => <div key={`${item.code}-${item.field ?? ''}`} className={`flex items-start gap-2 text-xs leading-5 ${item.severity === 'ERROR' ? 'text-rose-100/80' : item.severity === 'WARNING' ? 'text-amber-100/75' : 'text-sky-100/65'}`}>{item.severity === 'ERROR' || item.severity === 'WARNING' ? <AlertTriangle className="mt-0.5 shrink-0" size={13}/> : <Info className="mt-0.5 shrink-0" size={13}/>}<span>{automationValidationMessage(item.code, t)}</span></div>)}</div> : validation ? <div className="mt-2 flex items-center gap-2 text-xs text-accent/70"><Check size={13}/><span>{t.admin.automationRuleConfigurationValid}</span></div> : <p className="mt-2 text-xs text-amber-100/60">{t.admin.automationRuleCheckUnavailable}</p>}</section>;
}

function DeliveryFields({ config, emailAvailability, allowUnavailableEmail = false, onChange, t }: { config: Record<string, unknown>; emailAvailability: DeliveryAvailability['channels']['email']; allowUnavailableEmail?: boolean; onChange: (delivery: ReturnType<typeof deliveryConfig>) => void; t: ReturnType<typeof useI18n>['t'] }) {
  const delivery = deliveryConfig(config.delivery);
  const setChannel = (channel: 'inApp' | 'email', checked: boolean) => onChange({ ...delivery, channels: { ...delivery.channels, [channel]: checked } });
  return <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><h4 className="text-sm font-semibold text-white/75">{t.admin.automationDelivery}</h4><p className="mt-1 text-xs leading-5 text-white/38">{t.admin.automationDeliveryDescription}</p><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{t.admin.automationChannels}</p><div className="mt-2 space-y-2"><div className="rounded-lg border border-accent/15 bg-accent/[0.04] p-3"><CheckField label={t.admin.automationInAppNotification} checked={delivery.channels.inApp} disabled={!emailAvailability.available && !allowUnavailableEmail} onChange={(checked) => setChannel('inApp', checked)}/><p className="ml-5 mt-1 text-xs text-white/35">{t.admin.automationInAppDescription}</p></div><div className={`rounded-lg border p-3 ${emailAvailability.available || allowUnavailableEmail ? 'border-accent/15 bg-accent/[0.04]' : 'border-white/[0.07] bg-black/10 opacity-65'}`}><CheckField label={t.admin.automationEmailNotification} checked={delivery.channels.email} disabled={!emailAvailability.available && !allowUnavailableEmail} onChange={(checked) => setChannel('email', checked)}/><p className="ml-5 mt-1 text-xs text-white/32">{emailAvailability.available ? t.admin.automationEmailEnabledDescription : smtpAvailabilityCopy(emailAvailability.reason, t)}</p></div></div><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{t.admin.automationBehavior}</p><CheckField label={t.admin.automationIncludeDeepLink} checked={delivery.includeDeepLink} onChange={(includeDeepLink) => onChange({ ...delivery, includeDeepLink })}/><CheckField label={t.admin.automationAvoidDuplicates} checked disabled onChange={() => undefined}/></section>;
}

function CheckField({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) { return <label className={`mt-2 flex items-center gap-2 text-sm text-white/55 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="accent-emerald-400"/>{label}</label>; }
function ruleStatus(rule: Rule, t: ReturnType<typeof useI18n>['t'], executionStopped = false) { if (executionStopped) return { label: t.admin.automationStatusStopped, tone: 'app-status-warning' }; if (!rule.enabled) return { label: t.admin.automationStatusDisabled, tone: 'app-status-neutral' }; if (rule.lastRunStatus === 'SUCCESS') return { label: t.admin.automationSuccess, tone: 'app-status-success' }; if (rule.lastRunStatus === 'FAILED') return { label: t.admin.automationFailed, tone: 'app-status-danger' }; if (rule.lastRunStatus === 'SKIPPED') return { label: t.admin.automationSkipped, tone: 'app-status-warning' }; if (isNotificationRule(rule.type)) return { label: t.admin.automationStatusScheduled, tone: 'app-status-info' }; return { label: t.admin.automationNeverRun, tone: 'app-status-neutral' }; }
function ruleSummary(rule: Rule, t: ReturnType<typeof useI18n>['t']) { if (rule.type === 'DUE_BEFORE') return `${Number(rule.config.hoursBeforeDue ?? 24)}h ${t.admin.automationBeforeDueShort}`; if (rule.type === 'OVERDUE') return rule.config.repeatDaily === true ? t.admin.automationOverdueDaily : t.admin.automationOverdueOnce; if (rule.type === 'STALE_TASK_FOLLOW_UP') return t.admin.automationInactiveDaysShort(Number(rule.config.inactiveDays ?? 3)); if (rule.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return t.admin.automationChecklistDueShort(Number(rule.config.hoursBeforeDue ?? 24)); if (rule.type === 'OVERDUE_ESCALATION') return t.admin.automationEscalationDaysShort(Number(rule.config.graceDays ?? 2)); if (rule.type === 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE') return t.admin.automationChecklistCompleteShort; return t.admin.automationUnassignedShort; }
function resolvedRecipients(rule: Rule, assignees: BoardAssignee[], administrators: AutomationRecipient[]) {
  if (!isNotificationRule(rule.type)) return [];
  const recipients = new Map<string, AutomationRecipient>();
  if (rule.config.notifyAssignees === true) assignees.forEach((assignee) => recipients.set(assignee.id, { ...assignee, source: 'ASSIGNEE' }));
  if (rule.config.notifyAdmins === true) administrators.forEach((administrator) => {
    const existing = recipients.get(administrator.id);
    if (!existing || recipientSourceRank(administrator.source) > recipientSourceRank(existing.source)) recipients.set(administrator.id, administrator);
  });
  return Array.from(recipients.values()).sort((left, right) => recipientSourceRank(right.source) - recipientSourceRank(left.source) || left.name.localeCompare(right.name));
}
function recipientSourceRank(source: AutomationRecipientSource) { return source === 'OWNER' ? 3 : source === 'ADMIN' ? 2 : 1; }
function recipientSourceLabel(source: AutomationRecipientSource, t: ReturnType<typeof useI18n>['t']) { if (source === 'OWNER') return t.admin.automationRecipientOwner; if (source === 'ADMIN') return t.admin.automationRecipientAdmin; return t.admin.automationRecipientAssignee; }
function validationIssues(validation?: AutomationValidationResult) { return validation?.items.filter((item) => item.severity === 'ERROR' || item.severity === 'WARNING') ?? []; }
function ruleDraftValid(draft: RuleDraft, emailAvailable: boolean) { const delivery = deliveryConfig(draft.config.delivery); const channelValid = delivery.channels.inApp || (delivery.channels.email && emailAvailable); if (!isNotificationRule(draft.type)) return true; return draftStructurallyValid(draft) && (draft.config.notifyAssignees === true || draft.config.notifyAdmins === true) && channelValid; }
function draftStructurallyValid(draft: RuleDraft) { if (draft.type === 'DUE_BEFORE' || draft.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') { const hours = Number(draft.config.hoursBeforeDue); return Number.isInteger(hours) && hours >= 1 && hours <= 720; } if (draft.type === 'STALE_TASK_FOLLOW_UP') { const days = Number(draft.config.inactiveDays); return Number.isInteger(days) && days >= 1 && days <= 30; } if (draft.type === 'OVERDUE_ESCALATION') { const days = Number(draft.config.graceDays); return Number.isInteger(days) && days >= 1 && days <= 30; } return true; }
function isNotificationRule(type: RuleType) { return type === 'DUE_BEFORE' || type === 'OVERDUE' || type === 'STALE_TASK_FOLLOW_UP' || type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE' || type === 'OVERDUE_ESCALATION'; }
function defaultDelivery() { return { channels: { inApp: true, email: false }, includeDeepLink: true, dedupeEnabled: true }; }
function deliveryConfig(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultDelivery(); const delivery = value as Record<string, unknown>; const channels = delivery.channels && typeof delivery.channels === 'object' && !Array.isArray(delivery.channels) ? delivery.channels as Record<string, unknown> : {}; return { channels: { inApp: channels.inApp !== false, email: channels.email === true }, includeDeepLink: delivery.includeDeepLink !== false, dedupeEnabled: true }; }
function smtpAvailabilityCopy(reason: DeliveryAvailability['channels']['email']['reason'], t: ReturnType<typeof useI18n>['t']) { if (reason === 'SMTP_DISABLED') return t.admin.automationSmtpDisabled; if (reason === 'MISSING_FROM_ADDRESS') return t.admin.automationMissingSender; return t.admin.automationSmtpNotConfigured; }
