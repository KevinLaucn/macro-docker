import { TagDot } from '@app/features/property/tags/TagDot';
import { DropdownMenu as KobalteDropdownMenu } from '@kobalte/core/dropdown-menu';
import { t } from '@macro/i18n';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import { useTagsQuery } from '@queries/properties/tags';
import { Dropdown, Layer } from '@ui';
import { createMemo, createSignal, For } from 'solid-js';

interface TagOptionItem {
  id: string;
  label: string;
  color?: string;
}

export function TagSelectorDropdown(props: {
  value: string;
  onChange: (tagId: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const tagsQuery = useTagsQuery();

  const allTagOptions = createMemo<TagOptionItem[]>(() => {
    const sets = Array.isArray(tagsQuery.data) ? tagsQuery.data : [];
    const list: TagOptionItem[] = [];
    for (const set of sets) {
      if (!Array.isArray(set.options)) continue;
      for (const opt of set.options) {
        if (opt.value?.type === 'string' && opt.value.value) {
          list.push({
            id: opt.id,
            label: opt.value.value,
            color: opt.color ?? undefined,
          });
        }
      }
    }
    return list;
  });

  const selectedTag = createMemo(() =>
    allTagOptions().find((opt) => opt.id === props.value)
  );

  return (
    <Dropdown placement="bottom-end" open={open()} onOpenChange={setOpen}>
      <KobalteDropdownMenu.Trigger class="inline-flex items-center gap-2 h-8 px-2.5 text-xs font-medium rounded-lg border border-edge-muted bg-surface hover:bg-ink/4 text-ink transition-colors cursor-pointer outline-none max-w-[200px]">
        {selectedTag() ? (
          <>
            <TagDot color={selectedTag()?.color} class="size-2 shrink-0" />
            <span class="truncate">{selectedTag()?.label}</span>
          </>
        ) : (
          <span class="text-ink-muted">{t('Disabled')}</span>
        )}
        <CaretDownIcon class="size-3 text-ink-muted shrink-0 ml-auto" />
      </KobalteDropdownMenu.Trigger>
      <Dropdown.Content
        as="div"
        class="w-48 max-h-60 overflow-y-auto border border-ink/[0.05] bg-surface shadow-menu rounded-lg p-1"
      >
        <Layer depth={3}>
          <Dropdown.RadioGroup
            value={props.value}
            onChange={(val) => props.onChange(val)}
          >
            <Dropdown.RadioItem
              value=""
              class="flex items-center justify-between px-2.5 py-1.5 text-xs rounded hover:bg-hover cursor-pointer outline-none text-ink-muted"
              closeOnSelect
            >
              <span>{t('Disabled')}</span>
              <Dropdown.ItemIndicator class="shrink-0">
                <CheckIcon class="size-3.5 text-accent" />
              </Dropdown.ItemIndicator>
            </Dropdown.RadioItem>

            <For each={allTagOptions()}>
              {(opt) => (
                <Dropdown.RadioItem
                  value={opt.id}
                  class="flex items-center justify-between px-2.5 py-1.5 text-xs rounded hover:bg-hover cursor-pointer outline-none"
                  closeOnSelect
                >
                  <span class="flex items-center gap-2 min-w-0 truncate">
                    <TagDot color={opt.color} class="size-2 shrink-0" />
                    <span class="truncate">{opt.label}</span>
                  </span>
                  <Dropdown.ItemIndicator class="shrink-0">
                    <CheckIcon class="size-3.5 text-accent" />
                  </Dropdown.ItemIndicator>
                </Dropdown.RadioItem>
              )}
            </For>
          </Dropdown.RadioGroup>
        </Layer>
      </Dropdown.Content>
    </Dropdown>
  );
}
