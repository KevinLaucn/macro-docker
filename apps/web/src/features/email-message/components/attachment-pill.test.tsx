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

it('downloads from the split button without opening the attachment', async () => {
  const open = vi.fn();
  const download = vi.fn();
  const user = userEvent.setup();
  const view = render(() => (
    <EmailAttachmentPill
      attachment={{ fileName: 'agenda.pdf', mimeType: 'application/pdf' }}
      onClick={open}
      onDownload={download}
    />
  ));
  try {
    await user.tab();
    expect(document.activeElement).toBe(
      view.getByRole('button', { name: 'agenda.pdf' })
    );
    await user.keyboard('{Enter}');
    expect(open).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    await user.tab();
    const downloadButton = view.getByRole('button', {
      name: 'Download agenda.pdf',
    });
    expect(document.activeElement).toBe(downloadButton);
    await user.keyboard('{Enter}');
    expect(download).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    await user.click(downloadButton);
    expect(download).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledOnce();
  } finally {
    view.unmount();
  }
});

it('downloadOriginalAdobeDocument intercepts AI and EPS files to download original binary and ignores standard PDF', async () => {
  const { downloadOriginalAdobeDocument } = await import(
    '@macro/adobe-preview'
  );

  // 1. Regular PDF: should NOT intercept, returns false so PDF viewer handles it
  const isPdfHandled = await downloadOriginalAdobeDocument(
    'doc-pdf-id',
    'report.pdf'
  );
  expect(isPdfHandled).toBe(false);

  // 2. AI file: should intercept, fetch original binary and invoke downloadFile with .ai
  const mockAiBytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
  ]);
  const fetchMock = vi.fn(
    async () => new Response(mockAiBytes, { status: 200 })
  );
  vi.stubGlobal('fetch', fetchMock);

  vi.spyOn(
    await import('@queries/storage/binary-document'),
    'fetchBinaryDocumentData'
  ).mockResolvedValue({
    isOk: () => true,
    isErr: () => false,
    value: {
      blobUrl: 'https://storage.macro.com/original-artwork.ai',
      documentMetadata: {
        documentId: 'doc-ai-id',
        documentName: 'artwork',
        fileType: 'ai',
        documentVersionId: 1,
        owner: 'user-1',
      },
    },
  } as any);

  const downloadFileSpy = vi
    .spyOn(await import('@filesystem/download'), 'downloadFile')
    .mockResolvedValue({ saved: true });

  const isAiHandled = await downloadOriginalAdobeDocument(
    'doc-ai-id',
    'artwork.ai'
  );
  expect(isAiHandled).toBe(true);
  expect(downloadFileSpy).toHaveBeenCalledWith(
    expect.any(Blob),
    'artwork.ai'
  );
  const downloadedBlob = downloadFileSpy.mock.calls[0][0];
  expect(downloadedBlob.type).toBe('application/postscript');

  vi.unstubAllGlobals();
});
