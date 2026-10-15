export type Row = Record<string, unknown>;

export function now(): string {
  return new Date().toISOString();
}
export function nullable(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
export function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}
export function parseTags(raw: unknown): string[] {
  try {
    return JSON.parse(String(raw ?? '[]')) as string[];
  } catch {
    return [];
  }
}
