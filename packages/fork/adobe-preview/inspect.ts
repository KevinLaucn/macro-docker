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

async function getBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof (blob as any).arrayBuffer === 'function') {
    return await blob.arrayBuffer();
  }
  const internalBuf =
    (blob as any)[Symbol.for('buffer')] || (blob as any)._buffer;
  if (internalBuf && internalBuf.buffer instanceof ArrayBuffer) {
    return internalBuf.buffer.slice(
      internalBuf.byteOffset,
      internalBuf.byteOffset + internalBuf.byteLength
    );
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }
  if (typeof Response !== 'undefined') {
    try {
      return await new Response(blob).arrayBuffer();
    } catch {
      // fallback
    }
  }
  return new ArrayBuffer(0);
}

/**
 * Inspects an Adobe Illustrator (.ai) blob to check if it contains a valid PDF-compatible stream (%PDF-).
 */
export async function inspectAi(blob: Blob): Promise<AdobePreviewResult> {
  try {
    const rawBuffer = await getBlobArrayBuffer(blob);
    if (rawBuffer.byteLength < 5) {
      return {
        kind: 'source-no-preview',
        format: 'ai',
      };
    }
    const checkLen = Math.min(rawBuffer.byteLength, 1024);
    const b = new Uint8Array(rawBuffer, 0, checkLen);

    let isPdf = false;
    for (let i = 0; i <= b.length - 5; i++) {
      if (
        b[i] === 0x25 && // %
        b[i + 1] === 0x50 && // P
        b[i + 2] === 0x44 && // D
        b[i + 3] === 0x46 && // F
        b[i + 4] === 0x2d // -
      ) {
        isPdf = true;
        break;
      }
    }

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
 * Resolves the appropriate block name for an email attachment.
 * - AI: inspects file header; if PDF-compatible (%PDF-), routes to 'pdf' (official viewer).
 *       Otherwise routes to 'unknown' (AdobePreviewContainer fallback).
 * - EPS: unconditionally routes to 'unknown' (AdobePreviewContainer TIFF preview / download). Never enters 'pdf'.
 * - Other: returns defaultBlockName.
 */
export async function resolveAdobeAttachmentBlockName<T extends string>(
  fileName: string | null | undefined,
  defaultBlockName: T,
  inspectBlobFn?: () => Promise<Blob | undefined>
): Promise<T | 'pdf' | 'unknown'> {
  const format = getAdobeFormatFromFileName(fileName);
  if (!format) return defaultBlockName;

  if (format === 'eps') {
    return 'unknown';
  }

  if (format === 'ai') {
    if (inspectBlobFn) {
      try {
        const blob = await inspectBlobFn();
        if (blob) {
          const result = await inspectAi(blob);
          if (result.kind === 'ai-pdf') {
            return 'pdf';
          }
        }
      } catch (e) {
        console.warn('Failed to inspect AI attachment header:', e);
      }
    }
    return 'unknown';
  }

  return defaultBlockName;
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
export function getAdobeFormatFromFileName(
  fileName?: string | null
): AdobeFormat | null {
  if (!fileName) return null;
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'ai') return 'ai';
  if (ext === 'eps') return 'eps';
  return null;
}
