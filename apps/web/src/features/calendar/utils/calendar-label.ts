import { t } from '@macro/i18n';
import type { VisibleCalendar } from '@queries/calendar/calendars';
import type { CalendarPeriodView, CalendarSource } from '../types';

/** Human-readable label for a calendar period view. */
export function calendarPeriodLabel(view: CalendarPeriodView): string {
  switch (view) {
    case 'dayGridMonth':
      return t('Month');
    case 'timeGridWeek':
      return t('Week');
    case 'timeGridDay':
      return t('Day');
  }
}

/**
 * Display label for a calendar in pickers, filters and event details. Google
 * names primary calendars after the account email and Outlook names its
 * default one "Calendar", so primaries collapse to the inbox address; other
 * calendars carry their inbox only when the visible set spans more than one
 * account.
 */
export function calendarDisplayLabel(
  calendar: Pick<CalendarSource, 'name' | 'emailAddress' | 'isPrimary'>,
  spansInboxes: boolean
): string {
  const { emailAddress } = calendar;
  if (emailAddress && (calendar.isPrimary || calendar.name === emailAddress)) {
    return emailAddress;
  }
  return spansInboxes && emailAddress
    ? `${calendar.name} — ${emailAddress}`
    : calendar.name;
}

/** Whether a calendar list spans more than one connected inbox. */
export function spansMultipleInboxes(
  calendars: readonly Pick<VisibleCalendar, 'emailAddress'>[]
): boolean {
  return new Set(calendars.map((calendar) => calendar.emailAddress)).size > 1;
}
