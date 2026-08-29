'use client';

import { CalendarDays, CircleHelp, Clock3, MapPin, UserCheck, UserX, Video } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ProfilePhoto } from './profile-photo';
import { Spinner } from './ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '../lib/utils';

export type EventRsvpStatus = 'GOING' | 'MAYBE' | 'DECLINED';

export function eventDescriptionOverflows(scrollHeight: number, clientHeight: number) {
  return scrollHeight > clientHeight + 1;
}

export type EventCardSummary = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  onlineUrl?: string | null;
  capacity?: number | null;
  imageUrl?: string | null;
  imageSource?: 'UPLOAD' | 'EXTERNAL' | null;
  myRsvp: EventRsvpStatus | null;
  rsvpCounts: { going: number; maybe: number; declined: number };
  attendees: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
  }>;
};

export function EventCard({
  event,
  locale,
  timezone,
  labels,
  pendingStatus,
  onRsvp,
}: {
  event: EventCardSummary;
  locale: string;
  timezone: string;
  labels: {
    online: string;
    inPerson: string;
    capacity: string;
    going: string;
    maybe: string;
    declined: string;
    saving: string;
    more: string;
    less: string;
  };
  pendingStatus: EventRsvpStatus | null;
  onRsvp: (status: EventRsvpStatus) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const date = new Date(event.startsAt);
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: timezone }).format(date).toLocaleUpperCase(locale);
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit', timeZone: timezone }).format(date);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(date);
  const visibleAttendees = event.attendees.slice(0, 3);
  const hiddenAttendees = Math.max(0, event.rsvpCounts.going - visibleAttendees.length);

  useEffect(() => setImageFailed(false), [event.imageUrl]);
  useEffect(() => setDescriptionExpanded(false), [event.id, event.description]);
  useEffect(() => {
    const description = descriptionRef.current;
    if (!description || descriptionExpanded) return;
    const measure = () => setDescriptionOverflows(eventDescriptionOverflows(description.scrollHeight, description.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(description);
    return () => observer.disconnect();
  }, [descriptionExpanded, event.description]);

  return (
    <article className="group flex min-h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl shadow-black/10 transition duration-200 hover:border-[rgb(var(--app-accent-rgb)/0.35)] hover:shadow-2xl hover:shadow-black/15">
      <div className="relative aspect-[16/9] overflow-hidden border-b border-[var(--app-border)] bg-[var(--app-panel-muted)]">
        {event.imageUrl && !imageFailed ? (
          <img src={event.imageUrl} alt={event.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--app-panel-muted)] text-[var(--app-muted-foreground)]">
            <CalendarDays size={44} strokeWidth={1.25} aria-hidden="true" />
          </div>
        )}
        <div className="absolute left-4 top-4 grid min-w-14 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-dialog)] px-2.5 py-2 text-center shadow-lg shadow-black/20 backdrop-blur">
          <span className="text-[10px] font-bold uppercase text-[var(--app-accent)]">{month}</span>
          <span className="text-xl font-semibold leading-none text-[var(--app-foreground)]">{day}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <span className="app-status-info w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase">
          {event.onlineUrl ? labels.online : labels.inPerson}
        </span>
        <Link href={`/dashboard/events/${event.id}`} className="mt-3 line-clamp-2 text-lg font-semibold text-[var(--app-foreground)] transition hover:text-[var(--app-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent-rgb)/0.35)]">
          {event.title}
        </Link>
        <p ref={descriptionRef} id={`event-description-${event.id}`} className={cn('mt-2 min-h-[4.5rem] text-sm leading-6 text-[var(--app-muted-foreground)]', !descriptionExpanded && 'line-clamp-3')}>{event.description}</p>
        {descriptionOverflows ? <button type="button" aria-expanded={descriptionExpanded} aria-controls={`event-description-${event.id}`} onClick={() => setDescriptionExpanded((expanded) => !expanded)} className="mt-1 w-fit cursor-pointer text-sm font-medium text-[var(--app-accent)] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent-rgb)/0.35)]">{descriptionExpanded ? labels.less : labels.more}</button> : null}

        <div className="mt-4 space-y-2 text-sm text-[var(--app-muted-foreground)]">
          <span className="flex items-start gap-2"><Clock3 className="mt-0.5 shrink-0" size={15} aria-hidden="true" /><span>{dateTime} · {timezone}</span></span>
          <span className="flex items-start gap-2">{event.onlineUrl ? <Video className="mt-0.5 shrink-0" size={15} aria-hidden="true" /> : <MapPin className="mt-0.5 shrink-0" size={15} aria-hidden="true" />}<span className="line-clamp-2">{event.onlineUrl ? labels.online : event.location}</span></span>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
          <div className="min-w-0">
            <div className="flex items-center">
              {visibleAttendees.map((attendee, index) => (
                <ProfilePhoto key={attendee.id} name={attendee.name} avatarUrl={attendee.avatarUrl} dicebearStyle={attendee.dicebearStyle} dicebearSeed={attendee.dicebearSeed} size="sm" className={cn('h-8 w-8 rounded-full border-2 border-[var(--app-panel)]', index > 0 && '-ml-2')} />
              ))}
              {hiddenAttendees > 0 && <span className="-ml-2 grid h-8 min-w-8 place-items-center rounded-full border-2 border-[var(--app-panel)] bg-[var(--app-panel-muted)] px-1.5 text-[10px] font-semibold text-[var(--app-foreground)]">+{hiddenAttendees}</span>}
              {event.rsvpCounts.going === 0 && <span className="text-xs text-[var(--app-muted-foreground)]">0 {labels.going}</span>}
            </div>
            {event.rsvpCounts.going > 0 && <p className="mt-1.5 text-xs text-[var(--app-muted-foreground)]">{event.rsvpCounts.going} {labels.going}</p>}
            {event.capacity ? <p className="mt-1 text-[11px] text-[var(--app-muted-foreground)]">{labels.capacity}: {event.capacity}</p> : null}
          </div>
          <EventRsvpControls current={event.myRsvp} pending={pendingStatus} labels={{ going: labels.going, maybe: labels.maybe, declined: labels.declined, saving: labels.saving }} onSelect={onRsvp} />
        </div>
      </div>
    </article>
  );
}

export function EventRsvpControls({ current, pending, labels, onSelect }: {
  current: EventRsvpStatus | null;
  pending: EventRsvpStatus | null;
  labels: { going: string; maybe: string; declined: string; saving: string };
  onSelect: (status: EventRsvpStatus) => void;
}) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1" aria-label="RSVP">
        <RsvpAction status="GOING" selected={current === 'GOING'} pending={pending === 'GOING'} disabled={pending !== null} label={labels.going} savingLabel={labels.saving} onSelect={onSelect} />
        <RsvpAction status="MAYBE" selected={current === 'MAYBE'} pending={pending === 'MAYBE'} disabled={pending !== null} label={labels.maybe} savingLabel={labels.saving} onSelect={onSelect} />
        <RsvpAction status="DECLINED" selected={current === 'DECLINED'} pending={pending === 'DECLINED'} disabled={pending !== null} label={labels.declined} savingLabel={labels.saving} onSelect={onSelect} />
      </div>
    </TooltipProvider>
  );
}

function RsvpAction({ status, selected, pending, disabled, label, savingLabel, onSelect }: {
  status: EventRsvpStatus;
  selected: boolean;
  pending: boolean;
  disabled: boolean;
  label: string;
  savingLabel: string;
  onSelect: (status: EventRsvpStatus) => void;
}) {
  const Icon = status === 'GOING' ? UserCheck : status === 'MAYBE' ? CircleHelp : UserX;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={pending ? savingLabel : label}
          aria-pressed={selected}
          disabled={disabled}
          onClick={() => onSelect(status)}
          className={cn(
            'grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-[var(--app-border)] bg-transparent text-[var(--app-muted-foreground)] transition hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent-rgb)/0.35)] disabled:cursor-not-allowed disabled:opacity-45',
            selected && status === 'GOING' && 'app-status-success',
            selected && status === 'MAYBE' && 'app-status-warning',
            selected && status === 'DECLINED' && 'app-status-neutral',
          )}
        >
          {pending ? <Spinner className="h-4 w-4" /> : <Icon size={17} aria-hidden="true" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
