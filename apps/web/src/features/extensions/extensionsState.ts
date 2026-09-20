import { createSignal } from 'solid-js';

const STORAGE_KEYS = {
  AWAITING_REPLY_TAG_ID: 'macro_ext_awaiting_reply_tag_id',
} as const;

function getStoredString(key: string, defaultValue: string): string {
  try {
    return localStorage.getItem(key) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStoredString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.error('Failed to save extension setting:', err);
  }
}

// Awaiting reply tag option ID (defaults to empty string = not enabled)
const [awaitingReplyTagId, setAwaitingReplyTagIdSignal] = createSignal<string>(
  getStoredString(STORAGE_KEYS.AWAITING_REPLY_TAG_ID, '')
);

export function setAwaitingReplyTagId(tagId: string) {
  setAwaitingReplyTagIdSignal(tagId);
  setStoredString(STORAGE_KEYS.AWAITING_REPLY_TAG_ID, tagId);
}
export { awaitingReplyTagId };
