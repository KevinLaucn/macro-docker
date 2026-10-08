import { setLocale } from '@macro/i18n';
import { afterEach, describe, expect, it } from 'vitest';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '../identifiers';
import { PROPERTIES_FILLED } from '../mocks/mockProperties';
import { formatDate, formatPropertyValue } from './formatting';

afterEach(() => setLocale('en-US'));

describe('formatDate', () => {
  it('shows a day as its short month, day and year', () => {
    expect(formatDate(new Date(2025, 2, 14))).toBe('Mar 14, 2025');
    expect(formatDate(new Date(2026, 11, 1, 23, 59))).toBe('Dec 1, 2026');
  });
});

describe('system option localization', () => {
  const status = PROPERTIES_FILLED.find(
    (property) => property.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STATUS
  )!;

  it('translates stored system labels and fallback labels as locale changes', () => {
    setLocale('zh-CN');
    expect(
      formatPropertyValue(status, PROPERTY_OPTION_IDS.STATUS.NOT_STARTED)
    ).toBe('未开始');
    expect(
      formatPropertyValue(
        { ...status, options: [] },
        PROPERTY_OPTION_IDS.STATUS.NOT_STARTED
      )
    ).toBe('未开始');
    setLocale('en-US');
    expect(
      formatPropertyValue(status, PROPERTY_OPTION_IDS.STATUS.NOT_STARTED)
    ).toBe('Not started');
  });

  it('preserves a custom option even when its label matches a system translation', () => {
    setLocale('zh-CN');
    const option = status.options![0];
    const custom = {
      ...status,
      options: [
        {
          ...option,
          id: 'custom-option',
          value: { type: 'string' as const, value: 'Not Started' },
        },
      ],
    };
    expect(formatPropertyValue(custom, 'custom-option')).toBe('Not Started');
  });
});
