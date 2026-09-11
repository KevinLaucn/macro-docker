import {
  PixelBlockingSection,
  ReadReceiptsSection,
} from '@app/features/email-read-receipts';
import { EmailTranslationSection } from '@app/features/email-translation';
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@app/features/settings/primitives';
import { DropdownMenu as KobalteDropdownMenu } from '@kobalte/core/dropdown-menu';
import { locale, type SupportedLocale, setLocale, t } from '@macro/i18n';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import { Dropdown, Layer } from '@ui';
import { createSignal, For } from 'solid-js';
import { awaitingReplyTagId, setAwaitingReplyTagId } from './extensionsState';
import { TagSelectorDropdown } from './TagSelectorDropdown';

const LANGUAGE_OPTIONS: { label: string; value: SupportedLocale }[] = [
  { label: 'English', value: 'en-US' },
  { label: '简体中文', value: 'zh-CN' },
];

function LanguageSelect() {
  const [open, setOpen] = createSignal(false);

  const currentLabel = () =>
    LANGUAGE_OPTIONS.find((opt) => opt.value === locale())?.label ?? 'English';

  return (
    <Dropdown placement="bottom-end" open={open()} onOpenChange={setOpen}>
      <KobalteDropdownMenu.Trigger class="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border border-edge-muted bg-surface hover:bg-ink/4 text-ink transition-colors cursor-pointer outline-none">
        <span>{currentLabel()}</span>
        <CaretDownIcon class="size-3 text-ink-muted shrink-0" />
      </KobalteDropdownMenu.Trigger>
      <Dropdown.Content
        as="div"
        class="w-36 overflow-hidden border border-ink/[0.05] bg-surface shadow-menu rounded-lg p-1"
      >
        <Layer depth={3}>
          <Dropdown.RadioGroup
            value={locale()}
            onChange={(val) => setLocale(val as SupportedLocale)}
          >
            <For each={LANGUAGE_OPTIONS}>
              {(option) => (
                <Dropdown.RadioItem
                  value={option.value}
                  class="flex items-center justify-between px-2.5 py-1.5 text-xs rounded hover:bg-hover cursor-pointer outline-none"
                  closeOnSelect
                >
                  <span>{option.label}</span>
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

export function Extensions() {
  return (
    <SettingsPage title={t('Extensions')}>
      {/* 1. Interface & Language */}
      <SettingsSection title={t('Interface')}>
        <SettingsCard>
          <SettingsRow
            label={t('Language')}
            description={t('Choose your preferred display language.')}
          >
            <LanguageSelect />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      {/* 2. Email Custom Features */}
      <SettingsSection title={t('Email Enhancements')}>
        <SettingsCard>
          <SettingsRow
            label={t('Awaiting reply badge')}
            description={t(
              'Automatically add a tag to threads awaiting reply.'
            )}
          >
            <TagSelectorDropdown
              value={awaitingReplyTagId()}
              onChange={(tagId) => setAwaitingReplyTagId(tagId)}
            />
          </SettingsRow>
          {/* PRIVATE-HOOK: read_receipts:settings */}
          <ReadReceiptsSection />
          <PixelBlockingSection />
          {/* PRIVATE-HOOK: email_translation:settings */}
          <EmailTranslationSection />
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
}
