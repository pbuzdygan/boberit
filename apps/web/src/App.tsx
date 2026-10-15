import { type MaintenancePlan } from '@boberit/shared';
import { useMemo, useState } from 'react';
import { api } from './api';
import { attentionAssets, avatarInitials, filterCollection, remindersDueToday, upcomingReminders } from './collections';
import { AccountMenu } from './components/AccountMenu';
import { MobileNav, Sidebar } from './components/AppNavigation';
import { CompletionDialog } from './components/CompletionDialog';
import { Icon } from './components/Icon';
import { MobileMoreMenu } from './components/MobileMoreMenu';
import { NotificationsMenu } from './components/NotificationsMenu';
import { LoadState } from './components/LoadState';
import { QuickAddDialog, type QuickAddKind } from './components/QuickAddDialog';
import { localDateKey } from './format';
import { useCollections } from './hooks/useCollections';
import { useLibraryActions } from './hooks/useLibraryActions';
import { useNavigation } from './hooks/useNavigation';
import { useNotifications } from './hooks/useNotifications';
import { ReportErrorContext } from './hooks/useReportError';
import { useSearch } from './hooks/useSearch';
import { useSession } from './hooks/useSession';
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
import type { SettingsSection, TimelineFilter, CollectionFilter, View } from './types';

/** Views built from the household collections; they wait for the first successful load. */
/** Settings sections about the signed-in account rather than the household; the avatar marks them. */
const accountSections: (SettingsSection | null)[] = ['households', 'security', 'integrations'];

const collectionViews: View[] = ['start', 'items', 'binder', 'timeline', 'inbox', 'trash'];

export function App() {
  // Hook order matters: the session hook's effect sets the API token before data loads.
  const session = useSession();
  const { accessToken, account, households, activeHouseholdId, isOwner } = session;
  const { toast, setMessage, showError, notifications, clearHistory, todayReadOn, markTodayRead } = useNotifications();
  const search = useSearch(accessToken);
  const { query, searchAssets, searchDocuments, isSearching, searchError, searchInputRef, clearSearch } = search;
  const navigation = useNavigation(search, setMessage);
  const { view, setView, selected, setSelected, selectedDocument, allowDiscardChanges, navigateTo } = navigation;
  const { updateSearch, openDetail, openDocument } = navigation;
  const collections = useCollections({ accessToken, navigation, search, setMessage });
  const { assets, inboxFiles, documents, storageBytes, purchaseValues, trashEntries, refresh } = collections;
  // The kind preselected in the quick-add dialog; null while the dialog is closed.
  const [quickAddKind, setQuickAddKind] = useState<QuickAddKind | null>(null);
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [completionPlan, setCompletionPlan] = useState<MaintenancePlan | null>(null);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Null opens the settings overview (the section list on phones).
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  const actions = useLibraryActions({
    collections,
    navigation,
    search,
    setMessage,
    closeQuickAdd: () => setQuickAddKind(null),
    closeCompletion: () => setCompletionPlan(null),
  });

  function openQuickAdd(kind: QuickAddKind = 'asset') {
    if (!allowDiscardChanges()) return;
    if (selected) {
      setSelected(null);
      setView('items');
    }
    setQuickAddKind(kind);
  }

  async function switchHousehold(id: string) {
    if (!allowDiscardChanges()) return;
    try {
      await api.selectHousehold(id);
      clearSearch();
      session.setActiveHouseholdId(id);
      setSelected(null);
      setView('start');
      await refresh();
      setMessage('Przełączono gospodarstwo.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się przełączyć gospodarstwa.', 'error');
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
    collections.clearCollections();
    session.signOut();
  }
  function openSettings(section: SettingsSection | null) {
    if (navigateTo('settings')) setSettingsSection(section);
  }
  function navigate(next: View) {
    if (next === 'settings') openSettings(null);
    else void navigateTo(next);
  }

  const attention = useMemo(() => attentionAssets(assets), [assets]);
  const reminders = useMemo(() => upcomingReminders(assets), [assets]);
  const todayReminders = useMemo(() => remindersDueToday(reminders), [reminders]);
  const hasUnreadToday = todayReminders.length > 0 && todayReadOn !== localDateKey();
  const collectionAssets = useMemo(() => filterCollection(assets, filter), [assets, filter]);

  if (!accessToken) return <AuthScreen onAuthenticated={session.signIn} />;

  return (
    <ReportErrorContext.Provider value={showError}>
      <div className="app-shell">
        <Sidebar
          view={view}
          hasSelection={Boolean(selected)}
          itemCount={assets.length}
          documentCount={documents.length}
          inboxCount={inboxFiles.length}
          trashCount={trashEntries.length}
          showCounts={collections.hasLoaded}
          onNavigate={navigate}
        />
        <MobileNav
          view={view}
          hasSelection={Boolean(selected)}
          onNavigate={navigate}
          onQuickAdd={() => openQuickAdd()}
          onMore={() => setMobileMenuOpen(true)}
        />

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
              <button className="primary topbar-save" type="button" onClick={() => openQuickAdd()}>
                <Icon name="plus" /> Dodaj
              </button>
              <NotificationsMenu
                hasUnreadToday={hasUnreadToday}
                history={notifications}
                onClearHistory={clearHistory}
                onOpenAsset={(id) => void openDetail(id)}
                onReadToday={markTodayRead}
                todayReminders={todayReminders}
              />
              <AccountMenu
                account={account}
                active={view === 'settings' && accountSections.includes(settingsSection)}
                activeHouseholdId={activeHouseholdId}
                avatarInitials={avatarInitials(account?.login)}
                households={households}
                onLogout={logout}
                onSelect={openSettings}
                onSwitch={switchHousehold}
              />
            </div>
          </header>
          <section className="content">
            {!selected && !collections.hasLoaded && collectionViews.includes(view) ? (
              <LoadState error={collections.loadError} onRetry={() => void refresh()} />
            ) : selected ? (
              <Detail
                key={selected.id}
                asset={selected}
                onBack={() => {
                  void navigateTo('items');
                }}
                onDirtyChange={navigation.setHasUnsavedAssetChanges}
                onTrash={actions.trashAsset}
                onUpdate={actions.update}
                onWarranty={actions.saveWarranty}
                onPlan={actions.addPlan}
                onUpdatePlan={actions.updatePlan}
                onDeletePlan={actions.removePlan}
                onUpload={actions.uploadFiles}
                onDeleteFile={actions.removeAssetFile}
                onClassifyFile={actions.classifyFile}
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
                onOpen={openDetail}
                onAllItems={() => navigateTo('items')}
                onTimeline={() => navigateTo('timeline')}
                onAdd={() => openQuickAdd('asset')}
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
                onDirtyChange={navigation.setHasUnsavedDocumentChanges}
                onRun={actions.runOcr}
                onSave={actions.saveOcr}
                onUpdate={actions.updateDocument}
                onDeleteFile={actions.removeDocumentFile}
              />
            ) : view === 'binder' ? (
              <BinderPage
                documents={documents}
                onOpenOcr={openDocument}
                onUpdate={actions.updateDocument}
                onBatchOcr={actions.batchOcr}
                onUpload={actions.uploadDocumentFiles}
                onTrash={actions.trashDocument}
                onAdd={() => openQuickAdd('document')}
              />
            ) : view === 'trash' ? (
              <TrashPage
                canEmpty={isOwner}
                entries={trashEntries}
                onRestore={actions.restoreTrash}
                onEmpty={actions.emptyTrash}
              />
            ) : view === 'settings' ? (
              <SettingsPage
                account={account}
                activeHouseholdId={activeHouseholdId}
                documentCount={documents.length}
                households={households}
                itemCount={assets.length}
                onSection={setSettingsSection}
                onSwitchHousehold={switchHousehold}
                section={settingsSection}
                storageBytes={storageBytes}
              />
            ) : view === 'search' ? (
              <SearchPage
                query={query}
                assets={searchAssets}
                documents={searchDocuments}
                isLoading={isSearching}
                error={searchError}
                onOpenAsset={openDetail}
                onOpenDocument={openDocument}
              />
            ) : view === 'inbox' ? (
              <InboxPage
                files={inboxFiles}
                assets={assets}
                onUpload={actions.uploadInboxFiles}
                onAssign={actions.assignInbox}
                onToDocument={actions.inboxToDocument}
                onDelete={actions.deleteInboxFile}
              />
            ) : (
              <ItemsPage
                allAssets={assets}
                assets={collectionAssets}
                attention={attention}
                filter={filter}
                onFilter={setFilter}
                onOpen={openDetail}
                onAdd={() => openQuickAdd('asset')}
              />
            )}
          </section>
        </main>
        {completionPlan && (
          <CompletionDialog
            plan={completionPlan}
            onClose={() => setCompletionPlan(null)}
            onSave={(input) => actions.completePlan(completionPlan.id, input)}
          />
        )}
        {quickAddKind && (
          <QuickAddDialog initialKind={quickAddKind} onClose={() => setQuickAddKind(null)} onSave={actions.quickAdd} />
        )}
        {isMobileMenuOpen && (
          <MobileMoreMenu
            inboxCount={inboxFiles.length}
            onClose={() => setMobileMenuOpen(false)}
            onNavigate={(next) => {
              const opened = next === 'settings' ? navigateTo('settings') : navigateTo(next);
              if (next === 'settings' && opened) setSettingsSection(null);
              if (opened) setMobileMenuOpen(false);
            }}
            trashCount={trashEntries.length}
          />
        )}
        {/* Live regions exist before a message appears, so screen readers announce it; errors interrupt. */}
        {(['info', 'error'] as const).map((tone) => (
          <div
            aria-live={tone === 'error' ? 'assertive' : 'polite'}
            key={tone}
            role={tone === 'error' ? 'alert' : 'status'}
          >
            {toast?.tone === tone && (
              <button
                aria-label={`${toast.message} Zamknij powiadomienie.`}
                className={`toast toast--${tone}`}
                onClick={() => setMessage(null)}
                type="button"
              >
                <span>{toast.message}</span>
                <Icon name="x" />
              </button>
            )}
          </div>
        ))}
      </div>
    </ReportErrorContext.Provider>
  );
}
