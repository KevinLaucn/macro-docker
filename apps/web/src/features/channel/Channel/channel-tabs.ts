import { t } from '@macro/i18n';

export const CHANNEL_TABS = [
  { value: 'messages' as const, get label() { return t('Messages'); } },
  { value: 'attachments' as const, get label() { return t('Attachments'); } },
  { value: 'calls' as const, get label() { return t('Calls'); } },
  { value: 'participants' as const, get label() { return t('Participants'); } },
  { value: 'call' as const, get label() { return t('Call'); } },
];

export type ChannelTabId = (typeof CHANNEL_TABS)[number]['value'];

export const DEFAULT_CHANNEL_TAB: ChannelTabId = 'messages';
