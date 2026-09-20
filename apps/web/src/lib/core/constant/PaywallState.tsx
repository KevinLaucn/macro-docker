import { t } from '@macro/i18n';
import { createSignal } from 'solid-js';

const DAILY_LIMIT = 5;

export enum PaywallKey {
  PROJECT_LIMIT = 'PROJECT_LIMIT',
  FILE_LIMIT = 'FILE_LIMIT',
  IMAGE_LIMIT = 'IMAGE_LIMIT',
  CHAT_LIMIT = 'CHAT_LIMIT',
  O1_LIMIT = 'O1_LIMIT',
  CANVAS_CLIKED = 'CANVAS_CLIKED',
  SAVED_PROMPT = 'SAVED_PROMPT',
  REMOVE_SIGNATURE = 'REMOVE_SIGNATURE',
  MULTI_INBOX = 'MULTI_INBOX',
  TEAMS = 'TEAMS',
}

export type PaywallMessageMetadata = {
  title: string;
  description: string;
  learnMoreUrl?: string;
  learnMoreSubject?: string;
};

export const PaywallMessages: Record<PaywallKey, PaywallMessageMetadata> = {
  [PaywallKey.PROJECT_LIMIT]: {
    title: t('Folder limit reached'),
    description: t(
      'Upgrade to create more folders and keep organizing your workspace.'
    ),
    learnMoreUrl: 'https://docs.macro.com/product/folders',
    learnMoreSubject: 'folders',
  },
  [PaywallKey.FILE_LIMIT]: {
    title: t('File limit reached'),
    description: t(
      'Upgrade for more storage and room for all of your documents.'
    ),
  },
  [PaywallKey.CHAT_LIMIT]: {
    title: t('Chat limit reached'),
    description: t(
      'Upgrade to keep creating agent chats with premium AI access.'
    ),
    learnMoreUrl: 'https://docs.macro.com/product/agents',
    learnMoreSubject: 'agents',
  },
  [PaywallKey.IMAGE_LIMIT]: {
    title: t('Image processing limit reached'),
    description: t(
      'You’ve used {DAILY_LIMIT} AI image processing requests today. Upgrade for higher limits.',
      { DAILY_LIMIT }
    ),
    learnMoreUrl: 'https://docs.macro.com/product/agents',
    learnMoreSubject: 'agents',
  },
  [PaywallKey.O1_LIMIT]: {
    title: t('Smart models are premium'),
    description: t('Upgrade to use Macro’s most capable AI models.'),
    learnMoreUrl: 'https://docs.macro.com/product/agents',
    learnMoreSubject: 'agents',
  },
  [PaywallKey.CANVAS_CLIKED]: {
    title: t('AI canvases are premium'),
    description: t(
      'Upgrade to generate diagrams, whiteboards, and visual drafts with AI.'
    ),
    learnMoreUrl: 'https://docs.macro.com/product/canvas',
    learnMoreSubject: 'canvases',
  },
  [PaywallKey.SAVED_PROMPT]: {
    title: t('Saved prompts are premium'),
    description: t('Upgrade to save reusable prompts for faster workflows.'),
    learnMoreUrl: 'https://docs.macro.com/product/snippets',
    learnMoreSubject: 'saved prompts',
  },
  [PaywallKey.REMOVE_SIGNATURE]: {
    title: t('Remove the Macro signature'),
    description: t('Upgrade to send emails without the Macro signature.'),
    learnMoreUrl: 'https://docs.macro.com/product/email',
    learnMoreSubject: 'email',
  },
  [PaywallKey.MULTI_INBOX]: {
    title: t('Connect more inboxes'),
    description: t('Upgrade your plan to connect more than two inboxes.'),
    learnMoreUrl: 'https://docs.macro.com/product/inbox',
    learnMoreSubject: 'multiple inboxes',
  },
  [PaywallKey.TEAMS]: {
    title: t('Collaborate with your team'),
    description: t(
      'Upgrade to create a team, invite members, and manage access together.'
    ),
    learnMoreUrl: 'https://docs.macro.com/account/teams',
    learnMoreSubject: 'teams',
  },
};

const [paywallOpen, setPaywallOpen] = createSignal(false);
// export const [paywallOpen, setPaywallOpen] = createControlledOpenSignal(false);
const [limitReached, _setLimitReached] = createSignal(false);
const [paywallKey, setPaywallKey] = createSignal<PaywallKey | null>(null);

export const usePaywallState = () => {
  const showPaywall = (errorKey?: PaywallKey | null) => {
    if (errorKey) {
      setPaywallKey(errorKey);
    }
    setPaywallOpen(true);
  };

  const hidePaywall = () => {
    setPaywallOpen(false);
    setPaywallKey(null);
  };
  return { paywallOpen, showPaywall, hidePaywall, limitReached, paywallKey };
};
