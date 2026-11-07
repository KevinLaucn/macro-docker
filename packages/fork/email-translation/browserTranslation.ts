/**
 * Legacy export kept only for backward compatibility of barrel exports.
 * Email translation now runs exclusively through the unified AI translation pipeline;
 * browser address-bar translation prompts are permanently retired.
 */
export function requestBrowserTranslation(): void {
  // No-op: browser translation prompts are retired in favor of AI email translation.
}
