import type { EmailThreadKeyboardHandlers } from '@app/features/email-thread/core/thread-keyboard';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { t } from '@macro/i18n';

export function registerEmailHotkeys(
  scopeId: string,
  handlers: EmailThreadKeyboardHandlers
) {
  if (handlers.replyAllToFocusedMessage) {
    registerHotkey({
      hotkey: 'opt+r',
      scopeId: scopeId,
      description: t('Reply all to message', { context: 'email' }),
      keyDownHandler: handlers.replyAllToFocusedMessage,
      hotkeyToken: TOKENS.email.replyAll,
      displayPriority: 8,
    });
  }

  registerHotkey({
    hotkey: 'r',
    scopeId: scopeId,
    description: t('Reply to message', { context: 'email' }),
    keyDownHandler: handlers.replyToFocusedMessage,
    hotkeyToken: TOKENS.email.reply,
    displayPriority: 9,
  });

  registerHotkey({
    hotkey: 'f',
    scopeId: scopeId,
    description: t('Forward message'),
    keyDownHandler: handlers.forwardFocusedMessage,
    hotkeyToken: TOKENS.email.forward,
    displayPriority: 7,
  });
  const extHandlers = handlers as EmailThreadKeyboardHandlers & {
    translateThread?: () => boolean;
  };
  if (extHandlers.translateThread) {
    registerHotkey({
      hotkey: 'q',
      scopeId,
      description: t('Translate email thread'),
      keyDownHandler: extHandlers.translateThread,
      hotkeyToken: ((TOKENS.email as any).translateThread ??
        'email.translateThread') as any,
      displayPriority: 8,
    });
  }
  registerHotkey({
    hotkey: 'e',
    scopeId,
    description: t('Mark done'),
    // Mark done opens the next thread, so a held key would archive thread
    // after thread; auto-repeat is ignored.
    keyDownHandler: (event) => (event?.repeat ? true : handlers.markDone()),
    hotkeyToken: TOKENS.entity.action.markDone,
    displayPriority: 10,
    condition: () => !handlers.isThreadDone(),
  });
  registerHotkey({
    hotkey: 'shift+e',
    scopeId,
    description: t('Mark as not done'),
    keyDownHandler: (event) => (event?.repeat ? true : handlers.markNotDone()),
    hotkeyToken: TOKENS.entity.action.markNotDone,
    displayPriority: 10,
    condition: () => handlers.isThreadDone() && handlers.canMarkNotDone(),
  });
  registerHotkey({
    hotkey: 'u',
    scopeId,
    description: t('Mark unread'),
    keyDownHandler: handlers.markUnread,
    hotkeyToken: TOKENS.entity.action.markUnread,
    displayPriority: 9,
    condition: () => !handlers.isThreadMarkedUnread(),
  });
  registerHotkey({
    hotkey: 'shift+u',
    scopeId,
    description: t('Mark read'),
    keyDownHandler: handlers.markRead,
    hotkeyToken: TOKENS.entity.action.markRead,
    displayPriority: 9,
    condition: () => handlers.isThreadMarkedUnread(),
  });
  registerHotkey({
    scopeId: scopeId,
    description: t('Block sender'),
    keyDownHandler: handlers.blockSender,
    hotkeyToken: TOKENS.email.blockSender,
    displayPriority: 5,
    condition: () => handlers.canActOnSender(),
  });
  registerHotkey({
    scopeId: scopeId,
    description: t('Mark sender as Signal', { context: 'email' }),
    keyDownHandler: handlers.markSenderSignal,
    hotkeyToken: TOKENS.email.markSenderSignal,
    displayPriority: 5,
    condition: () => handlers.canActOnSender(),
  });
  registerHotkey({
    scopeId: scopeId,
    description: t('Mark sender as Noise', { context: 'email' }),
    keyDownHandler: handlers.markSenderNoise,
    hotkeyToken: TOKENS.email.markSenderNoise,
    displayPriority: 5,
    condition: () => handlers.canActOnSender(),
  });
  registerHotkey({
    hotkey: ['arrowup', 'p'],
    scopeId,
    description: t('Previous message', { context: 'email' }),
    keyDownHandler: handlers.navigateToPreviousMessage,
    hotkeyToken: TOKENS.email.previousMessage,
  });
  registerHotkey({
    hotkey: ['arrowdown', 'n'],
    scopeId,
    description: t('Next message', { context: 'email' }),
    keyDownHandler: handlers.navigateToNextMessage,
    hotkeyToken: TOKENS.email.nextMessage,
  });

  registerHotkey({
    hotkey: 'o',
    scopeId,
    description: 'Expand or collapse message',
    keyDownHandler: handlers.expandFocusedMessage,
    hotkeyToken: TOKENS.email.expandMessage,
    displayPriority: 6,
  });
  registerHotkey({
    hotkey: 'shift+o',
    scopeId,
    description: 'Expand all messages',
    keyDownHandler: handlers.expandAllMessages,
    hotkeyToken: TOKENS.email.expandAllMessages,
    displayPriority: 6,
  });
}
