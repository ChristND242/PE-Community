'use client';

import { ArrowLeft, Ban, Download, Mail, RotateCcw, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '../../../../components/shell';
import { Card, ConfirmDialog, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n';
import { PERMISSIONS, hasPermission } from '../../../../lib/permissions';
import { formatDate } from '../../../../lib/utils';

type Attempt = { id: string; status: string; providerMessageId?: string | null; errorMessage?: string | null; attemptedAt: string };
type Recipient = { id: string; email: string; name?: string | null; status: string; errorMessage?: string | null; sentAt?: string | null; createdAt: string; attempts: Attempt[] };
type Campaign = {
  id: string;
  type: string;
  subject: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  canceledCount?: number;
  createdAt: string;
  sentAt?: string | null;
  lastErrorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  recipients: Recipient[];
  attempts: Attempt[];
};
type CurrentUser = { role: string; permissions?: string[] };

export default function EmailCampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { lang, t } = useI18n();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [confirming, setConfirming] = useState<'retry' | 'cancel' | null>(null);
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'failed'>('all');
  const [testRecipient, setTestRecipient] = useState('');

  async function load() {
    setError('');
    try {
      const [user, campaignData] = await Promise.all([
        apiFetch<CurrentUser>('/auth/me'),
        apiFetch<Campaign>(`/admin/${COMMUNITY_ID}/emails/campaigns/${campaignId}`),
      ]);
      setCurrentUser(user);
      setCampaign(campaignData);
    } catch {
      setError(t.admin.emailCampaignLoadFailed);
    }
  }

  useEffect(() => { load(); }, [campaignId, t.admin.emailCampaignLoadFailed]);

  async function runAction(action: 'retry' | 'cancel' | 'resend' | 'export') {
    if (!campaign || busyAction) return;
    setBusyAction(action);
    try {
      if (action === 'retry') {
        const result = await apiFetch<{ retried: number }>(`/admin/${COMMUNITY_ID}/emails/campaigns/${campaign.id}/retry-failed`, { method: 'POST' });
        toast.success(t.admin.retryFailedQueued(result.retried));
      }
      if (action === 'cancel') {
        const result = await apiFetch<{ canceled: number }>(`/admin/${COMMUNITY_ID}/emails/campaigns/${campaign.id}/cancel`, { method: 'POST' });
        toast.success(t.admin.campaignCanceled(result.canceled));
      }
      if (action === 'resend') {
        await apiFetch(`/admin/${COMMUNITY_ID}/emails/campaigns/${campaign.id}/resend-test`, { method: 'POST', body: JSON.stringify({ recipientEmail: testRecipient }) });
        toast.success(t.admin.testEmailQueued);
        setTestRecipient('');
      }
      if (action === 'export') {
        const result = await apiFetch<{ filename: string; csv: string }>(`/admin/${COMMUNITY_ID}/emails/campaigns/${campaign.id}/recipients.csv`);
        const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(t.admin.csvExportReady);
      }
      await load();
    } catch {
      toast.error(t.admin.emailCampaignActionFailed);
    } finally {
      setBusyAction('');
      setConfirming(null);
    }
  }

  const visibleRecipients = campaign?.recipients.filter((recipient) => recipientFilter === 'all' || recipient.status === 'FAILED') ?? [];
  const canRetry = Boolean(campaign && campaign.failedCount > 0 && hasPermission(currentUser, PERMISSIONS.emailRetry));
  const canCancel = Boolean(campaign && ['QUEUED', 'SENDING'].includes(campaign.status) && campaign.pendingCount > 0 && hasPermission(currentUser, PERMISSIONS.emailCancel));
  const canExport = hasPermission(currentUser, PERMISSIONS.emailExport);
  const canResendTest = campaign?.type === 'TEST' && hasPermission(currentUser, PERMISSIONS.emailSend);
  const templateTrace = campaign?.metadata ? emailTemplateTrace(campaign.metadata) : null;

  return (
    <AppShell admin>
      <div className="space-y-6">
        <header className="border-b border-white/10 pb-5">
          <Link href="/admin/emails" className="inline-flex items-center gap-2 text-sm font-semibold text-white/55 transition hover:text-white"><ArrowLeft size={16} />{t.admin.emailDashboard}</Link>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent/90">{t.admin.campaignDetails}</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">{campaign?.subject ?? t.admin.emailCampaign}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.campaignDetailsSubtitle}</p>
            </div>
            {campaign && <StatusBadge tone={emailStatusTone(campaign.status)}>{emailStatusLabel(t, campaign.status)}</StatusBadge>}
          </div>
        </header>

        {error && <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />}
        {!campaign ? (
          <TableSkeleton rows={8} columns={4} />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={t.admin.recipients} value={campaign.recipientCount} />
              <Metric label={t.admin.sentEmails} value={campaign.sentCount} />
              <Metric label={t.admin.failedEmails} value={campaign.failedCount} />
              <Metric label={t.admin.pendingRecipients} value={campaign.pendingCount} />
            </section>

            {templateTrace && (
              <Card className="rounded-2xl border-white/10 bg-white/[0.035] p-4">
                <div className="flex flex-wrap gap-2 text-sm text-white/62">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{t.admin.sourceAutomation}</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{t.admin.template}: {templateTrace.key}</span>
                  {templateTrace.version && <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{t.admin.templateVersion} v{templateTrace.version}</span>}
                  {templateTrace.locale && <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{t.admin.languages}: {String(templateTrace.locale).toUpperCase()}</span>}
                </div>
              </Card>
            )}

            <Card className="rounded-2xl border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">{t.admin.emailOperations}</h2>
                  <p className="mt-1 text-sm text-white/50">{t.admin.emailOperationsDescription}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canRetry && <LoadingButton loading={busyAction === 'retry'} loadingLabel={t.admin.retryingFailedRecipients} onClick={() => setConfirming('retry')} className="bg-white/10 text-white hover:bg-white/15"><RotateCcw size={16} />{t.admin.retryFailedRecipients}</LoadingButton>}
                  {canCancel && <LoadingButton loading={busyAction === 'cancel'} loadingLabel={t.admin.cancelingCampaign} onClick={() => setConfirming('cancel')} className="bg-white/10 text-white hover:bg-white/15"><Ban size={16} />{t.admin.cancelCampaign}</LoadingButton>}
                  {canExport && <LoadingButton loading={busyAction === 'export'} loadingLabel={t.admin.exportingCsv} onClick={() => runAction('export')} className="bg-white/10 text-white hover:bg-white/15"><Download size={16} />{t.admin.exportRecipientsCsv}</LoadingButton>}
                </div>
              </div>
              {canResendTest && (
                <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-end">
                  <label className="min-w-[16rem] flex-1">
                    <span className="text-sm font-medium text-white/72">{t.admin.testEmailRecipient}</span>
                    <input value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" />
                  </label>
                  <LoadingButton loading={busyAction === 'resend'} loadingLabel={t.admin.sendingTestEmail} disabled={!testRecipient.trim() || busyAction === 'resend'} onClick={() => runAction('resend')}><Send size={16} />{t.admin.resendTestEmail}</LoadingButton>
                </div>
              )}
            </Card>

            {campaign.lastErrorMessage && (
              <Card className="rounded-2xl border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">{campaign.lastErrorMessage}</Card>
            )}

            <Card className="rounded-2xl border-white/10 bg-white/[0.035] p-5">
              <div className="grid gap-4 text-sm md:grid-cols-4">
                <Info label={t.admin.campaignType} value={emailTypeLabel(t, campaign.type)} />
                <Info label={t.common.status} value={emailStatusLabel(t, campaign.status)} />
                <Info label={t.admin.createdAt} value={formatDate(campaign.createdAt, locale)} />
                <Info label={t.admin.sentAt} value={campaign.sentAt ? formatDate(campaign.sentAt, locale) : '-'} />
              </div>
            </Card>

            <Card className="overflow-hidden rounded-2xl border-white/10 bg-white/[0.035] p-0">
              <div className="border-b border-white/10 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white">{t.admin.recipients}</h2>
                    <p className="mt-1 text-sm text-white/50">{t.admin.recipientsDescription}</p>
                  </div>
                  <div className="flex rounded-full border border-white/10 bg-black/20 p-1 text-sm">
                    <button type="button" onClick={() => setRecipientFilter('all')} className={`rounded-full px-3 py-1.5 font-semibold transition ${recipientFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>{t.common.all}</button>
                    <button type="button" onClick={() => setRecipientFilter('failed')} className={`rounded-full px-3 py-1.5 font-semibold transition ${recipientFilter === 'failed' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>{t.admin.failedRecipients}</button>
                  </div>
                </div>
              </div>
              {visibleRecipients.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[940px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42">
                      <tr><th className="px-4 py-3">{t.admin.tableName}</th><th className="px-4 py-3">{t.admin.tableEmail}</th><th className="px-4 py-3">{t.common.status}</th><th className="px-4 py-3">{t.admin.sentAt}</th><th className="px-4 py-3">{t.admin.deliveryAttempts}</th><th className="px-4 py-3">{t.common.errorLabel}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {visibleRecipients.map((recipient) => (
                        <tr key={recipient.id} className="hover:bg-white/[0.025]">
                          <td className="px-4 py-4 font-medium text-white">{recipient.name ?? '-'}</td>
                          <td className="px-4 py-4 text-white/58">{recipient.email}</td>
                          <td className="px-4 py-4"><StatusBadge tone={emailStatusTone(recipient.status)}>{emailStatusLabel(t, recipient.status)}</StatusBadge></td>
                          <td className="px-4 py-4 text-white/58">{recipient.sentAt ? formatDate(recipient.sentAt, locale) : '-'}</td>
                          <td className="px-4 py-4 text-white/58">{recipient.attempts.length}</td>
                          <td className="max-w-sm px-4 py-4 text-rose-100/80">{recipient.errorMessage ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="p-4"><TableEmptyState title={recipientFilter === 'failed' ? t.admin.noFailedRecipients : t.admin.noEmailRecipients} /></div>}
            </Card>

            <Card className="overflow-hidden rounded-2xl border-white/10 bg-white/[0.035] p-0">
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
                <span className="rounded-xl border border-accent/20 bg-accent/10 p-2 text-accent"><Mail size={16} /></span>
                <div><h2 className="text-base font-semibold text-white">{t.admin.deliveryAttempts}</h2><p className="mt-1 text-sm text-white/50">{t.admin.deliveryAttemptsDescription}</p></div>
              </div>
              {campaign.attempts.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42">
                      <tr><th className="px-4 py-3">{t.common.status}</th><th className="px-4 py-3">{t.admin.providerMessageId}</th><th className="px-4 py-3">{t.admin.attemptedAt}</th><th className="px-4 py-3">{t.common.errorLabel}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {campaign.attempts.map((attempt) => (
                        <tr key={attempt.id}>
                          <td className="px-4 py-4"><StatusBadge tone={emailStatusTone(attempt.status)}>{emailStatusLabel(t, attempt.status)}</StatusBadge></td>
                          <td className="px-4 py-4 font-mono text-xs text-white/58">{attempt.providerMessageId ?? '-'}</td>
                          <td className="px-4 py-4 text-white/58">{formatDate(attempt.attemptedAt, locale)}</td>
                          <td className="max-w-md px-4 py-4 text-rose-100/80">{attempt.errorMessage ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="p-4"><TableEmptyState title={t.admin.noDeliveryAttempts} /></div>}
            </Card>
          </>
        )}
        <ConfirmDialog open={confirming === 'retry'} title={t.admin.retryFailedConfirmTitle} description={t.admin.retryFailedConfirmDescription} confirmLabel={t.admin.retryFailedRecipients} cancelLabel={t.common.cancel} loading={busyAction === 'retry'} onConfirm={() => runAction('retry')} onCancel={() => setConfirming(null)} />
        <ConfirmDialog open={confirming === 'cancel'} title={t.admin.cancelCampaignConfirmTitle} description={t.admin.cancelCampaignConfirmDescription} confirmLabel={t.admin.cancelCampaign} cancelLabel={t.common.cancel} loading={busyAction === 'cancel'} onConfirm={() => runAction('cancel')} onCancel={() => setConfirming(null)} />
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card className="rounded-2xl border-white/10 bg-white/[0.04] p-4"><p className="text-sm text-white/55">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></Card>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/35">{label}</p><p className="mt-2 font-medium text-white">{value}</p></div>;
}

function emailStatusTone(status: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'SENT') return 'good';
  if (status === 'FAILED') return 'bad';
  if (status === 'PARTIAL' || status === 'SENDING' || status === 'QUEUED') return 'warn';
  if (status === 'CANCELED') return 'neutral';
  return 'neutral';
}

function emailStatusLabel(t: ReturnType<typeof useI18n>['t'], status: string) {
  const labels: Record<string, string> = { QUEUED: t.admin.emailStatusQueued, SENDING: t.admin.emailStatusSending, SENT: t.admin.emailStatusSent, FAILED: t.admin.emailStatusFailed, PARTIAL: t.admin.emailStatusPartial, PENDING: t.admin.emailStatusPending, CANCELED: t.admin.emailStatusCanceled };
  return labels[status] ?? status;
}

function emailTypeLabel(t: ReturnType<typeof useI18n>['t'], type: string) {
  const labels: Record<string, string> = { TEST: t.admin.emailTypeTest, PASSWORD_RESET: t.admin.emailTypePasswordReset, ANNOUNCEMENT: t.admin.emailTypeAnnouncement, EVENT_ATTENDEES: t.admin.emailTypeEventAttendees, PASSPORT_EXPIRATION: t.admin.emailTypePassportExpiration, TASK_BOARD_AUTOMATION_DUE_BEFORE: t.admin.emailTypeAutomation, TASK_BOARD_AUTOMATION_OVERDUE: t.admin.emailTypeAutomation, TASK_BOARD_AUTOMATION_TEST: t.admin.emailTypeAutomationTest };
  return labels[type] ?? type;
}

function emailTemplateTrace(metadata: Record<string, unknown>) {
  const key = typeof metadata.templateKey === 'string' ? metadata.templateKey : '';
  if (!key) return null;
  return {
    key,
    version: typeof metadata.templateVersion === 'number' ? metadata.templateVersion : null,
    locale: typeof metadata.locale === 'string' ? metadata.locale : null,
  };
}
