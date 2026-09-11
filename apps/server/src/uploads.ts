import sharp from 'sharp';

// Bound libvips memory on small home servers after large phone photos.
sharp.cache({ memory: 16, files: 0, items: 32 });
sharp.concurrency(1);

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
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
  const extension = name.split('.').pop()!.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
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
    return { data, extension: safeExtension(file.name), originalName: file.name.slice(0, 200), mimeType, byteSize: data.length };
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
    const extension = keepsTransparency ? '.png' as const : '.jpg' as const;
    const optimizedMimeType = keepsTransparency ? 'image/png' : 'image/jpeg';
    const isOversized = (metadata.width ?? 0) > maxImageDimension || (metadata.height ?? 0) > maxImageDimension;

    if (
      !isOversized
      && mimeType !== 'image/webp'
      && optimized.length >= data.length
      && ((mimeType === 'image/png' && keepsTransparency) || mimeType === 'image/jpeg')
    ) {
      return { data, extension: safeExtension(file.name), originalName: file.name.slice(0, 200), mimeType, byteSize: data.length };
    }
    return {
      data: optimized,
      extension,
      originalName: imageName(file.name, extension),
      mimeType: optimizedMimeType,
      byteSize: optimized.length,
    };
  } catch {
    throw new Error('Nie udało się odczytać lub zoptymalizować obrazu.');
  }
}
