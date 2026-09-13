import { ENABLE_PROXY_EMAIL_IMAGES } from '@core/constant/featureFlags';
import { SERVER_HOSTS } from '@core/constant/servers';
import { interceptMailtoLinks } from '@core/util/interceptMailtoLinks';
import { createMemo } from 'solid-js';
import { themeReactive } from '../theme/signals/themeReactive';
import { themeUpdate } from '../theme/signals/themeSignals';
import type { EmailRenderingContextValue } from './context/email-rendering-context';
import { fetchImagesViaPlatform, resolveCidImages } from './image-adapter';

function proxyEmailImageUrl(url: string): string {
  // PRIVATE-HOOK: self_host_media:bypass-proxy
  if (isSelfHostedStaticFileUrl(url)) return url;
  return `${SERVER_HOSTS['image-proxy-service']}/proxy?url=${encodeURIComponent(url)}`;
}

function isSelfHostedStaticFileUrl(url: string): boolean {
  if (typeof globalThis.location?.origin !== 'string') return false;
  try {
    const staticFile = new URL(SERVER_HOSTS['static-file'], globalThis.location.origin);
    const candidate = new URL(url);
    return (
      staticFile.origin === globalThis.location.origin &&
      candidate.origin === staticFile.origin &&
      candidate.pathname.startsWith('/static-file/file/')
    );
  } catch {
    return false;
  }
}

export function createEmailRenderingContext(): EmailRenderingContextValue {
  const theme = createMemo(() => {
    themeUpdate();
    return {
      inkL: themeReactive.c0.l[0](),
      inkC: themeReactive.c0.c[0](),
      inkH: themeReactive.c0.h[0](),
      panelL: themeReactive.b1.l[0](),
      accentL: themeReactive.a0.l[0](),
      accentC: themeReactive.a0.c[0](),
      accentH: themeReactive.a0.h[0](),
    };
  });
  return {
    theme,
    images: {
      remote: 'allow',
      proxyUrl: ENABLE_PROXY_EMAIL_IMAGES
        ? proxyEmailImageUrl
        : undefined,
    },
    prepareLinks: interceptMailtoLinks,
    async resolveImages(root, attachments, lifetime) {
      const blobUrls: string[] = [];
      const isDisposed = () => lifetime.signal.aborted;
      lifetime.onDispose(() => {
        for (const url of blobUrls) URL.revokeObjectURL(url);
      });
      if (isDisposed()) return;
      resolveCidImages(root, attachments);
      if (isDisposed()) return;
      await fetchImagesViaPlatform(root, blobUrls, isDisposed);
    },
  };
}
