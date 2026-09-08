import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const maxPages = 12;
const timeout = 45_000;

async function command(binary: string, args: string[]): Promise<string> {
  const result = await execute(binary, args, { timeout, maxBuffer: 8 * 1024 * 1024 });
  return result.stdout.trim();
}

async function imageText(path: string): Promise<string> {
  return command('tesseract', [path, 'stdout', '-l', 'pol+eng']);
}

export async function extractDocumentText(path: string, mimeType: string): Promise<{ status: 'completed' | 'unsupported'; text: string }> {
  if (mimeType.startsWith('image/')) {
    return { status: 'completed', text: await imageText(path) };
  }
  if (mimeType !== 'application/pdf') return { status: 'unsupported', text: '' };

  const embedded = await command('pdftotext', [path, '-']).catch(() => '');
  if (embedded.replace(/\s/g, '').length >= 20) return { status: 'completed', text: embedded };

  const directory = await mkdtemp(join(tmpdir(), 'boberit-ocr-'));
  try {
    const prefix = join(directory, 'page');
    await command('pdftoppm', ['-jpeg', '-r', '200', '-f', '1', '-l', String(maxPages), path, prefix]);
    const pages = Array.from({ length: maxPages }, (_, index) => join(directory, `page-${index + 1}.jpg`));
    const text: string[] = [];
    for (const page of pages) {
      try { text.push(await imageText(page)); } catch { break; }
    }
    return { status: 'completed', text: text.join('\n\n') };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
