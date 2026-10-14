import type { AssetSummary, BinderDocument } from '@boberit/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { unsavedAssetMessage, unsavedDocumentMessage } from '../labels';
import type { SetMessage, View } from '../types';
import type { SearchState } from './useSearch';

/**
 * Current view, open item or document, and the unsaved-changes guards. Every navigation
 * asks before discarding unsaved edits; closing the tab with unsaved edits asks the browser.
 */
export function useNavigation(search: SearchState, setMessage: SetMessage) {
  const [view, setView] = useState<View>('start');
  const [selected, setSelected] = useState<AssetSummary | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<BinderDocument | null>(null);
  const [hasUnsavedAssetChanges, setHasUnsavedAssetChanges] = useState(false);
  const [hasUnsavedDocumentChanges, setHasUnsavedDocumentChanges] = useState(false);
  // The view to return to when the search field is cleared.
  const searchOriginRef = useRef<View>('start');

  useEffect(() => {
    if (!hasUnsavedAssetChanges && !hasUnsavedDocumentChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedAssetChanges, hasUnsavedDocumentChanges]);

  function allowDiscardAssetChanges(): boolean {
    if (!selected || !hasUnsavedAssetChanges) return true;
    if (!window.confirm(unsavedAssetMessage)) return false;
    setHasUnsavedAssetChanges(false);
    return true;
  }

  function allowDiscardChanges(): boolean {
    if (!allowDiscardAssetChanges()) return false;
    if (!hasUnsavedDocumentChanges) return true;
    if (!window.confirm(unsavedDocumentMessage)) return false;
    setHasUnsavedDocumentChanges(false);
    return true;
  }

  function navigateTo(next: View): boolean {
    if (!allowDiscardChanges()) return false;
    search.clearSearch();
    setSelected(null);
    setView(next);
    return true;
  }

  function updateSearch(value: string) {
    if ((selected || view === 'document-ocr') && !allowDiscardChanges()) return;
    if (selected) setSelected(null);
    if (value && !search.query) searchOriginRef.current = view === 'search' ? searchOriginRef.current : view;
    if (!value.trim()) {
      search.clearSearch();
      setView(searchOriginRef.current);
      return;
    }
    search.startSearch(value);
    setView('search');
  }

  async function openDetail(id: string) {
    if (selected?.id !== id) {
      if (!allowDiscardChanges()) return;
      setSelected(null);
    }
    try {
      setSelected((await api.getAsset(id)).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się otworzyć przedmiotu.', 'error');
    }
  }

  function openDocument(document: BinderDocument) {
    setSelectedDocument(document);
    setView('document-ocr');
  }

  return {
    view,
    setView,
    selected,
    setSelected,
    selectedDocument,
    setSelectedDocument,
    setHasUnsavedAssetChanges,
    setHasUnsavedDocumentChanges,
    allowDiscardChanges,
    navigateTo,
    updateSearch,
    openDetail,
    openDocument,
  };
}

export type NavigationState = ReturnType<typeof useNavigation>;
