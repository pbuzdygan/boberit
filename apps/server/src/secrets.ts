import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const encryptionKey = process.env.APP_ENC_KEY ? Buffer.from(process.env.APP_ENC_KEY, 'hex') : null;
if (!encryptionKey || encryptionKey.length !== 32)
  throw new Error('APP_ENC_KEY jest wymagany i musi mieć 64 znaki hex. Wygeneruj go: openssl rand -hex 32');
export function encryptSecret(secret: string): string | null {
  if (!secret) return null;
  if (!encryptionKey || encryptionKey.length !== 32)
    throw new Error('Ustaw APP_ENC_KEY (openssl rand -hex 32), aby zapisać sekret webhooka.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const value = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${value.toString('hex')}`;
}
export function decryptSecret(value: string | null): string | null {
  if (!value) return null;
  if (!encryptionKey || encryptionKey.length !== 32) return null;
  const [iv, tag, data] = value.split(':');
  if (!iv || !tag || !data) return null;
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'hex')), cipher.final()]).toString('utf8');
}
