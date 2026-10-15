import { createContext, useContext } from 'react';

/** Shows an error message as a toast; provided by `App`. */
export const ReportErrorContext = createContext<((message: string) => void) | null>(null);

/**
 * For views without their own error area: returns a rejection handler that shows the error of a
 * failed action as a toast, e.g. `void onRestore(id).catch(reportError('Nie udało się …'))`.
 * The fallback covers rejections that are not `Error` instances.
 */
export function useReportError() {
  const show = useContext(ReportErrorContext);
  if (!show) throw new Error('useReportError must be used inside ReportErrorContext.');
  return (fallback: string) => (error: unknown) => show(error instanceof Error ? error.message : fallback);
}
