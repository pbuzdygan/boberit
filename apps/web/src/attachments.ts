import { api } from './api';

export async function downloadAttachment(id: string, name: string): Promise<void> {
  const blob = await api.fileBlob(id, 'download');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
// A blob URL runs with the app's origin, so only passive formats may open in a tab; anything else downloads.
const previewTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);
export async function previewAttachment(id: string, name: string): Promise<void> {
  // Open the tab during the click, so popup blockers allow it, and navigate it once the file has loaded.
  // window.open with 'noopener' returns null, which used to leave an extra blank tab behind.
  const target = window.open('', '_blank');
  if (target) target.opener = null;
  try {
    const response = await api.fileBlob(id, 'preview');
    const type = response.type.split(';')[0]!.trim().toLowerCase();
    if (!previewTypes.has(type)) {
      target?.close();
      return await downloadAttachment(id, name);
    }
    // Without a charset the browser decodes text as Windows-1252, which garbles Polish characters.
    const blobType = type === 'text/plain' ? 'text/plain;charset=utf-8' : type;
    const url = URL.createObjectURL(new Blob([response], { type: blobType }));
    if (target) target.location.href = url;
    else window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    target?.close();
    throw error;
  }
}
