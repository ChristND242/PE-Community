'use client';

import { AdminOperationsCalendar } from '../../../components/admin-operations-calendar';
import { AppShell } from '../../../components/shell';
import { useI18n } from '../../../lib/i18n';

export default function AdminOperationsCalendarPage() {
  const { t } = useI18n();
  return (
    <AppShell admin>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.operationsCalendarTitle}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{t.admin.operationsCalendarSubtitle}</p>
        </header>
        <AdminOperationsCalendar />
      </div>
    </AppShell>
  );
}
