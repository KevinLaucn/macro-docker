import { beforeEach, describe, expect, test } from 'bun:test';
import { __t, formatBoolean, formatDate, locale, setLocale } from './context';

describe('i18n infrastructure runtime', () => {
  beforeEach(() => {
    setLocale('en-US');
  });

  test('locale switching works reactively', () => {
    expect(locale()).toBe('en-US');
    setLocale('zh-CN');
    expect(locale()).toBe('zh-CN');
  });

  test('basic translation lookup and fallback', () => {
    setLocale('en-US');
    expect(__t('Settings')).toBe('Settings');

    setLocale('zh-CN');
    expect(__t('Settings')).toBe('设置');
    expect(__t('NonExistentString12345')).toBe('NonExistentString12345');
  });

  test('context-aware disambiguation', () => {
    setLocale('zh-CN');
    expect(__t('Owner', 'crm')).toBe('负责人');
    expect(__t('Owner', 'team')).toBe('团队所有者');
    expect(__t('Call', 'call')).toBe('通话');
    expect(__t('Call', 'action')).toBe('发起通话');
  });

  test('scoped dynamic interpolation', () => {
    setLocale('zh-CN');
    const res1 = __t('No options match "{query}"', { query: 'my-test' });
    expect(res1).toBe('没有与“my-test”匹配的选项');

    const res2 = __t('Delete {0}', ['Project X']);
    expect(res2).toBe('删除 Project X');
  });

  test('whitespace-normalized key lookup', () => {
    setLocale('zh-CN');
    expect(__t('  Settings  ')).toBe('设置');
  });

  test('locale-aware formatters', () => {
    setLocale('zh-CN');
    expect(formatBoolean(true)).toBe('是');
    expect(formatBoolean(false)).toBe('否');

    const testDate = new Date('2026-09-04T12:00:00Z');
    const formatted = formatDate(testDate);
    expect(formatted).toContain('2026');

    setLocale('en-US');
    expect(formatBoolean(true)).toBe('True');
    expect(formatBoolean(false)).toBe('False');
  });
});
