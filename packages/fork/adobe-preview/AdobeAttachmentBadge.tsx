export function AdobeAttachmentBadge(props: { format: 'ai' | 'eps' }) {
  return (
    <span
      class="inline-flex items-center justify-center shrink-0 font-bold text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded border border-ink-muted/20 bg-ink-muted/10 text-ink select-none mr-1"
      style={{
        'min-width': '26px',
        'line-height': '1',
      }}
    >
      {props.format}
    </span>
  );
}
