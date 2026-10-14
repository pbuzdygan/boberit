import { documentFilesForOcr, setDocumentOcr } from './db/documents.js';
import { extractDocumentText } from './ocr.js';
import { resolveStoredFile } from './storage.js';

export async function runDocumentOcr(householdId: string, documentId: string): Promise<void> {
  const files = documentFilesForOcr(householdId, documentId);
  if (!files.length) {
    setDocumentOcr(householdId, documentId, 'unsupported', '', 'Dokument nie ma załączników.');
    return;
  }
  setDocumentOcr(householdId, documentId, 'processing');
  try {
    const parts: string[] = [];
    let supported = false;
    const includeFileNames = files.length > 1;
    for (const file of files) {
      const result = await extractDocumentText(
        resolveStoredFile('documents', householdId, String(file.stored_name)),
        String(file.mime_type),
      );
      if (result.status === 'completed') {
        supported = true;
        if (result.text.trim())
          parts.push(
            includeFileNames ? '[' + String(file.original_name) + ']\n' + result.text.trim() : result.text.trim(),
          );
      }
    }
    if (!supported) {
      setDocumentOcr(householdId, documentId, 'unsupported', '', 'OCR obsługuje obrazy i PDF.');
      return;
    }
    setDocumentOcr(householdId, documentId, 'completed', parts.join('\n\n'));
  } catch (error) {
    // Tool errors can contain server paths, so the stored reason is generic; details go to the log.
    console.error(`OCR dokumentu ${documentId} nie powiódł się:`, error);
    setDocumentOcr(householdId, documentId, 'failed', '', 'Nie udało się rozpoznać tekstu.');
  }
}
