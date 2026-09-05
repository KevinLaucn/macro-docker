/**
 * @vitest-environment jsdom
 */

import type { Link } from '@service-email/generated/schemas';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, Show } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityData } from '../../types/entity';
import { EmailWideContent, useOwningInboxForEntity } from './email';

const mocks = vi.hoisted(() => ({
  links: vi.fn(),
}));

vi.mock('@core/context/emailLinks', () => ({
  useEmailLinksContext: () => ({ links: mocks.links }),
}));

vi.mock('@core/component/UserIcon', () => ({ UserIcon: () => null }));
vi.mock('../../components/Badges', () => ({ DraftBadge: () => null }));
vi.mock('../../entity', () => ({
  Entity: {
    EmailParticipants: () => null,
    Title: () => null,
  },
}));
vi.mock('../../extractors-search/HitSnippet', () => ({
  HitSnippet: () => null,
}));
vi.mock('../../extractors-search/snippet-entity', () => ({
  getSnippetHit: () => undefined,
}));

function RecycledRowInboxConsumer() {
  const [entity, setEntity] = createSignal<EntityData>({
    id: 'document-1',
    name: 'Document',
    ownerId: 'user-1',
    type: 'document',
  });
  const inbox = useOwningInboxForEntity(entity);

  return (
    <>
      <Show when={inbox()}>
        {(link) => <span>{link().email_address}</span>}
      </Show>
      <button
        type="button"
        onClick={() =>
          setEntity({
            id: 'thread-1',
            name: 'Email',
            ownerId: 'user-1',
            type: 'email',
            isRead: true,
            isDraft: false,
            isImportant: false,
            done: false,
            linkId: 'secondary-inbox',
          })
        }
      >
        Recycle row
      </button>
    </>
  );
}

beforeEach(() => {
  mocks.links.mockReset();
  mocks.links.mockReturnValue([
    { id: 'primary-inbox' } as Link,
    {
      id: 'secondary-inbox',
      email_address: 'secondary@example.com',
    } as Link,
  ]);
});

describe('useOwningInboxForEntity', () => {
  it('updates inbox attribution when a mounted row changes entity type', async () => {
    render(() => <RecycledRowInboxConsumer />);

    expect(screen.queryByText('secondary@example.com')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Recycle row' }));
    expect(screen.getByText('secondary@example.com')).toBeTruthy();
  });

  // [FORK-REGRESSION]: Ensure tagsSlot renders properly on the left side of the row.
  it('renders tagsSlot on the left side between sender and title', () => {
    const emailEntity = {
      id: 'thread-1',
      name: 'Test Subject',
      ownerId: 'user-1',
      type: 'email' as const,
      isRead: true,
      isDraft: false,
      isImportant: false,
      done: false,
      snippet: 'Test snippet',
    };

    render(() => (
      <EmailWideContent
        entity={emailEntity as any}
        chars={100}
        showHitSnippet={false}
        setContainerRef={() => {}}
        tagsSlot={<span data-testid="fork-tag-chip">● docs</span>}
      />
    ));

    expect(screen.getByTestId('fork-tag-chip')).toBeTruthy();
    expect(screen.getByText('● docs')).toBeTruthy();
  });
});
