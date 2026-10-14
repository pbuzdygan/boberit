import type { AssetSummary, BinderDocument } from '@boberit/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

/**
 * Debounced search across items and documents. `queryRef` holds the latest query so that
 * late responses for an older query are dropped; the sequence counter does the same for
 * overlapping requests. Also focuses the search field on `/` outside editable elements.
 */
export function useSearch(accessToken: string | null) {
  const [query, setQuery] = useState('');
  const [searchAssets, setSearchAssets] = useState<AssetSummary[]>([]);
  const [searchDocuments, setSearchDocuments] = useState<BinderDocument[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchSequence = useRef(0);
  const queryRef = useRef('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  function clearSearch() {
    queryRef.current = '';
    ++searchSequence.current;
    setQuery('');
    setSearchAssets([]);
    setSearchDocuments([]);
    setSearching(false);
    setSearchError('');
  }

  /** Shows an empty, loading result list for `value`; the debounced effect then runs the search. */
  function startSearch(value: string) {
    queryRef.current = value;
    ++searchSequence.current;
    setSearchAssets([]);
    setSearchDocuments([]);
    setSearchError('');
    setSearching(true);
    setQuery(value);
  }

  async function refreshSearch(search: string) {
    if (!search.trim() || search !== queryRef.current) return;
    const sequence = ++searchSequence.current;
    setSearching(true);
    setSearchError('');
    try {
      const [assetResponse, documentResponse] = await Promise.all([api.listAssets(search), api.listDocuments(search)]);
      if (sequence !== searchSequence.current || search !== queryRef.current) return;
      setSearchAssets(assetResponse.data);
      setSearchDocuments(documentResponse.data);
    } catch (error) {
      if (sequence === searchSequence.current)
        setSearchError(error instanceof Error ? error.message : 'Nie udało się wyszukać.');
    } finally {
      if (sequence === searchSequence.current) setSearching(false);
    }
  }

  useEffect(() => {
    if (!accessToken || !query.trim()) return;
    const timeout = window.setTimeout(() => {
      void refreshSearch(query);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query, accessToken]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key !== '/' || isEditing || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  return {
    query,
    queryRef,
    searchAssets,
    searchDocuments,
    isSearching,
    searchError,
    searchInputRef,
    clearSearch,
    startSearch,
    refreshSearch,
  };
}

export type SearchState = ReturnType<typeof useSearch>;
