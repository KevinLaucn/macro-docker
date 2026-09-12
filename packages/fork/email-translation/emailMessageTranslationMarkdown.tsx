import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { channelTheme } from '@core/component/LexicalMarkdown/theme';
import { Show } from 'solid-js';

export function EmailTranslationMarkdown(props: { text?: string }) {
  return (
    <Show when={props.text}>
      {(text) => (
        <StaticMarkdown
          markdown={text()}
          theme={channelTheme}
          target="internal"
        />
      )}
    </Show>
  );
}
