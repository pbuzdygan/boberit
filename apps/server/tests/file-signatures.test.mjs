import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesDeclaredType } from '../src/file-signatures.ts';

const bytes = (...values) => Uint8Array.from(values);
const text = (value) => new TextEncoder().encode(value);
const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

test('documents must start with their format signature', () => {
  assert.equal(matchesDeclaredType(text('%PDF-1.7\n...'), 'application/pdf'), true);
  assert.equal(matchesDeclaredType(text('\n\n%PDF-1.4'), 'application/pdf'), true);
  assert.equal(matchesDeclaredType(text(' '.repeat(2000) + '%PDF-1.4'), 'application/pdf'), false);
  assert.equal(matchesDeclaredType(text('<html><script></script>'), 'application/pdf'), false);
  assert.equal(matchesDeclaredType(bytes(0x50, 0x4b, 0x03, 0x04, 0x14), docx), true);
  assert.equal(matchesDeclaredType(text('PK'), docx), false);
  assert.equal(
    matchesDeclaredType(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0), 'application/msword'),
    true,
  );
  assert.equal(matchesDeclaredType(text('{\\rtf1'), 'application/msword'), false);
});

test('text files accept any 8-bit encoding but not binary content', () => {
  assert.equal(matchesDeclaredType(text('Zażółć gęślą jaźń'), 'text/plain'), true);
  // "ąę" in Windows-1250.
  assert.equal(matchesDeclaredType(bytes(0xb9, 0xea, 0x0a), 'text/plain'), true);
  assert.equal(matchesDeclaredType(bytes(0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01), 'text/plain'), false);
});

test('images must carry the signature of the declared format', () => {
  assert.equal(matchesDeclaredType(bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'), true);
  assert.equal(matchesDeclaredType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'), true);
  assert.equal(matchesDeclaredType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/jpeg'), false);
  assert.equal(matchesDeclaredType(text('RIFF\0\0\0\0WEBPVP8 '), 'image/webp'), true);
  assert.equal(matchesDeclaredType(text('RIFF\0\0\0\0WAVEfmt '), 'image/webp'), false);
  assert.equal(matchesDeclaredType(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'), false);
});

test('unknown types never match', () => {
  assert.equal(matchesDeclaredType(text('anything'), 'application/octet-stream'), false);
  assert.equal(matchesDeclaredType(text('<html>'), 'text/html'), false);
});
