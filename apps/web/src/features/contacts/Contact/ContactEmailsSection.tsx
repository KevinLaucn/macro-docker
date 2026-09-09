import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import { useInfiniteScrollSentinel } from '@companies/Company/use-infinite-scroll-sentinel';
import { TabsInset } from '@core/component/TabsInset';
import {
  ListEntity,
  ListEntityMetadataQueryProvider,
  ListLayoutProvider,
} from '@entity';
import { t } from '@macro/i18n';
import type { CrmContactResponse } from '@service-storage/generated/schemas/crmContactResponse';
import { createSignal, For, Show } from 'solid-js';
import {
  type EmailSignalView,
  type EmailView,
  useContactEmailsQuery,
} from './use-contact-emails-query';

export function ContactEmailsSection(props: { contact?: CrmContactResponse }) {
  const email = () => props.contact?.email;
  const [view, setView] = createSignal<EmailView>('team');
  const [signalView, setSignalView] = createSignal<EmailSignalView>('all');
  const emailsQuery = useContactEmailsQuery(email, view, signalView);
  const emails = () => emailsQuery.data?.entities ?? [];

  const [listRef, setListRef] = createSignal<HTMLElement>();
  const [sentinelRef, setSentinelRef] = createSignal<HTMLDivElement>();

  useInfiniteScrollSentinel({
    sentinel: sentinelRef,
    hasNextPage: () => emailsQuery.hasNextPage ?? false,
    isFetchingNextPage: () => emailsQuery.isFetchingNextPage,
    fetchNextPage: () => emailsQuery.fetchNextPage(),
  });

  const emptyMessage = () => {
    const isSignal = signalView() === 'signal';
    const isMe = view() === 'me';
    if (isSignal && isMe) {
      return t('No signal emails with this contact in your inbox.');
    }
    if (isSignal && !isMe) {
      return t('No signal emails with this contact yet.');
    }
    if (!isSignal && isMe) {
      return t('No emails with this contact in your inbox.');
    }
    return t('No emails with this contact yet.');
  };

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium text-ink-muted">{t('Emails')}</h2>
        <div class="flex items-center gap-2.5">
          <TabsInset
            list={[
              { value: 'signal', label: t('Signal') },
              { value: 'all', label: t('All') },
            ]}
            value={signalView()}
            onChange={(v) => setSignalView(v as EmailSignalView)}
          />
          <TabsInset
            list={[
              { value: 'team', label: t('Team') },
              { value: 'me', label: t('Me') },
            ]}
            value={view()}
            onChange={(v) => setView(v as EmailView)}
          />
        </div>
      </div>
      <Show
        when={props.contact && !emailsQuery.isLoading}
        fallback={
          <div class="p-6 text-center text-sm text-ink-muted">
            {t('Loading…')}
          </div>
        }
      >
        <Show
          when={emails().length > 0}
          fallback={
            <div class="rounded-lg border border-dashed border-edge-muted p-6 text-center text-sm text-ink-muted">
              {emptyMessage()}
            </div>
          }
        >
          <div class="max-h-96 overflow-y-auto">
            <ListEntityMetadataQueryProvider>
              <ListLayoutProvider ref={listRef}>
                <div ref={setListRef} class="flex flex-col">
                  <For each={emails()}>
                    {(entity) => (
                      <ListEntity
                        entity={entity}
                        timestamp={entity.updatedAt}
                        onClick={() =>
                          openEntityInSplitFromUnifiedList(entity, {})
                        }
                      />
                    )}
                  </For>
                </div>
              </ListLayoutProvider>
            </ListEntityMetadataQueryProvider>
            <Show when={emailsQuery.hasNextPage}>
              <div ref={setSentinelRef} class="h-px" />
            </Show>
            <Show when={emailsQuery.isFetchingNextPage}>
              <div class="p-3 text-center text-xs text-ink-muted">
                {t('Loading more…')}
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
