export type AdobeFormat = 'ai' | 'eps';

export type AdobePreviewResult =
  | {
      kind: 'ai-pdf';
      blob: Blob;
    }
  | {
      kind: 'eps-tiff';
      blob: Blob;
    }
  | {
      kind: 'source-no-preview';
      format: AdobeFormat;
    }
  | {
      kind: 'unsupported-preview';
      format: 'eps';
      reason: 'wmf-only' | 'tiff-unsupported';
    }
  | {
      kind: 'load-error';
      format: AdobeFormat;
      error?: string;
    };

const EPS_BINARY_MAGIC = [0xc5, 0xd0, 0xd3, 0xc6];

/**
 * Inspects an Adobe Illustrator (.ai) blob to check if it contains a valid PDF-compatible stream (%PDF-).
 */
export async function inspectAi(blob: Blob): Promise<AdobePreviewResult> {
  if (blob.size < 5) {
    return {
      kind: 'source-no-preview',
      format: 'ai',
    };
  }

  try {
    const buffer = await blob.slice(0, 5).arrayBuffer();
    const b = new Uint8Array(buffer);

    const isPdf =
      b[0] === 0x25 && // %
      b[1] === 0x50 && // P
      b[2] === 0x44 && // D
      b[3] === 0x46 && // F
      b[4] === 0x2d; // -

    if (isPdf) {
      return {
        kind: 'ai-pdf',
        blob,
      };
    }

    return {
      kind: 'source-no-preview',
      format: 'ai',
    };
  } catch (e: any) {
    return {
      kind: 'load-error',
      format: 'ai',
      error: e?.message ?? 'Failed to inspect AI file',
    };
  }
}

/**
 * Inspects an Encapsulated PostScript (.eps) blob to extract embedded TIFF or report WMF/unsupported states.
 */
export async function inspectEps(blob: Blob): Promise<AdobePreviewResult> {
  if (blob.size < 30) {
    return {
      kind: 'source-no-preview',
      format: 'eps',
    };
  }

  try {
    const header = await blob.slice(0, 30).arrayBuffer();
    const dv = new DataView(header);

    const isBinary =
      dv.getUint8(0) === EPS_BINARY_MAGIC[0] &&
      dv.getUint8(1) === EPS_BINARY_MAGIC[1] &&
      dv.getUint8(2) === EPS_BINARY_MAGIC[2] &&
      dv.getUint8(3) === EPS_BINARY_MAGIC[3];

    if (!isBinary) {
      return {
        kind: 'source-no-preview',
        format: 'eps',
      };
    }

    const wmfOffset = dv.getUint32(12, true);
    const wmfLength = dv.getUint32(16, true);

    const tiffOffset = dv.getUint32(20, true);
    const tiffLength = dv.getUint32(24, true);

    if (tiffOffset > 0 && tiffLength > 0) {
      const end = tiffOffset + tiffLength;
      if (end > blob.size) {
        return {
          kind: 'load-error',
          format: 'eps',
          error: 'Corrupted EPS header: TIFF offset/length exceeds file size',
        };
      }

      return {
        kind: 'eps-tiff',
        blob: blob.slice(tiffOffset, end),
      };
    }

    if (wmfOffset > 0 && wmfLength > 0) {
      return {
        kind: 'unsupported-preview',
        format: 'eps',
        reason: 'wmf-only',
      };
    }

    return {
      kind: 'source-no-preview',
      format: 'eps',
    };
  } catch (e: any) {
    return {
      kind: 'load-error',
      format: 'eps',
      error: e?.message ?? 'Failed to inspect EPS file',
    };
  }
}

/**
 * Helper to identify Adobe format from filename.
 */
export function getAdobeFormatFromFileName(fileName?: string | null): AdobeFormat | null {
  if (!fileName) return null;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'ai') return 'ai';
  if (ext === 'eps') return 'eps';
  return null;
}
