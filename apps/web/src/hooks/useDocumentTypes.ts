import type { DocumentType } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useReportError } from './useReportError';

/** Document types of the active household, loaded once per mount; a failed load is shown as a toast. */
export function useDocumentTypes(): DocumentType[] {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const reportError = useReportError();
  useEffect(() => {
    void api
      .listDocumentTypes()
      .then((response) => setTypes(response.data))
      .catch(reportError('Nie udało się wczytać typów dokumentów.'));
  }, []);
  return types;
}
