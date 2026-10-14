import type { AssetOption } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';

/** Categories and locations of the active household, loaded once per mount. */
export function useAssetOptions(): AssetOption[] {
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  useEffect(() => {
    void api.listAssetOptions().then((response) => setAssetOptions(response.data));
  }, []);
  return assetOptions;
}
