import { t } from '@macro/i18n';

/**
 * Event types the notification service lets a user disable.
 * Keep this list aligned with `BLOCKABLE_NOTIFICATIONS` in
 * `services/notification_service/src/api/user_notification.rs`.
 * `email-digest-notification` is a delivery control, not an inbox event.
 */

export const EMAIL_DIGEST_NOTIFICATION_TYPE =
  'email-digest-notification' as const;

export type NotificationEventGroupId =
  | 'channels'
  | 'documents'
  | 'tasks'
  | 'calendar'
  | 'email'
  | 'ai'
  | 'github';

export type NotificationEventDefinition = {
  type: string;
  label: string;
  description: string;
};

export type NotificationEventGroup = {
  id: NotificationEventGroupId;
  label: string;
  events: readonly NotificationEventDefinition[];
};

export const NOTIFICATION_EVENT_GROUPS: readonly NotificationEventGroup[] = [
  {
    id: 'channels',
    get label() {
      return t('Channels');
    },
    events: [
      {
        type: 'channel_message_send',
        get label() {
          return t('New messages');
        },
        get description() {
          return t('Messages in channels you belong to');
        },
      },
      {
        type: 'channel_mention',
        get label() {
          return t('Mentions');
        },
        get description() {
          return t('When someone mentions you in a channel');
        },
      },
      {
        type: 'channel_message_reply',
        get label() {
          return t('Thread replies');
        },
        get description() {
          return t('Replies in threads you are part of');
        },
      },
    ],
  },
  {
    id: 'documents',
    get label() {
      return t('Documents');
    },
    events: [
      {
        type: 'document_mention',
        get label() {
          return t('Document mentions');
        },
        get description() {
          return t('When a document is mentioned in a channel');
        },
      },
      {
        type: 'mentioned_in_document_comment',
        get label() {
          return t('Comment mentions');
        },
        get description() {
          return t('When you are mentioned in a document comment');
        },
      },
      {
        type: 'replied_to_document_comment_thread',
        get label() {
          return t('Comment replies');
        },
        get description() {
          return t('Replies on comment threads you are part of');
        },
      },
      {
        type: 'commented_on_document',
        get label() {
          return t('New comments');
        },
        get description() {
          return t('Comments on documents you own');
        },
      },
    ],
  },
  {
    id: 'tasks',
    get label() {
      return t('Tasks');
    },
    events: [
      {
        type: 'task_assigned',
        get label() {
          return t('Assignments');
        },
        get description() {
          return t('When a task is assigned to you');
        },
      },
    ],
  },
  {
    id: 'calendar',
    get label() {
      return t('Calendar');
    },
    events: [
      {
        type: 'calendar_event_reminder',
        get label() {
          return t('Event reminders');
        },
        get description() {
          return t('When a calendar event is about to start');
        },
      },
    ],
  },
  {
    id: 'email',
    get label() {
      return t('Email');
    },
    events: [
      {
        type: 'new_email',
        get label() {
          return t('New email');
        },
        get description() {
          return t('When a new email arrives');
        },
      },
    ],
  },
  {
    id: 'ai',
    get label() {
      return t('AI');
    },
    events: [
      {
        type: 'ai_response',
        get label() {
          return t('AI replies');
        },
        get description() {
          return t('When an AI chat responds');
        },
      },
      {
        type: 'agent_session_settled',
        get label() {
          return t('Agent finished');
        },
        get description() {
          return t('When an agent session you took part in finishes a turn');
        },
      },
      {
        type: 'agent_session_waiting_for_input',
        get label() {
          return t('Agent needs an answer');
        },
        get description() {
          return t('When your agent stops to ask you something');
        },
      },
      {
        type: 'agent_session_mentioned',
        get label() {
          return t('Agent session mentions');
        },
        get description() {
          return t('When someone mentions you in an agent session');
        },
      },
    ],
  },
  {
    id: 'github',
    get label() {
      return t('GitHub');
    },
    events: [
      {
        type: 'github_pr_status_changed',
        get label() {
          return t('PR status');
        },
        get description() {
          return t('When a pull request changes lifecycle state');
        },
      },
      {
        type: 'github_review_requested',
        get label() {
          return t('Review requested');
        },
        get description() {
          return t('When your review is requested');
        },
      },
      {
        type: 'github_pr_comment',
        get label() {
          return t('PR comments');
        },
        get description() {
          return t('When someone comments on a pull request');
        },
      },
      {
        type: 'github_pr_mention',
        get label() {
          return t('PR mentions');
        },
        get description() {
          return t('When you are mentioned on a pull request');
        },
      },
      {
        type: 'github_pr_review',
        get label() {
          return t('PR reviews');
        },
        get description() {
          return t('When a review is submitted on your pull request');
        },
      },
    ],
  },
];

export const BLOCKABLE_NOTIFICATION_EVENT_TYPES: readonly string[] =
  NOTIFICATION_EVENT_GROUPS.flatMap((group) =>
    group.events.map((event) => event.type)
  );

export const MUTED_ENTITY_TYPE_LABELS: Record<string, string> = {
  calendar_event: 'Calendar event',
  call: 'Call',
  channel: 'Channel',
  channel_message: 'Thread',
  chat: 'Chat',
  document: 'Document',
  email: 'Email',
  email_thread: 'Email',
  foreign: 'GitHub',
  foreign_entity: 'GitHub',
  project: 'Folder',
  reminder: 'Reminder',
  team: 'Team',
};

export function mutedEntityTypeLabel(itemType: string): string {
  const label = MUTED_ENTITY_TYPE_LABELS[itemType];
  return label ? t(label) : itemType.replace(/_/g, ' ');
}
