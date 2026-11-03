import { LoadingSpinner } from '@core/component/LoadingSpinner';
import { Button } from '@ui/components/Button';
import { t } from '@macro/i18n';
import { createResource, Show } from 'solid-js';
import { AdobePreviewStatus } from './AdobePreviewStatus';
import { EpsCanvasPreview } from './EpsCanvasPreview';
import {
  type AdobeFormat,
  type AdobePreviewResult,
  inspectAi,
  inspectEps,
} from './inspect';

export type AdobePreviewContainerProps = {
  format: AdobeFormat;
  fileName: string;
  getBlob: () => Promise<Blob>;
  canOpenEditor?: boolean;
  onOpenEditor?: () => void;
};

export function AdobePreviewContainer(props: AdobePreviewContainerProps) {
  const [previewResult] = createResource(
    async (): Promise<AdobePreviewResult> => {
      try {
        const blob = await props.getBlob();
        if (props.format === 'ai') {
          return await inspectAi(blob);
        } else {
          return await inspectEps(blob);
        }
      } catch (e: any) {
        return {
          kind: 'load-error',
          format: props.format,
          error: e?.message ?? 'Failed to load attachment blob',
        };
      }
    }
  );

  return (
    <div class="size-full flex items-center justify-center relative overflow-hidden">
      <Show when={previewResult.loading}>
        <div class="flex flex-col items-center justify-center gap-3">
          <LoadingSpinner />
          <span class="text-xs text-ink-muted font-sans">
            {t('Parsing {format} preview...', {
              format: props.format.toUpperCase(),
            })}
          </span>
        </div>
      </Show>

      <Show when={previewResult()}>
        {(res) => {
          const result = res();
          if (result.kind === 'eps-tiff') {
            return <EpsCanvasPreview tiffBlob={result.blob} />;
          }

          if (result.kind === 'ai-pdf') {
            // Note: AI with PDF stream is normally dispatched directly to PDF viewer.
            // If it lands here, it can notify or indicate it is PDF-compatible.
            return (
              <div class="text-center p-6 max-w-md mx-auto">
                <p class="text-sm font-medium text-ink mb-2">
                  {t('PDF compatible artboard detected')}
                </p>
                <p class="text-xs text-ink-muted leading-relaxed">
                  {t(
                    'You can view the full artboard in the PDF reader or open in editor.'
                  )}
                </p>
                <Show when={props.canOpenEditor && props.onOpenEditor}>
                  <div class="mt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={props.onOpenEditor}
                    >
                      {t('Open in Illustrator Editor')}
                    </Button>
                  </div>
                </Show>
              </div>
            );
          }

          return (
            <AdobePreviewStatus
              result={result}
              fileName={props.fileName}
              canOpenEditor={props.canOpenEditor}
              onOpenEditor={props.onOpenEditor}
            />
          );
        }}
      </Show>
    </div>
  );
}
