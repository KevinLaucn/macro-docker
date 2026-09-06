import { createSignal } from 'solid-js';

const STORAGE_KEYS = {
  IMPORTANT_INCLUDE_OUTBOUND: 'macro_ext_important_include_outbound',
  AWAITING_REPLY_TAG_ID: 'macro_ext_awaiting_reply_tag_id',
} as const;

function getStoredBool(key: string, defaultValue: boolean): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return defaultValue;
    return val === 'true';
  } catch {
    return defaultValue;
  }
}

function setStoredBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch (err) {
    console.error('Failed to save extension setting:', err);
  }
}

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

// 1. Important Mail includes outbound messages (defaults to true)
const [importantIncludeOutbound, setImportantIncludeOutboundSignal] =
  createSignal<boolean>(
    getStoredBool(STORAGE_KEYS.IMPORTANT_INCLUDE_OUTBOUND, true)
  );

export function setImportantIncludeOutbound(value: boolean) {
  setImportantIncludeOutboundSignal(value);
  setStoredBool(STORAGE_KEYS.IMPORTANT_INCLUDE_OUTBOUND, value);
}
export { importantIncludeOutbound };

// 2. Awaiting reply tag option ID (defaults to empty string = not enabled)
const [awaitingReplyTagId, setAwaitingReplyTagIdSignal] = createSignal<string>(
  getStoredString(STORAGE_KEYS.AWAITING_REPLY_TAG_ID, '')
);

export function setAwaitingReplyTagId(tagId: string) {
  setAwaitingReplyTagIdSignal(tagId);
  setStoredString(STORAGE_KEYS.AWAITING_REPLY_TAG_ID, tagId);
}
export { awaitingReplyTagId };
