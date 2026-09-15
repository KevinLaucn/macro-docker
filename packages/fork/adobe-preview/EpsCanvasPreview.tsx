import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { LoadingSpinner } from '@core/component/LoadingSpinner';

export type EpsCanvasPreviewProps = {
  tiffBlob: Blob;
  onDecodeError?: (error: string) => void;
};

export function EpsCanvasPreview(props: EpsCanvasPreviewProps) {
  let canvasRef!: HTMLCanvasElement;
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    const blob = props.tiffBlob;
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function decode() {
      try {
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;

        // Lazy-load utif on demand
        const utifModule = await import('utif');
        const UTIF = (utifModule as any).default || utifModule;

        const ifds = UTIF.decode(buffer);
        if (!ifds || ifds.length === 0) {
          throw new Error('No valid TIFF IFD found in EPS preview');
        }

        UTIF.decodeImage(buffer, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);

        if (cancelled || !canvasRef) return;

        const width = ifds[0].width;
        const height = ifds[0].height;

        canvasRef.width = width;
        canvasRef.height = height;

        const ctx = canvasRef.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get 2D canvas context');
        }

        const imgData = ctx.createImageData(width, height);
        imgData.data.set(rgba);
        ctx.putImageData(imgData, 0, 0);

        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message ?? 'Failed to decode TIFF preview';
        setError(msg);
        setLoading(false);
        props.onDecodeError?.(msg);
      }
    }

    void decode();

    onCleanup(() => {
      cancelled = true;
    });
  });

  return (
    <div class="size-full flex items-center justify-center relative overflow-auto p-4 select-none">
      <Show when={loading()}>
        <div class="absolute inset-0 flex items-center justify-center z-10 bg-surface/50">
          <LoadingSpinner />
        </div>
      </Show>

      <Show when={error()}>
        <div class="text-sm text-failure text-center p-4">
          <div class="font-medium mb-1">EPS 预览解码失败</div>
          <div class="text-xs text-ink-muted">{error()}</div>
        </div>
      </Show>

      <canvas
        ref={canvasRef}
        class="max-w-full max-h-full object-contain shadow-lg rounded border border-ink-muted/10 bg-white"
        style={{ display: loading() || error() ? 'none' : 'block' }}
      />
    </div>
  );
}
