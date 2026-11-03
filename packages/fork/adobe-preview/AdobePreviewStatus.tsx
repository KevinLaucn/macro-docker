import { Button } from '@ui/components/Button';
import { t } from '@macro/i18n';
import { Show } from 'solid-js';
import type { AdobePreviewResult } from './inspect';

export type AdobePreviewStatusProps = {
  result: Exclude<
    AdobePreviewResult,
    { kind: 'ai-pdf' } | { kind: 'eps-tiff' }
  >;
  fileName?: string;
  canOpenEditor?: boolean;
  onOpenEditor?: () => void;
};

export function AdobePreviewStatus(props: AdobePreviewStatusProps) {
  const getDetails = () => {
    switch (props.result.kind) {
      case 'source-no-preview':
        if (props.result.format === 'ai') {
          return {
            title: t('Cannot preview this AI file'),
            description: t(
              'The file does not contain a PDF-compatible preview stream. Please enable "Create PDF Compatible File" when saving in Illustrator.'
            ),
            status: t('Missing Preview Data'),
            badgeClass: 'bg-warning/15 text-warning',
          };
        }
        return {
          title: t('Cannot preview this EPS file'),
          description: t('The file does not contain an embedded preview image.'),
          status: t('Missing Preview Data'),
          badgeClass: 'bg-warning/15 text-warning',
        };

      case 'unsupported-preview':
        return {
          title: t('Preview format not supported'),
          description: t(
            'The file contains a WMF preview, which is currently not supported by the lightweight viewer.'
          ),
          status: t('Unsupported Preview Format'),
          badgeClass: 'bg-ink-muted/15 text-ink-muted',
        };

      case 'load-error':
        // Technical error is kept in error log rather than exposed directly as raw unmapped string
        if (props.result.error) {
          console.warn('Adobe attachment preview load error:', props.result.error);
        }
        return {
          title: t('Failed to load preview'),
          description: t(
            'Could not read file binary stream or header checksum is corrupted.'
          ),
          status: t('Load Failed'),
          badgeClass: 'bg-failure/15 text-failure',
        };
    }
  };

  const details = () => getDetails();

  return (
    <div class="flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <div
        class={`mb-3 px-2.5 py-1 rounded-full text-xs font-medium tracking-wide ${details().badgeClass}`}
      >
        {details().status}
      </div>
      <h3 class="text-base font-semibold text-ink mb-2">{details().title}</h3>
      <p class="text-xs text-ink-muted leading-relaxed mb-4">
        {details().description}
      </p>
      <Show when={props.fileName}>
        <div class="text-[11px] text-ink-muted font-mono truncate max-w-xs px-2 py-1 bg-ink-muted/5 rounded border border-ink-muted/8">
          {props.fileName}
        </div>
      </Show>
      <Show when={props.canOpenEditor && props.onOpenEditor}>
        <div class="mt-4">
          <Button variant="secondary" size="sm" onClick={props.onOpenEditor}>
            {t('Open in Illustrator Editor')}
          </Button>
        </div>
      </Show>
    </div>
  );
}
