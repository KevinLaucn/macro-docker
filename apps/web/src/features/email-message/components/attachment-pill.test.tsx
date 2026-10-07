import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EmailAttachmentPill } from './attachment-pill';

// EntityIcon imports the block registry, which initializes app services. This
// covers the pill's keyboard behavior, not isolation of the shared icon.
vi.mock('@core/component/EntityIcon', () => ({ EntityIcon: () => null }));

it('opens attachments with Enter and Space, while removal stays a separate keyboard action', async () => {
  const open = vi.fn();
  const remove = vi.fn();
  const user = userEvent.setup();
  const view = render(() => (
    <>
      <EmailAttachmentPill attachment={{ fileName: 'readonly.txt' }} />
      <EmailAttachmentPill
        attachment={{ fileName: 'agenda.pdf' }}
        onClick={open}
        removable
        onRemove={remove}
      />
    </>
  ));
  try {
    await user.tab();
    expect(document.activeElement).toBe(
      view.getByRole('button', { name: 'agenda.pdf' })
    );
    await user.keyboard('{Enter} ');
    expect(open).toHaveBeenCalledTimes(2);
    await user.tab();
    expect(document.activeElement).toBe(
      view.getByRole('button', { name: /Remove agenda\.pdf/ })
    );
    await user.keyboard('{Enter}');
    expect(remove).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledTimes(2);
  } finally {
    view.unmount();
  }
});

it('routes attachments correctly: PDF to pdf, AI(%PDF-) to pdf, AI(PS) to unknown, EPS to unknown', async () => {
  const { resolveAdobeAttachmentBlockName } = await import(
    '@macro/adobe-preview'
  );

  // 1. Regular PDF file routes to default 'pdf'
  const pdfBlock = await resolveAdobeAttachmentBlockName('document.pdf', 'pdf');
  expect(pdfBlock).toBe('pdf');

  // 2. AI file with %PDF- header routes to 'pdf' (official viewer)
  const pdfCompatibleAiBlob = new Blob(['%PDF-1.7 binary content']);
  const aiPdfBlock = await resolveAdobeAttachmentBlockName(
    'artwork.ai',
    'unknown',
    async () => pdfCompatibleAiBlob
  );
  expect(aiPdfBlock).toBe('pdf');

  // 3. AI file without %PDF- (pure PostScript) routes to 'unknown'
  const psAiBlob = new Blob([
    new TextEncoder().encode(
      '%!PS-Adobe-3.1 EPSF-3.0 %%Creator: Adobe Illustrator'
    ),
  ]);
  const aiPsBlock = await resolveAdobeAttachmentBlockName(
    'legacy.ai',
    'unknown',
    async () => psAiBlob
  );
  expect(aiPsBlock).toBe('unknown');

  // 4. EPS file unconditionally routes to 'unknown' (never 'pdf')
  const epsBlock = await resolveAdobeAttachmentBlockName(
    'graphic.eps',
    'unknown'
  );
  expect(epsBlock).toBe('unknown');
});
