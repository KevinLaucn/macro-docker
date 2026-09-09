import {
  stripBlockedTrackingPixelsFromHtml,
  useGlobalExtensionSettingsQuery,
} from '@app/features/email-read-receipts';
import {
  emailTranslationEnabled,
  getCachedMessageTranslation,
  isMessageTranslated,
  isTranslationSupported,
} from '@app/features/email-translation';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { channelTheme } from '@core/component/LexicalMarkdown/theme';
import { DEV_MODE_ENV } from '@core/constant/featureFlags';
import { useEmail } from '@core/context/user';
import {
  parseEmailContent,
  processEmailColors,
  type ThemeColorParams,
} from '@core/email';
import { interceptMailtoLinks } from '@core/util/interceptMailtoLinks';
import DotsThree from '@phosphor/dots-three.svg';
import { usePrimaryEmailLinkId } from '@queries/email/link';
import type { ApiMessage } from '@service-email/generated/schemas';
import { Button, cn } from '@ui';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  Show,
  Switch,
  untrack,
} from 'solid-js';
import { themeReactive } from '../../theme/signals/themeReactive';
import { themeUpdate } from '../../theme/signals/themeSignals';
import { EMAIL_BODY_CONTAINMENT_CSS } from '../util/emailBodyContainmentCss';
import { fitToWidthZoom } from '../util/fitToWidthZoom';
import { isPersonalMessage } from '../util/isPersonalMessage';
import {
  removeOwnTrackingPixels,
  stripOwnTrackingPixelsFromHtml,
} from '../util/readReceipts';
import {
  fetchImagesViaPlatform,
  resolveCidImages,
} from '../util/resolveEmailImages';

interface EmailMessageBodyProps {
  message: ApiMessage;
  /** Sender emails (lowercased) with a CATEGORY_PERSONAL message in the thread */
  personalSenders: Accessor<Set<string>>;
  isBodyExpanded: Accessor<boolean>;
  setExpandedMessageBody: (id: string) => void;
  setFocusedMessageId: (messageID: string | undefined) => void;
  isFirstMessageInThread: boolean;
  isFocused: boolean;
}

export function EmailMessageBody(props: EmailMessageBodyProps) {
  const [showFullHTML, setShowFullHTML] = createSignal<boolean>(false);
  const userEmail = useEmail();

  const messageId = () => props.message.db_id;
  const threadId = () => props.message.thread_db_id;
  const isTranslated = () =>
    emailTranslationEnabled() &&
    isTranslationSupported() &&
    isMessageTranslated(threadId(), messageId());
  const cachedTranslation = () => getCachedMessageTranslation(messageId());

  if (DEV_MODE_ENV) {
    console.log(
      'labels',
      props.message.labels.map((l) => l.name)
    );
  }

  const primaryLinkId = usePrimaryEmailLinkId();
  const extSettings = useGlobalExtensionSettingsQuery(primaryLinkId);

  // Strip the sender's own receipt pixel while the markup is still inert,
  // before parseEmailContent can rewrite remote images through Macro's image
  // proxy. This closes the false-positive path that caused upstream #3943 to
  // be abandoned: opening your own Sent copy must not look like a recipient
  // open.
  const renderBodyHtml = createMemo(() => {
    let html = props.message.body_html_sanitized?.toString();
    if (!html) return html;
    if (props.message.is_sent) {
      return stripOwnTrackingPixelsFromHtml(html);
    }
    // PRIVATE-HOOK: read_receipts:block-received-pixels
    if (extSettings.data?.email_tracking_pixel_blocking_enabled) {
      html = stripBlockedTrackingPixelsFromHtml(html);
    }
    return html;
  });

  // If we don't have body replyless, it may be because it hasn't been generated yet. For instance, this is the case immediately after a message is sent. We can use the HTML to parse the message correctly.
  const bodyReplyless = createMemo(() => {
    let replyless = props.message.body_replyless?.toString() ?? '';
    if (replyless) {
      if (props.message.is_sent) {
        replyless = stripOwnTrackingPixelsFromHtml(replyless);
      } else if (extSettings.data?.email_tracking_pixel_blocking_enabled) {
        replyless = stripBlockedTrackingPixelsFromHtml(replyless);
      }
    }
    if (!replyless) {
      const fullHtml = renderBodyHtml();
      if (fullHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(fullHtml, 'text/html');
        const styleTags = Array.from(doc.head?.querySelectorAll('style') ?? [])
          .map((style) => style.outerHTML)
          .join('\n');
        const quoted = doc.body.querySelector('.macro_quote');
        if (quoted) {
          quoted.remove();
          return styleTags
            ? `${styleTags}\n${doc.body.innerHTML}`
            : doc.body.innerHTML;
        }
      }
    }
    return replyless;
  });

  const isPlaintext = () => !props.message.body_html_sanitized;

  const parsedBodyHtml = createMemo(() => {
    const html = renderBodyHtml();
    return html
      ? parseEmailContent(html, !showFullHTML(), !showFullHTML())
      : undefined;
  });

  const parsedBodyReplyless = createMemo(() => {
    const processed = bodyReplyless();
    return processed ? parseEmailContent(processed) : undefined;
  });

  const source = () => {
    return showFullHTML() || props.isFirstMessageInThread
      ? parsedBodyHtml()
      : parsedBodyReplyless();
  };

  // Sent-from-Macro messages strip the quoted thread from body_macro at send
  // time, and the backend skips replyless trimming for "Fwd:" subjects — so a
  // quote in the full html means there is hidden content regardless of
  // body_replyless.
  const bodyHtmlHasQuote = createMemo(() => {
    const html = renderBodyHtml();
    if (!html || !props.message.body_macro) return false;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.querySelector('.macro_quote') !== null;
  });

  const hasHiddenReplyStructure = () => {
    const fullHtml = renderBodyHtml();
    return (
      !isPlaintext() &&
      (bodyHtmlHasQuote() ||
        (bodyReplyless() &&
          bodyReplyless().replace(/\s+/g, '').length !==
            fullHtml?.replace(/\s+/g, '').length) ||
        source()?.signature)
    );
  };

  // TODO it might be nice to do some additional checks here, e.g. check if this message was sent from a user that the user has sent a message to before.
  const isPersonal = createMemo(() =>
    isPersonalMessage(props.message, userEmail(), props.personalSenders())
  );

  const isMacroSender = createMemo(() => {
    const senderEmail = props.message.from?.email?.toLowerCase();
    return senderEmail?.endsWith('@macro.com') ?? false;
  });

  const host = createMemo(() => {
    themeUpdate();
    const hostContainer = document.createElement('div');
    const shadow = hostContainer.attachShadow({ mode: 'open' });
    // Style that uses a CSS variable to control image visibility
    const styleEl = document.createElement('style');
    // Normalize font in email
    const fontOverride =
      isPersonal() && !isMacroSender()
        ? `*:not(code):not(pre):not(code *):not(pre *):not([data-macro-btn]){font-family: system-ui, sans-serif !important; font-size: inherit !important; line-height: 1.5 !important;}`
        : '';
    // Containment (images, signatures, quotes, pre/code) lives in
    // EMAIL_BODY_CONTAINMENT_CSS so the snapshot harness stays in lockstep.
    styleEl.textContent = `${EMAIL_BODY_CONTAINMENT_CSS}${fontOverride}`;
    shadow.appendChild(styleEl);
    const messageDiv = document.createElement('div');
    // PRIVATE-HOOK: email_translation:body-html
    const translatedSource = createMemo(() => {
      if (!isTranslated()) return undefined;
      const cached = cachedTranslation();
      if (!cached) return undefined;

      const shouldUseReplyless =
        !showFullHTML() && !props.isFirstMessageInThread;

      const targetHtml =
        shouldUseReplyless && cached.translatedReplylessHtml
          ? cached.translatedReplylessHtml
          : cached.translatedHtml;

      if (!targetHtml) return undefined;

      return parseEmailContent(targetHtml, !showFullHTML(), !showFullHTML());
    });
    messageDiv.innerHTML =
      translatedSource()?.mainContent ?? source()?.mainContent ?? '';

    // Defense in depth in case a future parser path reintroduces the pixel.
    if (props.message.is_sent) {
      removeOwnTrackingPixels(messageDiv);
    }

    // Mark button-like anchors so the font override doesn't break their sizing
    for (const a of messageDiv.querySelectorAll<HTMLAnchorElement>(
      'a[style]'
    )) {
      if (a.style.backgroundColor) {
        a.dataset.macroBtn = '';
        for (const child of a.querySelectorAll('*')) {
          (child as HTMLElement).dataset.macroBtn = '';
        }
      }
    }
    // Open links in a new tab instead of navigating the current one
    for (const a of messageDiv.querySelectorAll('a[href]')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
    // Raw mailto: anchors open the in-app composer instead of the OS mail client
    interceptMailtoLinks(messageDiv);
    messageDiv.style.userSelect = 'text';
    // Safari resolves only the -webkit- prefixed form of user-select
    // (unprefixed shipped in Safari 26.4), and WebKit inherits the app-wide
    // `user-select: none` through the shadow boundary — without the prefix,
    // email text isn't selectable in Safari.
    messageDiv.style.setProperty('-webkit-user-select', 'text');
    messageDiv.style.cursor = 'auto';
    shadow.appendChild(messageDiv);
    return hostContainer;
  });

  // Resolve images in two sequential steps, resolving cid urls and then fetching images on tauri via plaformFetch
  createEffect(() => {
    const root = host().shadowRoot;
    if (!root) return;
    const attachments = props.message.attachments;

    const blobUrls: string[] = [];
    let disposed = false;
    onCleanup(() => {
      disposed = true;
      for (const url of blobUrls) URL.revokeObjectURL(url);
    });

    queueMicrotask(async () => {
      if (disposed) return;
      resolveCidImages(root, attachments);
      if (disposed) return;
      await fetchImagesViaPlatform(root, blobUrls, () => disposed);
    });
  });

  // Process the email colors when: the theme changes, or the source HTML changes.
  createEffect(() => {
    themeUpdate();
    showFullHTML();
    const root = host().shadowRoot;
    if (root) {
      if (isPersonal() || !source()?.hasTable) {
        queueMicrotask(() => {
          untrack(() => {
            const theme: ThemeColorParams = {
              inkL: themeReactive.c0.l[0](),
              inkC: themeReactive.c0.c[0](),
              inkH: themeReactive.c0.h[0](),
              panelL: themeReactive.b1.l[0](),
              accentL: themeReactive.a0.l[0](),
              accentC: themeReactive.a0.c[0](),
              accentH: themeReactive.a0.h[0](),
            };
            processEmailColors(root, theme);
          });
        });
      } else {
        const contentWrapper = root.querySelector('div');
        if (contentWrapper instanceof HTMLElement) {
          contentWrapper.style.setProperty(
            'background-color',
            'white',
            'important'
          );
          // Some emails don't have a color set, so we need to set it to black to ensure text is readable againnst white background
          contentWrapper.style.setProperty('color', 'black');
        }
      }
    }
  });

  // Hide images when the message body is not expanded (via CSS variable)
  createEffect(() => {
    const container = host();
    const shouldHide = !props.isBodyExpanded();
    container.style.setProperty(
      '--macro-email-img-display',
      shouldHide ? 'none' : 'initial'
    );
  });

  // After containment, shrink leftover wide canvases (newsletter tables)
  // to the pane. Pathological width is floored so type stays readable.
  createEffect(() => {
    const container = host();
    // Re-run when source changes
    source();

    const clearScale = () => {
      const root = container.shadowRoot;
      if (!root) return;
      const messageDiv = root.querySelector('div');
      if (messageDiv instanceof HTMLElement) {
        messageDiv.style.zoom = '';
        messageDiv.style.overflow = '';
        messageDiv.style.overflowX = '';
      }
    };

    if (!props.isBodyExpanded()) {
      clearScale();
      return;
    }

    const applyScale = () => {
      const root = container.shadowRoot;
      if (!root) return;
      const messageDiv = root.querySelector('div');
      if (!messageDiv || !(messageDiv instanceof HTMLElement)) return;

      // Reset any previous scaling before measuring. overflowX is a longhand
      // and survives clearing the overflow shorthand.
      messageDiv.style.zoom = '';
      messageDiv.style.overflow = '';
      messageDiv.style.overflowX = '';

      const fit = fitToWidthZoom({
        containerWidth: container.clientWidth,
        contentWidth: messageDiv.scrollWidth,
      });
      if (!fit) {
        // When content fits, leave overflow alone. overflow:auto on a fitting
        // body turns hidden tracking-pixel divs into a message-height scrollbar.
        return;
      }
      // Use zoom instead of transform: scale() so backgrounds, borders, and
      // layout shrink together without clipping. The floor keeps leftover
      // canvas overflow (a 600px newsletter on a skinny pane) readable.
      messageDiv.style.zoom = `${fit.zoom}`;
      if (fit.overflowsAfterZoom) {
        messageDiv.style.overflowX = 'auto';
      }
    };

    // Re-run on container resize (e.g. orientation change, split resize)
    const resizeObserver = new ResizeObserver(() => applyScale());
    resizeObserver.observe(container);

    // Re-run when images inside the shadow DOM finish loading
    const root = container.shadowRoot;
    const images = root ? Array.from(root.querySelectorAll('img')) : [];
    const onImageLoad = () => applyScale();
    for (const img of images) {
      if (!img.complete) {
        img.addEventListener('load', onImageLoad);
      }
    }

    // Initial measurement after layout
    requestAnimationFrame(() => applyScale());

    onCleanup(() => {
      resizeObserver.disconnect();
      for (const img of images) {
        img.removeEventListener('load', onImageLoad);
      }
    });
  });

  return (
    <div
      class="ph-no-capture flex flex-col [&_.md-p:first-child]:mt-0 [&_.md-p:last-child]:mb-0"
      onPointerDown={() => {
        if (!props.isBodyExpanded() && props.message.db_id) {
          props.setExpandedMessageBody(props.message.db_id);
          props.setFocusedMessageId(props.message.db_id);
        } else if (props.message.db_id) {
          props.setFocusedMessageId(props.message.db_id);
        }
      }}
    >
      <div
        class="relative"
        classList={{
          isPersonal: isPersonal(),
          'line-clamp-3': !props.isBodyExpanded(),
        }}
      >
        <Switch>
          {/* PRIVATE-HOOK: email_translation:body-markdown */}
          <Match when={isTranslated() && cachedTranslation()?.translatedText}>
            {(translatedText) => {
              return (
                <StaticMarkdown
                  markdown={translatedText()}
                  theme={channelTheme}
                  target="internal"
                />
              );
            }}
          </Match>
          {/* If available, we use body_macro to render "Macro-fied" email content in static markdown with, e.g. correctly styled document mentions. */}
          <Match when={!showFullHTML() && props.message.body_macro}>
            {(bodyMacro) => {
              return (
                <StaticMarkdown
                  markdown={bodyMacro()}
                  theme={channelTheme}
                  target="internal"
                />
              );
            }}
          </Match>
          <Match when={isPlaintext()}>
            <StaticMarkdown
              markdown={props.message.body_text!}
              theme={channelTheme}
              target="internal"
            />
          </Match>
          <Match when={true}>{host()}</Match>
        </Switch>
        <Show when={!showFullHTML() && hasHiddenReplyStructure()}>
          <div class="flex items-center mt-1.5 mb-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowFullHTML(true)}
              class={cn(
                'rounded-md text-ink-extra-muted hover:text-ink-muted',
                props.isFocused ? 'hover:bg-surface' : 'hover:bg-active'
              )}
            >
              <DotsThree />
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
