import {
  type AssetFileKind,
  type AssetSummary,
  type BinderDocument,
  type CreateBinderDocumentInput,
  type InboxFile,
  type CreateAssetInput,
  type TrashEntry,
  type TrashKind,
  type MaintenancePlan,
  type WarrantyKind,
  daysUntil,
  localDate,
} from '@boberit/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, setAccessToken } from './api';
import { AccountMenu } from './components/AccountMenu';
import { CompletionDialog } from './components/CompletionDialog';
import { Icon } from './components/Icon';
import { MobileMoreMenu } from './components/MobileMoreMenu';
import { NotificationsMenu } from './components/NotificationsMenu';
import { QuickAddDialog } from './components/QuickAddDialog';
import { localDateKey } from './format';
import { warrantyLabel, unsavedAssetMessage, unsavedDocumentMessage } from './labels';
import { AccountPage } from './pages/AccountPage';
import { Detail } from './pages/AssetDetail';
import { AuthScreen } from './pages/AuthScreen';
import { BinderPage } from './pages/BinderPage';
import { DocumentOcrPage } from './pages/DocumentOcrPage';
import { InboxPage } from './pages/InboxPage';
import { ItemsPage } from './pages/ItemsPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { StartPage } from './pages/StartPage';
import { TimelinePage } from './pages/TimelinePage';
import { TrashPage } from './pages/TrashPage';
import type {
  View,
  AccountSection,
  TimelineFilter,
  CollectionFilter,
  ReminderEntry,
  UiNotification,
  PurchaseValue,
} from './types';

export function App() {
  const [accessToken, setToken] = useState<string | null>(() => sessionStorage.getItem('boberit-session'));
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [inboxFiles, setInboxFiles] = useState<InboxFile[]>([]);
  const [documents, setDocuments] = useState<BinderDocument[]>([]);
  const [storageBytes, setStorageBytes] = useState(0);
  const [purchaseValues, setPurchaseValues] = useState<PurchaseValue[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<BinderDocument | null>(null);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [query, setQuery] = useState('');
  const [searchAssets, setSearchAssets] = useState<AssetSummary[]>([]);
  const [searchDocuments, setSearchDocuments] = useState<BinderDocument[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchSequence = useRef(0);
  const queryRef = useRef('');
  const [selected, setSelected] = useState<AssetSummary | null>(null);
  const [hasUnsavedAssetChanges, setHasUnsavedAssetChanges] = useState(false);
  const [hasUnsavedDocumentChanges, setHasUnsavedDocumentChanges] = useState(false);
  const [isQuickAddOpen, setQuickAddOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [message, setMessageValue] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<UiNotification[]>(() => {
    try {
      const stored = localStorage.getItem('boberit-ui-notifications');
      return stored ? (JSON.parse(stored) as UiNotification[]) : [];
    } catch {
      return [];
    }
  });
  const [todayReadOn, setTodayReadOn] = useState(() => {
    try {
      return localStorage.getItem('boberit-today-notifications-read') ?? '';
    } catch {
      return '';
    }
  });
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [view, setView] = useState<View>('start');
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [completionPlan, setCompletionPlan] = useState<MaintenancePlan | null>(null);
  const refreshSequence = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOriginRef = useRef<View>('start');
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [households, setHouseholds] = useState<{ id: string; name: string; role: string }[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const isOwner = households.find((household) => household.id === activeHouseholdId)?.role === 'owner';
  const [account, setAccount] = useState<{ login: string; email: string } | null>(null);
  const [accountSection, setAccountSection] = useState<AccountSection>('households');

  function setMessage(next: string | null) {
    setMessageValue(next);
    if (!next) return;
    setNotifications((current) =>
      [
        { id: String(Date.now()) + '-' + String(Math.random()), message: next, createdAt: Date.now() },
        ...current,
      ].slice(0, 50),
    );
  }

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
      setSelectedDocument((current) =>
        current ? (documentsResponse.data.find((document) => document.id === current.id) ?? current) : null,
      );
      if (queryRef.current.trim()) void refreshSearch(queryRef.current);
      if (selected) {
        const selectedResponse = await api.getAsset(selected.id);
        if (sequence === refreshSequence.current) setSelected(selectedResponse.data);
      }
    } catch (error) {
      if (sequence === refreshSequence.current)
        setMessage(error instanceof Error ? error.message : 'Nie udało się odczytać kolekcji.');
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    const loadHouseholds = () =>
      void api
        .households()
        .then((r) => {
          setHouseholds(r.data.households);
          setActiveHouseholdId(r.data.activeHouseholdId);
        })
        .catch(() => undefined);
    const reloadDictionaries = () => void refresh();
    setAccessToken(accessToken);
    if (accessToken) {
      void refresh();
      loadHouseholds();
      void api
        .me()
        .then((r) => setAccount(r.data))
        .catch(() => setAccount(null));
      window.addEventListener('boberit-households-changed', loadHouseholds);
      window.addEventListener('boberit-data-dictionaries-changed', reloadDictionaries);
    }
    return () => {
      window.removeEventListener('boberit-households-changed', loadHouseholds);
      window.removeEventListener('boberit-data-dictionaries-changed', reloadDictionaries);
    };
  }, [accessToken]);
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

  function clearSearch() {
    queryRef.current = '';
    ++searchSequence.current;
    setQuery('');
    setSearchAssets([]);
    setSearchDocuments([]);
    setSearching(false);
    setSearchError('');
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

  function navigateTo(next: View): boolean {
    if (!allowDiscardChanges()) return false;
    clearSearch();
    setSelected(null);
    setView(next);
    return true;
  }

  function openQuickAdd() {
    if (!allowDiscardChanges()) return;
    if (selected) {
      setSelected(null);
      setView('items');
    }
    setQuickAddOpen(true);
  }

  function updateSearch(value: string) {
    if ((selected || view === 'document-ocr') && !allowDiscardChanges()) return;
    if (selected) setSelected(null);
    if (value && !query) searchOriginRef.current = view === 'search' ? searchOriginRef.current : view;
    if (!value.trim()) {
      clearSearch();
      setView(searchOriginRef.current);
      return;
    }
    queryRef.current = value;
    ++searchSequence.current;
    setSearchAssets([]);
    setSearchDocuments([]);
    setSearchError('');
    setSearching(true);
    setQuery(value);
    setView('search');
  }

  async function switchHousehold(id: string) {
    if (!allowDiscardChanges()) return;
    try {
      await api.selectHousehold(id);
      clearSearch();
      setActiveHouseholdId(id);
      setSelected(null);
      setView('start');
      await refresh();
      setMessage('Przełączono gospodarstwo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się przełączyć gospodarstwa.');
    }
  }
  async function logout() {
    if (!allowDiscardChanges()) return;
    try {
      await api.logout();
    } catch {
      /* Local removal is still safer after a network error. */
    }
    clearSearch();
    ++refreshSequence.current;
    sessionStorage.removeItem('boberit-session');
    setAccessToken(null);
    setAccount(null);
    setToken(null);
    setSelected(null);
    setAssets([]);
    setDocuments([]);
    setStorageBytes(0);
    setPurchaseValues([]);
    setSelectedDocument(null);
    setInboxFiles([]);
    setTrashEntries([]);
  }
  function openAccount(section: AccountSection) {
    if (navigateTo('account')) setAccountSection(section);
  }

  useEffect(() => {
    if (!accessToken || !query.trim()) return;
    const timeout = window.setTimeout(() => {
      void refreshSearch(query);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query, accessToken]);

  useEffect(() => {
    try {
      localStorage.setItem('boberit-ui-notifications', JSON.stringify(notifications));
    } catch {
      /* Browser storage is optional. */
    }
  }, [notifications]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 3_000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!hasUnsavedAssetChanges && !hasUnsavedDocumentChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedAssetChanges, hasUnsavedDocumentChanges]);

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

  const attention = useMemo(
    () => assets.filter((asset) => warrantyLabel(asset).state === 'warning').slice(0, 2),
    [assets],
  );
  const reminders = useMemo(
    () =>
      assets
        .flatMap((asset): ReminderEntry[] => {
          const warranty = asset.warranty;
          const warrantyEntry =
            warranty?.kind === 'fixed' && warranty.expiresOn
              ? [{ id: `warranty-${asset.id}`, dueOn: warranty.expiresOn, kind: 'warranty' as const, asset }]
              : [];
          const maintenanceEntries = (asset.maintenancePlans ?? [])
            .filter(
              (plan) =>
                plan.status === 'active' && plan.nextDueOn && (!plan.lastCompletedOn || plan.nextDueOn <= localDate()),
            )
            .map((plan) => ({ id: plan.id, dueOn: plan.nextDueOn!, kind: 'maintenance' as const, asset, plan }));
          return [...warrantyEntry, ...maintenanceEntries];
        })
        .filter((entry) => daysUntil(entry.dueOn) <= 30)
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
    [assets],
  );
  const todayReminders = useMemo(() => reminders.filter((entry) => daysUntil(entry.dueOn) === 0), [reminders]);
  const hasUnreadToday = todayReminders.length > 0 && todayReadOn !== localDateKey();
  function markTodayRead() {
    const today = localDateKey();
    setTodayReadOn(today);
    try {
      localStorage.setItem('boberit-today-notifications-read', today);
    } catch {
      /* Browser storage is optional. */
    }
  }
  const collectionAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          filter === 'all' ||
          (filter === 'warranty' && asset.warranty && asset.warranty.kind !== 'unknown') ||
          (filter === 'draft' && asset.completeness !== 'complete'),
      ),
    [assets, filter],
  );

  async function openDetail(id: string) {
    if (selected?.id !== id) {
      if (!allowDiscardChanges()) return;
      setSelected(null);
    }
    try {
      setSelected((await api.getAsset(id)).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się otworzyć przedmiotu.');
    }
  }
  async function quickAdd(
    kind: 'asset' | 'document',
    input: CreateAssetInput | CreateBinderDocumentInput,
    files: File[],
  ) {
    if (kind === 'asset') {
      const created = await api.createAsset(input as CreateAssetInput);
      for (const file of files) await api.uploadFile(created.data.id, file, 'other', true);
      await refresh();
      await openDetail(created.data.id);
      setMessage(files.length ? 'Przedmiot i zdjęcia zostały zapisane.' : 'Przedmiot został zapisany.');
    } else {
      const created = await api.createDocument(input as CreateBinderDocumentInput);
      for (const file of files) await api.uploadDocumentFile(created.data.id, file);
      if (files.length) await api.runDocumentOcr(created.data.id);
      await refresh();
      navigateTo('binder');
      setMessage(files.length ? 'Dokument i pliki trafiły do Dokumentów.' : 'Dokument trafił do Dokumentów.');
    }
    setQuickAddOpen(false);
  }
  async function update(id: string, input: Partial<CreateAssetInput>) {
    const response = await api.updateAsset(id, input);
    setSelected(response.data);
    setMessage('Dane przedmiotu zapisano.');
    await refresh();
  }
  async function saveWarranty(id: string, kind: WarrantyKind, scope: string, expiresOn: string) {
    const response = await api.saveWarranty(id, {
      kind,
      scope: scope || null,
      expiresOn: kind === 'fixed' ? expiresOn : null,
    });
    setSelected((current) => (current?.id === id ? { ...current, warranty: response.data } : current));
    setMessage('Gwarancję zapisano.');
    await refresh();
  }
  async function addPlan(
    id: string,
    input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>,
  ) {
    await api.createPlan(id, input);
    setSelected((await api.getAsset(id)).data);
    await refresh();
    setMessage('Plan czynności został dodany.');
  }
  async function removeAssetFile(assetId: string, fileId: string) {
    await api.deleteAssetFile(assetId, fileId);
    setSelected((await api.getAsset(assetId)).data);
    await refresh();
    setMessage('Załącznik przedmiotu został usunięty.');
  }
  async function classifyFile(assetId: string, fileId: string, kind: AssetFileKind) {
    await api.classifyAssetFile(assetId, fileId, kind);
    setSelected((await api.getAsset(assetId)).data);
    await refresh();
    setMessage('Typ pliku został zapisany.');
  }
  async function updatePlan(
    id: string,
    input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>,
  ) {
    await api.updatePlan(id, input);
    if (selected) setSelected((await api.getAsset(selected.id)).data);
    await refresh();
    setMessage('Plan konserwacji został zaktualizowany.');
  }
  async function removePlan(id: string) {
    await api.deletePlan(id);
    if (selected) setSelected((await api.getAsset(selected.id)).data);
    await refresh();
    setMessage('Plan konserwacji i jego historia zostały usunięte.');
  }
  async function uploadFiles(id: string, files: File[], kind: AssetFileKind) {
    for (const file of files) await api.uploadFile(id, file, kind);
    setSelected((await api.getAsset(id)).data);
    setMessage(files.length === 1 ? 'Plik został dodany.' : `Dodano ${files.length} pliki.`);
  }
  async function uploadInboxFiles(files: File[]) {
    for (const file of files) await api.uploadInboxFile(file);
    await refresh();
    setMessage(
      files.length === 1 ? 'Plik trafił do sekcji Do przypisania.' : `Do przypisania dodano ${files.length} pliki.`,
    );
  }
  async function assignInbox(id: string, assetId: string, kind: AssetFileKind) {
    await api.assignInboxFile(id, assetId, kind);
    await refresh();
    setMessage('Plik przypisano do przedmiotu.');
  }
  async function inboxToDocument(id: string, input: CreateBinderDocumentInput) {
    await api.inboxToDocument(id, input);
    await refresh();
    setMessage('Utworzono dokument w Dokumentach.');
  }
  async function updateDocument(id: string, input: Partial<CreateBinderDocumentInput>) {
    await api.updateDocument(id, input);
    await refresh();
    setMessage('Zmiany dokumentu zapisano.');
  }
  async function runOcr(id: string) {
    await api.runDocumentOcr(id);
    await refresh();
    setMessage('Rozpoznano tekst dokumentu.');
  }
  async function batchOcr() {
    const result = await api.batchDocumentOcr();
    await refresh();
    setMessage(
      result.data.processed
        ? `Rozpoznano tekst w ${result.data.processed} dokumentach.`
        : 'Nie ma dokumentów oczekujących na OCR.',
    );
  }
  async function saveOcr(id: string, text: string) {
    await api.saveDocumentOcr(id, text);
    await refresh();
    setMessage('Tekst OCR zapisano i zaindeksowano.');
  }
  async function uploadDocumentFiles(id: string, files: File[]) {
    for (const file of files) await api.uploadDocumentFile(id, file);
    if (files.length) await api.runDocumentOcr(id);
    await refresh();
    setMessage(files.length === 1 ? 'Plik dodano do dokumentu.' : `Dodano ${files.length} pliki do dokumentu.`);
  }
  async function removeDocumentFile(documentId: string, fileId: string) {
    await api.deleteDocumentFile(documentId, fileId);
    await refresh();
    setMessage('Załącznik usunięto, a treść OCR zaktualizowano.');
  }
  async function deleteInboxFile(id: string) {
    await api.deleteInboxFile(id);
    await refresh();
    setMessage('Plik usunięto z listy Do przypisania.');
  }
  async function trashAsset(id: string) {
    await api.trashAsset(id);
    setSelected(null);
    clearSearch();
    await refresh();
    setView('items');
    setMessage('Przedmiot przeniesiono do Kosza na 30 dni.');
  }
  async function trashDocument(id: string) {
    await api.trashDocument(id);
    await refresh();
    setMessage('Dokument przeniesiono do Kosza na 30 dni.');
  }
  async function restoreTrash(kind: TrashKind, id: string) {
    await api.restoreTrash(kind, id);
    await refresh();
    setMessage('Element przywrócono.');
  }
  async function emptyTrash() {
    await api.emptyTrash();
    await refresh();
    setMessage('Kosz został opróżniony trwale.');
  }
  async function completePlan(id: string, input: { performedOn?: string; notes?: string }) {
    await api.completePlan(id, input);
    setCompletionPlan(null);
    await refresh();
    setMessage('Wykonanie zapisano w historii, a kolejny termin wyliczono.');
  }

  if (!accessToken)
    return (
      <AuthScreen
        onAuthenticated={(token) => {
          sessionStorage.setItem('boberit-session', token);
          setToken(token);
        }}
      />
    );

  const avatarInitials = Array.from(account?.login.trim() || 'U')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('pl-PL');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          type="button"
          onClick={() => {
            void navigateTo('start');
          }}
        >
          <img src="/branding/boberit-icon.png" alt="" />
          <strong>Boberit</strong>
        </button>
        <nav aria-label="Nawigacja główna">
          <button
            className={`nav-item ${view === 'start' && !selected ? 'active' : ''}`}
            type="button"
            onClick={() => {
              void navigateTo('start');
            }}
          >
            <Icon name="home" /> Start
          </button>
          <button
            className={`nav-item ${view === 'items' || selected ? 'active' : ''}`}
            type="button"
            onClick={() => {
              void navigateTo('items');
            }}
          >
            <Icon name="package" /> Przedmioty <span>{assets.length}</span>
          </button>
          <button
            className={`nav-item ${['binder', 'document-ocr'].includes(view) && !selected ? 'active' : ''}`}
            type="button"
            onClick={() => {
              void navigateTo('binder');
            }}
          >
            <Icon name="file-text" /> Dokumenty <span>{documents.length}</span>
          </button>
          <button
            className={`nav-item ${view === 'timeline' && !selected ? 'active' : ''}`}
            type="button"
            onClick={() => {
              void navigateTo('timeline');
            }}
          >
            <Icon name="calendar-event" /> Terminy
          </button>
          <button
            className={`nav-item ${view === 'inbox' && !selected ? 'active' : ''}`}
            type="button"
            onClick={() => {
              void navigateTo('inbox');
            }}
          >
            <Icon name="file-text" /> Do przypisania <span>{inboxFiles.length}</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button
            className={`nav-item ${view === 'trash' && !selected ? 'active' : ''}`}
            type="button"
            onClick={() => {
              void navigateTo('trash');
            }}
          >
            <Icon name="trash" /> Kosz <span>{trashEntries.length}</span>
          </button>
          <button
            className={`nav-item sidebar-settings ${view === 'settings' && !selected ? 'active' : ''}`}
            type="button"
            onClick={() => {
              void navigateTo('settings');
            }}
          >
            <Icon name="dots" /> Ustawienia
          </button>
        </div>
      </aside>
      <nav className="mobile-nav" aria-label="Nawigacja mobilna">
        <button
          className={view === 'start' && !selected ? 'active' : ''}
          onClick={() => {
            void navigateTo('start');
          }}
          type="button"
        >
          <Icon name="home" />
          <span>Start</span>
        </button>
        <button
          className={view === 'items' || selected ? 'active' : ''}
          onClick={() => {
            void navigateTo('items');
          }}
          type="button"
        >
          <Icon name="package" />
          <span>Przedmioty</span>
        </button>
        <button className="mobile-add" aria-label="Dodaj przedmiot lub dokument" onClick={openQuickAdd} type="button">
          <span>
            <Icon name="plus" />
          </span>
          <b>Dodaj</b>
        </button>
        <button
          className={['binder', 'document-ocr'].includes(view) && !selected ? 'active' : ''}
          onClick={() => {
            void navigateTo('binder');
          }}
          type="button"
        >
          <Icon name="file-text" />
          <span>Dokumenty</span>
        </button>
        <button
          className={['timeline', 'inbox', 'trash', 'settings'].includes(view) && !selected ? 'active' : ''}
          onClick={() => setMobileMenuOpen(true)}
          type="button"
        >
          <Icon name="dots" />
          <span>Więcej</span>
        </button>
      </nav>

      <main>
        <header className="topbar">
          <label className="search">
            <Icon name="search" />
            <input
              ref={searchInputRef}
              aria-label="Szukaj w Boberit"
              value={query}
              onChange={(event) => updateSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query) updateSearch('');
              }}
              placeholder="Szukaj nazwy, modelu, serialu, tagu, OCR…"
            />
            {query && (
              <button
                className="search-clear"
                aria-label="Wyczyść wyszukiwanie"
                onClick={() => updateSearch('')}
                type="button"
              >
                <Icon name="x" />
              </button>
            )}
            <kbd>/</kbd>
          </label>
          <div className="topbar-actions">
            <button className="primary topbar-save" type="button" onClick={openQuickAdd}>
              <Icon name="plus" /> Dodaj
            </button>
            <NotificationsMenu
              hasUnreadToday={hasUnreadToday}
              history={notifications}
              onOpenAsset={(id) => void openDetail(id)}
              onReadToday={markTodayRead}
              todayReminders={todayReminders}
            />
            <AccountMenu
              account={account}
              active={view === 'account'}
              activeHouseholdId={activeHouseholdId}
              avatarInitials={avatarInitials}
              households={households}
              onLogout={logout}
              onSelect={openAccount}
              onSwitch={switchHousehold}
            />
          </div>
        </header>
        <section className="content">
          {selected ? (
            <Detail
              key={selected.id}
              asset={selected}
              onBack={() => {
                void navigateTo('items');
              }}
              onDirtyChange={setHasUnsavedAssetChanges}
              onTrash={trashAsset}
              onUpdate={update}
              onWarranty={saveWarranty}
              onPlan={addPlan}
              onUpdatePlan={updatePlan}
              onDeletePlan={removePlan}
              onUpload={uploadFiles}
              onDeleteFile={removeAssetFile}
              onClassifyFile={classifyFile}
              onComplete={setCompletionPlan}
            />
          ) : view === 'start' ? (
            <StartPage
              assets={assets}
              documentCount={documents.length}
              storageBytes={storageBytes}
              purchaseValues={purchaseValues}
              attention={attention}
              reminders={reminders}
              onCapture={openQuickAdd}
              onOpen={openDetail}
              onAllItems={() => navigateTo('items')}
              onTimeline={() => navigateTo('timeline')}
            />
          ) : view === 'timeline' ? (
            <TimelinePage
              assets={assets}
              filter={timelineFilter}
              onFilter={setTimelineFilter}
              onOpen={openDetail}
              onComplete={setCompletionPlan}
            />
          ) : view === 'document-ocr' && selectedDocument ? (
            <DocumentOcrPage
              document={selectedDocument}
              onBack={() => {
                void navigateTo('binder');
              }}
              onDirtyChange={setHasUnsavedDocumentChanges}
              onRun={runOcr}
              onSave={saveOcr}
              onUpdate={updateDocument}
              onDeleteFile={removeDocumentFile}
            />
          ) : view === 'binder' ? (
            <BinderPage
              documents={documents}
              onOpenOcr={(document) => {
                setSelectedDocument(document);
                setView('document-ocr');
              }}
              onUpdate={updateDocument}
              onBatchOcr={batchOcr}
              onUpload={uploadDocumentFiles}
              onTrash={trashDocument}
            />
          ) : view === 'trash' ? (
            <TrashPage canEmpty={isOwner} entries={trashEntries} onRestore={restoreTrash} onEmpty={emptyTrash} />
          ) : view === 'account' ? (
            <AccountPage section={accountSection} onSection={setAccountSection} onLogout={logout} />
          ) : view === 'settings' ? (
            <SettingsPage isOwner={isOwner} />
          ) : view === 'search' ? (
            <SearchPage
              query={query}
              assets={searchAssets}
              documents={searchDocuments}
              isLoading={isSearching}
              error={searchError}
              onOpenAsset={openDetail}
              onOpenDocument={(document) => {
                setSelectedDocument(document);
                setView('document-ocr');
              }}
            />
          ) : view === 'inbox' ? (
            <InboxPage
              files={inboxFiles}
              assets={assets}
              onUpload={uploadInboxFiles}
              onAssign={assignInbox}
              onToDocument={inboxToDocument}
              onDelete={deleteInboxFile}
            />
          ) : (
            <ItemsPage
              allAssets={assets}
              assets={collectionAssets}
              attention={attention}
              isLoading={isLoading}
              filter={filter}
              onFilter={setFilter}
              onOpen={openDetail}
            />
          )}
        </section>
      </main>
      {completionPlan && (
        <CompletionDialog
          plan={completionPlan}
          onClose={() => setCompletionPlan(null)}
          onSave={(input) => void completePlan(completionPlan.id, input)}
        />
      )}
      {isQuickAddOpen && <QuickAddDialog onClose={() => setQuickAddOpen(false)} onSave={quickAdd} />}
      {isMobileMenuOpen && (
        <MobileMoreMenu
          inboxCount={inboxFiles.length}
          onClose={() => setMobileMenuOpen(false)}
          onNavigate={(next) => {
            if (navigateTo(next)) setMobileMenuOpen(false);
          }}
          trashCount={trashEntries.length}
        />
      )}
      {message && (
        <button className="toast" onClick={() => setMessage(null)} type="button">
          <span>{message}</span>
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}
