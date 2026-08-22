import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string, locale?: string, timezone?: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezoneValue(timezone ?? communityTimezone()) }).format(new Date(value));
}

export function formatDashboardDate(value: string | Date, locale: string, timezone = 'UTC') {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezoneValue(timezone) ?? 'UTC',
  }).format(value instanceof Date ? value : new Date(value));
}

function communityTimezone() {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem('pe-community-timezone') || undefined;
}

function timezoneValue(value?: string) {
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}
