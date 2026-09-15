import { createResource, Show } from 'solid-js';
import { LoadingSpinner } from '@core/component/LoadingSpinner';
import { inspectAi, inspectEps, type AdobeFormat, type AdobePreviewResult } from './inspect';
import { EpsCanvasPreview } from './EpsCanvasPreview';
import { AdobePreviewStatus } from './AdobePreviewStatus';

export type AdobePreviewContainerProps = {
  format: AdobeFormat;
  fileName: string;
  getBlob: () => Promise<Blob>;
};

export function AdobePreviewContainer(props: AdobePreviewContainerProps) {
  const [previewResult] = createResource(async (): Promise<AdobePreviewResult> => {
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
  });

  return (
    <div class="size-full flex items-center justify-center relative overflow-hidden">
      <Show when={previewResult.loading}>
        <div class="flex flex-col items-center justify-center gap-3">
          <LoadingSpinner />
          <span class="text-xs text-ink-muted font-sans">正在解析 {props.format.toUpperCase()} 预览...</span>
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
              <div class="text-center p-6">
                <p class="text-sm font-medium text-ink mb-2">已检测到 PDF 兼容画板</p>
                <p class="text-xs text-ink-muted">可在右侧或新标签页中通过 PDF 阅读器直接浏览完整画板。</p>
              </div>
            );
          }

          return <AdobePreviewStatus result={result} fileName={props.fileName} />;
        }}
      </Show>
    </div>
  );
}
