export const megabyte = 1024 * 1024;
export function failure(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return { error: { code, message }, status };
}
export async function json<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Nieprawidłowy JSON.');
  }
}
