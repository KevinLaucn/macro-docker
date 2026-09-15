import { Show } from 'solid-js';
import type { AdobePreviewResult } from './inspect';

export type AdobePreviewStatusProps = {
  result: Exclude<AdobePreviewResult, { kind: 'ai-pdf' } | { kind: 'eps-tiff' }>;
  fileName?: string;
};

export function AdobePreviewStatus(props: AdobePreviewStatusProps) {
  const getDetails = () => {
    switch (props.result.kind) {
      case 'source-no-preview':
        if (props.result.format === 'ai') {
          return {
            title: '无法预览此 AI 文件',
            description: '文件本身未包含 PDF 兼容预览。请在 Illustrator 保存时启用 “Create PDF Compatible File”。',
            status: '文件本身缺少预览数据',
            badgeClass: 'bg-warning/15 text-warning',
          };
        }
        return {
          title: '无法预览此 EPS 文件',
          description: '文件本身未包含可用的内嵌预览。',
          status: '文件本身缺少预览数据',
          badgeClass: 'bg-warning/15 text-warning',
        };

      case 'unsupported-preview':
        return {
          title: '暂不支持此 EPS 预览格式',
          description: '文件包含 WMF 预览，但当前轻量预览器暂不支持 WMF。',
          status: '当前预览器暂不支持',
          badgeClass: 'bg-ink-muted/15 text-ink-muted',
        };

      case 'load-error':
        return {
          title: '预览文件加载失败',
          description: props.result.error || '无法读取文件二进制流或文件头部校验损坏。',
          status: '加载失败',
          badgeClass: 'bg-failure/15 text-failure',
        };
    }
  };

  const details = () => getDetails();

  return (
    <div class="flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <div class={`mb-3 px-2.5 py-1 rounded-full text-xs font-medium tracking-wide ${details().badgeClass}`}>
        {details().status}
      </div>
      <h3 class="text-base font-semibold text-ink mb-2">
        {details().title}
      </h3>
      <p class="text-xs text-ink-muted leading-relaxed mb-4">
        {details().description}
      </p>
      <Show when={props.fileName}>
        <div class="text-[11px] text-ink-muted font-mono truncate max-w-xs px-2 py-1 bg-ink-muted/5 rounded border border-ink-muted/8">
          {props.fileName}
        </div>
      </Show>
    </div>
  );
}
