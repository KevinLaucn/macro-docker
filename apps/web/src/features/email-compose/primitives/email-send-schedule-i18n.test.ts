import { setLocale } from '@macro/i18n';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getScheduleAction,
  getScheduleActionLabel,
} from './email-send-schedule';

afterEach(() => setLocale('en-US'));

describe('send action localization', () => {
  it('updates display labels without changing delivery action identifiers', () => {
    const immediate = {
      type: 'editing',
      intent: { type: 'immediate' },
    } as const;
    const later = {
      type: 'editing',
      intent: { type: 'later', sendTime: new Date() },
    } as const;
    const update = {
      type: 'scheduled',
      confirmedTime: new Date(),
      proposedTime: new Date(),
    } as const;
    setLocale('zh-CN');
    expect(getScheduleActionLabel(immediate)).toBe('发送邮件');
    expect(getScheduleActionLabel(later)).toBe('定时发送');
    expect(getScheduleActionLabel(update)).toBe('更新发送计划');
    expect([immediate, later, update].map(getScheduleAction)).toEqual([
      'send',
      'schedule',
      'update',
    ]);
    setLocale('en-US');
    expect(getScheduleActionLabel(immediate)).toBe('Send email');
  });
});
