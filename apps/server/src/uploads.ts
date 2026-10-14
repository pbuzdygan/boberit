import sharp from 'sharp';
import { matchesDeclaredType } from './file-signatures.js';
import { PublicError } from './http.js';

// Bound libvips memory on small home servers after large phone photos.
sharp.cache({ memory: 16, files: 0, items: 32 });
sharp.concurrency(1);

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const maxUploadBytes = 25 * 1024 * 1024;
const allowedUploadTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
// Types a stored file may carry: the upload allowlist plus the fallback for files sent without a type.
export const storedFileTypes = new Set([...allowedUploadTypes, 'application/octet-stream']);
// Only passive formats are shown inline; anything else is served as a download.
export const inlinePreviewTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);

export function validateUpload(file: File): void {
  if (file.size === 0) throw new PublicError('Nie można dodać pustego pliku.');
  if (file.size > maxUploadBytes) throw new PublicError('Plik jest zbyt duży. Maksymalny rozmiar to 25 MB.');
  if (file.type && !allowedUploadTypes.has(file.type)) throw new PublicError('Ten typ pliku nie jest obsługiwany.');
}
const maxImageDimension = 2000;
const jpegQuality = 84;
const pngCompressionLevel = 9;

export interface PreparedUpload {
  data: Buffer;
  extension: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
}

function safeExtension(name: string): string {
  if (!name.includes('.')) return '';
  const extension = name
    .split('.')
    .pop()!
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12);
  return extension ? `.${extension}` : '';
}

function imageName(name: string, extension: '.jpg' | '.png'): string {
  const base = name.replace(/\.[^.]*$/, '').trim() || 'zdjecie';
  const maxBaseLength = 200 - extension.length;
  return base.slice(0, maxBaseLength) + extension;
}

export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const data = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type.toLowerCase() || 'application/octet-stream';
  if (!imageTypes.has(mimeType)) {
    // Files without a declared type are stored as downloads only (application/octet-stream).
    if (mimeType !== 'application/octet-stream' && !matchesDeclaredType(data, mimeType))
      throw new PublicError('Zawartość pliku nie pasuje do jego typu.');
    return {
      data,
      extension: safeExtension(file.name),
      originalName: file.name.slice(0, 200),
      mimeType,
      byteSize: data.length,
    };
  }

  try {
    const metadata = await sharp(data).metadata();
    const pipeline = sharp(data)
      .rotate()
      .resize({ width: maxImageDimension, height: maxImageDimension, fit: 'inside', withoutEnlargement: true });
    const keepsTransparency = metadata.hasAlpha === true;
    const optimized = keepsTransparency
      ? await pipeline.png({ compressionLevel: pngCompressionLevel, adaptiveFiltering: true }).toBuffer()
      : await pipeline.jpeg({ quality: jpegQuality, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
    const extension = keepsTransparency ? ('.png' as const) : ('.jpg' as const);
    const optimizedMimeType = keepsTransparency ? 'image/png' : 'image/jpeg';
    const isOversized = (metadata.width ?? 0) > maxImageDimension || (metadata.height ?? 0) > maxImageDimension;

    // The original bytes are kept only when they really are the declared format; anything else
    // that libvips can decode (for example SVG or GIF) is stored as the re-encoded image.
    const sameFormat = metadata.format === mimeType.slice('image/'.length);
    if (
      sameFormat &&
      !isOversized &&
      mimeType !== 'image/webp' &&
      optimized.length >= data.length &&
      ((mimeType === 'image/png' && keepsTransparency) || mimeType === 'image/jpeg')
    ) {
      return {
        data,
        extension: safeExtension(file.name),
        originalName: file.name.slice(0, 200),
        mimeType,
        byteSize: data.length,
      };
    }
    return {
      data: optimized,
      extension,
      originalName: imageName(file.name, extension),
      mimeType: optimizedMimeType,
      byteSize: optimized.length,
    };
  } catch {
    throw new PublicError('Nie udało się odczytać lub zoptymalizować obrazu.');
  }
}
