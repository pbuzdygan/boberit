import type { AssetOption } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useReportError } from './useReportError';

/** Categories and locations of the active household, loaded once per mount; a failed load is shown as a toast. */
export function useAssetOptions(): AssetOption[] {
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  const reportError = useReportError();
  useEffect(() => {
    void api
      .listAssetOptions()
      .then((response) => setAssetOptions(response.data))
      .catch(reportError('Nie udało się wczytać kategorii i lokalizacji.'));
  }, []);
  return assetOptions;
}
