import { t } from '@macro/i18n';

export const CHANNEL_TABS = [
  { value: 'messages' as const, label: t('Messages') },
  { value: 'attachments' as const, label: t('Attachments') },
  { value: 'participants' as const, label: t('Participants') },
  { value: 'call' as const, label: t('Call') },
];

export type ChannelTabId = (typeof CHANNEL_TABS)[number]['value'];

export const DEFAULT_CHANNEL_TAB: ChannelTabId = 'messages';
