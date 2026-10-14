import type { AssetSummary, BinderDocument, InboxFile, TrashEntry } from '@boberit/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { PurchaseValue, SetMessage } from '../types';
import type { NavigationState } from './useNavigation';
import type { SearchState } from './useSearch';

/**
 * Household data shown across views. `refresh` reloads everything, including the open item
 * and an active search; the sequence counter drops responses from superseded refreshes.
 * `hasLoaded` stays false until the first successful load, so views can tell "not loaded yet"
 * or "failed to load" (`loadError`) apart from a genuinely empty household.
 */
export function useCollections({
  accessToken,
  navigation,
  search,
  setMessage,
}: {
  accessToken: string | null;
  navigation: NavigationState;
  search: SearchState;
  setMessage: SetMessage;
}) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [inboxFiles, setInboxFiles] = useState<InboxFile[]>([]);
  const [documents, setDocuments] = useState<BinderDocument[]>([]);
  const [storageBytes, setStorageBytes] = useState(0);
  const [purchaseValues, setPurchaseValues] = useState<PurchaseValue[]>([]);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const refreshSequence = useRef(0);
  const { selected, setSelected, setSelectedDocument } = navigation;

  async function refresh() {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    try {
      const [response, inboxResponse, documentsResponse, trashResponse, storageResponse] = await Promise.all([
        api.listAssets(),
        api.listInbox(),
        api.listDocuments(),
        api.listTrash(),
        api.storage(),
      ]);
      if (sequence !== refreshSequence.current) return;
      setAssets(response.data);
      setInboxFiles(inboxResponse.data);
      setDocuments(documentsResponse.data);
      setTrashEntries(trashResponse.data);
      setStorageBytes(Number(storageResponse.data.bytes));
      setPurchaseValues(storageResponse.data.purchaseValues ?? []);
      setHasLoaded(true);
      setLoadError(null);
      setSelectedDocument((current) =>
        current ? (documentsResponse.data.find((document) => document.id === current.id) ?? current) : null,
      );
      if (search.queryRef.current.trim()) void search.refreshSearch(search.queryRef.current);
      if (selected) {
        const selectedResponse = await api.getAsset(selected.id);
        if (sequence === refreshSequence.current) setSelected(selectedResponse.data);
      }
    } catch (error) {
      if (sequence === refreshSequence.current) {
        const message = error instanceof Error ? error.message : 'Nie udało się odczytać kolekcji.';
        setLoadError(message);
        setMessage(message, 'error');
      }
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }

  // Runs after the session hook's effect, which hands the token to the API client first.
  useEffect(() => {
    if (!accessToken) return;
    const reloadDictionaries = () => void refresh();
    void refresh();
    window.addEventListener('boberit-data-dictionaries-changed', reloadDictionaries);
    return () => window.removeEventListener('boberit-data-dictionaries-changed', reloadDictionaries);
  }, [accessToken]);

  /** Drops all household data after logout; a refresh still in flight is ignored. */
  function clearCollections() {
    ++refreshSequence.current;
    setSelected(null);
    setAssets([]);
    setDocuments([]);
    setStorageBytes(0);
    setPurchaseValues([]);
    setSelectedDocument(null);
    setInboxFiles([]);
    setTrashEntries([]);
    setHasLoaded(false);
    setLoadError(null);
  }

  return {
    assets,
    inboxFiles,
    documents,
    storageBytes,
    purchaseValues,
    trashEntries,
    isLoading,
    hasLoaded,
    loadError,
    refresh,
    clearCollections,
  };
}
