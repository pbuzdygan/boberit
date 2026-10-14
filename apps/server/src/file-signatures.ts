// Content checks for stored files: the declared type must match the file's leading bytes, so a
// renamed or mislabeled file cannot reach the OCR tools or a preview under a false type.

const startsWith = (data: Uint8Array, bytes: number[], offset = 0) =>
  data.length >= offset + bytes.length && bytes.every((byte, index) => data[offset + index] === byte);
const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

const zip = [0x50, 0x4b, 0x03, 0x04];
const ole2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
// The PDF header may follow up to 1024 bytes of leading data (ISO 32000-1, 7.5.2).
const pdfHeaderWindow = 1024;
// Text files are not decoded (Polish text may be Windows-1250); binary content is recognised by NUL bytes.
const textSampleBytes = 64 * 1024;

function isPdf(data: Uint8Array): boolean {
  return Buffer.from(data.subarray(0, pdfHeaderWindow + 5)).includes('%PDF-');
}

/** True when `data` plausibly has the declared MIME type. Unknown types never match. */
export function matchesDeclaredType(data: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case 'application/pdf':
      return isPdf(data);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return startsWith(data, zip);
    case 'application/msword':
      return startsWith(data, ole2);
    case 'text/plain':
      return !data.subarray(0, textSampleBytes).includes(0);
    case 'image/jpeg':
      return startsWith(data, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp':
      return startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8);
    default:
      return false;
  }
}
