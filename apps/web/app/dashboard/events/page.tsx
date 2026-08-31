'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EventBrowseView } from '../../../components/event-browse-view';
import { MemberEventsCalendar } from '../../../components/member-events-calendar';
import { AppShell } from '../../../components/shell';
import { TableSkeleton } from '../../../components/ui';
import { useI18n } from '../../../lib/i18n';

type MemberEventsView = 'events' | 'calendar';

export default function EventsPage() {
  return <Suspense fallback={<EventsPageFallback />}><EventsPageContent /></Suspense>;
}

function EventsPageContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedView: MemberEventsView = searchParams.get('view') === 'calendar' ? 'calendar' : 'events';

  function selectView(view: MemberEventsView) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('view', view);
    router.replace(`/dashboard/events?${next.toString()}`, { scroll: false });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.dashboard.eventsTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.dashboard.eventDetails}</p>
        </header>
        <MemberEventsTabs selectedView={selectedView} onChange={selectView} />
        <div hidden={selectedView !== 'events'}><EventBrowseView /></div>
        {selectedView === 'calendar' ? <MemberEventsCalendar /> : null}
      </div>
    </AppShell>
  );

}

function EventsPageFallback() {
  return <AppShell><div className="space-y-6"><TableSkeleton rows={6} columns={3} /></div></AppShell>;
}

function MemberEventsTabs({ selectedView, onChange }: { selectedView: MemberEventsView; onChange: (view: MemberEventsView) => void }) {
  const { t } = useI18n();
  const views = [
    { key: 'events' as const, label: t.dashboard.eventsTitle },
    { key: 'calendar' as const, label: t.dashboard.mySchedule },
  ];
  return (
    <nav aria-label={t.dashboard.eventsTitle} className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
      {views.map((view) => {
        const active = selectedView === view.key;
        return <button key={view.key} type="button" onClick={() => onChange(view.key)} aria-pressed={active} className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${active ? 'bg-accent/15 text-accent' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'}`}>{view.label}</button>;
      })}
    </nav>
  );
}
