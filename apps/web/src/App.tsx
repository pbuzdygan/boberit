import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetFileKind, AssetSummary, BinderDocument, CreateBinderDocumentInput, InboxFile, CreateAssetInput, TrashEntry, TrashKind, IntervalUnit, MaintenancePlan, MaintenanceRecord, ScheduleKind, WarrantyKind } from '@boberit/shared';
import { api, setAccessToken } from './api';

type IconName = 'home' | 'package' | 'search' | 'plus' | 'shield-check' | 'tool' | 'calendar-event' | 'arrow-left' | 'x' | 'receipt' | 'file-text' | 'dots' | 'bell' | 'trash';
const icon = (name: IconName) => `/icons/${name}.svg`;

function Icon({ name, label }: { name: IconName; label?: string }) {
  return <img className="icon" src={icon(name)} alt={label ?? ''} aria-hidden={label ? undefined : true} />;
}

function warrantyLabel(asset: AssetSummary): { text: string; state: 'good' | 'warning' | 'quiet' } {
  const warranty = asset.warranty;
  if (!warranty || warranty.kind === 'unknown') return { text: 'Brak danych', state: 'quiet' };
  if (warranty.kind === 'lifetime') return { text: 'Dożywotnia', state: 'good' };
  if (!warranty.expiresOn) return { text: 'Brak danych', state: 'quiet' };
  const days = Math.ceil((new Date(`${warranty.expiresOn}T12:00:00`).valueOf() - Date.now()) / 86_400_000);
  if (days < 0) return { text: 'Po gwarancji', state: 'quiet' };
  if (days <= 30) return { text: `${days} dni`, state: 'warning' };
  return { text: `Do ${new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: 'short' }).format(new Date(`${warranty.expiresOn}T12:00:00`))}`, state: 'good' };
}

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '—';
}

function addYearsToDate(value: string, years: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return [targetYear, String(month).padStart(2, '0'), String(Math.min(day, lastDay)).padStart(2, '0')].join('-');
}

const unsavedAssetMessage = 'Masz niezapisane zmiany w tym przedmiocie. Opuścić widok i je odrzucić?';

const webhookEventLabels: Record<string, string> = {
  'asset.created': 'Utworzono przedmiot',
  'asset.deleted': 'Usunięto przedmiot',
  'document.created': 'Utworzono dokument',
  'document.deleted': 'Usunięto dokument',
  'maintenance.created': 'Dodano konserwację',
  'maintenance.completed': 'Wykonano konserwację',
  'backup.exported': 'Pobrano backup',
  'backup.restored': 'Przywrócono backup',
};

function eventLabel(value: string): string {
  return webhookEventLabels[value] ?? value;
}

type View = 'start' | 'items' | 'timeline' | 'inbox' | 'binder' | 'document-ocr' | 'trash' | 'settings' | 'account' | 'search';
type AccountSection = 'households' | 'members' | 'security' | 'webhooks';
type SettingsSection = 'backup' | 'activity';
type TimelineFilter = 'all' | 'maintenance' | 'warranty';
type CollectionFilter = 'all' | 'warranty' | 'draft';
type ReminderEntry = { id: string; dueOn: string; kind: 'warranty' | 'maintenance'; asset: AssetSummary; plan?: MaintenancePlan };
type UiNotification = { id: string; message: string; createdAt: number };
type PurchaseValue = { currency: string; amountMinor: number };

function localDateKey(): string { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-'); }


async function downloadAttachment(id:string,name:string):Promise<void>{const blob=await api.fileBlob(id,'download');const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url);} async function previewAttachment(id:string):Promise<void>{const target=window.open('','_blank','noopener');const blob=await api.fileBlob(id,'preview');const url=URL.createObjectURL(blob);if(target)target.location.href=url;else window.open(url,'_blank','noopener');window.setTimeout(()=>URL.revokeObjectURL(url),60_000);}

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
  const [selected, setSelected] = useState<AssetSummary | null>(null);
  const [hasUnsavedAssetChanges, setHasUnsavedAssetChanges] = useState(false);
  const [isQuickAddOpen, setQuickAddOpen] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [message, setMessageValue] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<UiNotification[]>(() => { try { const stored = localStorage.getItem('boberit-ui-notifications'); return stored ? JSON.parse(stored) as UiNotification[] : []; } catch { return []; } });
  const [todayReadOn, setTodayReadOn] = useState(() => { try { return localStorage.getItem("boberit-today-notifications-read") ?? ""; } catch { return ""; } });
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);
  const [view, setView] = useState<View>('start');
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [completionPlan, setCompletionPlan] = useState<MaintenancePlan | null>(null);
  const refreshSequence = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOriginRef = useRef<View>("start");
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [households, setHouseholds] = useState<{id:string;name:string;role:string}[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [account, setAccount] = useState<{login:string;email:string}|null>(null);
  const [accountSection,setAccountSection]=useState<AccountSection>('households');

  function setMessage(next: string | null) {
    setMessageValue(next);
    if (!next) return;
    setNotifications((current) => [{ id: String(Date.now()) + '-' + String(Math.random()), message: next, createdAt: Date.now() }, ...current].slice(0, 50));
  }

  async function refresh(search = query) {
    const sequence = ++refreshSequence.current;
    setLoading(true);
    try {
      const [response, inboxResponse, documentsResponse, trashResponse, storageResponse] = await Promise.all([api.listAssets(search), api.listInbox(), api.listDocuments(search), api.listTrash(), api.storage()]);
      if (sequence !== refreshSequence.current) return;
      setAssets(response.data); setInboxFiles(inboxResponse.data); setDocuments(documentsResponse.data); setTrashEntries(trashResponse.data); setStorageBytes(Number(storageResponse.data.bytes)); setPurchaseValues(storageResponse.data.purchaseValues ?? []);
      setSelectedDocument((current) => current ? documentsResponse.data.find((document) => document.id === current.id) ?? current : null);
      if (selected) {
        const selectedResponse = await api.getAsset(selected.id);
        if (sequence === refreshSequence.current) setSelected(selectedResponse.data);
      }
    } catch (error) {
      if (sequence === refreshSequence.current) setMessage(error instanceof Error ? error.message : 'Nie udało się odczytać kolekcji.');
    } finally { if (sequence === refreshSequence.current) setLoading(false); }
  }

  useEffect(() => { const loadHouseholds=()=>void api.households().then(r=>{setHouseholds(r.data.households);setActiveHouseholdId(r.data.activeHouseholdId);}).catch(()=>undefined); setAccessToken(accessToken); if (accessToken) { void refresh(''); loadHouseholds(); void api.me().then(r=>setAccount(r.data)).catch(()=>setAccount(null)); window.addEventListener('boberit-households-changed',loadHouseholds); } return ()=>window.removeEventListener('boberit-households-changed',loadHouseholds); }, [accessToken]);
  function allowDiscardAssetChanges(): boolean {
    if (!selected || !hasUnsavedAssetChanges) return true;
    if (!window.confirm(unsavedAssetMessage)) return false;
    setHasUnsavedAssetChanges(false);
    return true;
  }

  function navigateTo(next: View): boolean {
    if (!allowDiscardAssetChanges()) return false;
    setSelected(null);
    setView(next);
    return true;
  }

  function openQuickAdd() {
    if (!allowDiscardAssetChanges()) return;
    if (selected) {
      setSelected(null);
      setView('items');
    }
    setQuickAddOpen(true);
  }

  function updateSearch(value: string) {
    if (value && selected) {
      if (!allowDiscardAssetChanges()) return;
      setSelected(null);
    }
    if (value && !query) searchOriginRef.current = view === 'search' ? searchOriginRef.current : view;
    setQuery(value);
    setView(value ? 'search' : searchOriginRef.current);
  }

  async function switchHousehold(id:string) { if (!allowDiscardAssetChanges()) return; try { await api.selectHousehold(id); setActiveHouseholdId(id); setSelected(null); setView('start'); await refresh(''); setMessage('Przełączono gospodarstwo.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się przełączyć gospodarstwa.'); } }
  async function logout(){if (!allowDiscardAssetChanges()) return; try{await api.logout();}catch{/* Local removal is still safer after a network error. */}sessionStorage.removeItem('boberit-session');setAccessToken(null);setAccount(null);setToken(null);setSelected(null);setAssets([]);setDocuments([]);setStorageBytes(0);setPurchaseValues([]);setSelectedDocument(null);setInboxFiles([]);setTrashEntries([]);}
  function openAccount(section:AccountSection){if (navigateTo('account')) setAccountSection(section);}

  useEffect(() => {
    if (!accessToken) return;
    const timeout = window.setTimeout(() => { void refresh(query); }, 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => { try { localStorage.setItem('boberit-ui-notifications', JSON.stringify(notifications)); } catch { /* Browser storage is optional. */ } }, [notifications]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 3_000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!hasUnsavedAssetChanges) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedAssetChanges]);

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

  const attention = useMemo(() => assets.filter((asset) => warrantyLabel(asset).state === 'warning').slice(0, 2), [assets]);
  const reminders = useMemo(() => assets.flatMap((asset): ReminderEntry[] => { const warranty = asset.warranty; const warrantyEntry = warranty?.kind === 'fixed' && warranty.expiresOn ? [{ id: `warranty-${asset.id}`, dueOn: warranty.expiresOn, kind: 'warranty' as const, asset }] : []; const maintenanceEntries = (asset.maintenancePlans ?? []).filter((plan) => plan.status === 'active' && plan.nextDueOn && (!plan.lastCompletedOn || plan.nextDueOn <= new Date().toISOString().slice(0, 10))).map((plan) => ({ id: plan.id, dueOn: plan.nextDueOn!, kind: 'maintenance' as const, asset, plan })); return [...warrantyEntry, ...maintenanceEntries]; }).filter((entry) => daysFromToday(entry.dueOn) <= 30).sort((a, b) => a.dueOn.localeCompare(b.dueOn)), [assets]);
  const todayReminders = useMemo(() => reminders.filter((entry) => daysFromToday(entry.dueOn) === 0), [reminders]);
  const hasUnreadToday = todayReminders.length > 0 && todayReadOn !== localDateKey();
  function markTodayRead() { const today = localDateKey(); setTodayReadOn(today); try { localStorage.setItem("boberit-today-notifications-read", today); } catch { /* Browser storage is optional. */ } }
  const collectionAssets = useMemo(() => assets.filter((asset) => filter === 'all' || (filter === 'warranty' && asset.warranty && asset.warranty.kind !== 'unknown') || (filter === 'draft' && asset.completeness !== 'complete')), [assets, filter]);

  async function openDetail(id: string) {
    if (selected?.id !== id) {
      if (!allowDiscardAssetChanges()) return;
      setSelected(null);
    }
    try { setSelected((await api.getAsset(id)).data); } catch (error) { setMessage(error instanceof Error ? error.message : 'Nie udało się otworzyć przedmiotu.'); }
  }
  async function quickAdd(kind: 'asset' | 'document', input: CreateAssetInput | CreateBinderDocumentInput, files: File[]) {
    if (kind === 'asset') {
      const created = await api.createAsset(input as CreateAssetInput);
      for (const file of files) await api.uploadFile(created.data.id, file, 'photo');
      await refresh(); await openDetail(created.data.id);
      setMessage(files.length ? 'Przedmiot i zdjęcia zostały zapisane.' : 'Przedmiot został zapisany.');
    } else {
      const created = await api.createDocument(input as CreateBinderDocumentInput);
      for (const file of files) await api.uploadDocumentFile(created.data.id, file);
      if (files.length) await api.runDocumentOcr(created.data.id);
      await refresh(); setSelected(null); setView('binder');
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
    const response = await api.saveWarranty(id, { kind, scope: scope || null, expiresOn: kind === 'fixed' ? expiresOn : null });
    if (selected) setSelected({ ...selected, warranty: response.data });
    setMessage('Gwarancję zapisano.');
    await refresh();
  }
  async function addPlan(id: string, input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>) {
    await api.createPlan(id, input);
    setSelected((await api.getAsset(id)).data);
    await refresh();
    setMessage('Plan czynności został dodany.');
  }
  async function removeAssetFile(assetId: string, fileId: string) { await api.deleteAssetFile(assetId, fileId); setSelected((await api.getAsset(assetId)).data); await refresh(); setMessage("Załącznik przedmiotu został usunięty."); }
  async function updatePlan(id: string, input: Pick<MaintenancePlan, "title" | "scheduleKind" | "intervalValue" | "intervalUnit" | "nextDueOn" | "notes">) { await api.updatePlan(id, input); if (selected) setSelected((await api.getAsset(selected.id)).data); await refresh(); setMessage("Plan konserwacji został zaktualizowany."); }
  async function removePlan(id: string) { await api.deletePlan(id); if (selected) setSelected((await api.getAsset(selected.id)).data); await refresh(); setMessage("Plan konserwacji i jego historia zostały usunięte."); }
  async function uploadFiles(id: string, files: File[], kind: AssetFileKind) {
    for (const file of files) await api.uploadFile(id, file, kind);
    setSelected((await api.getAsset(id)).data);
    setMessage(files.length === 1 ? 'Plik został dodany.' : `Dodano ${files.length} pliki.`);
  }
  async function uploadInboxFiles(files: File[]) {
    for (const file of files) await api.uploadInboxFile(file);
    await refresh();
    setMessage(files.length === 1 ? 'Plik trafił do sekcji Do przypisania.' : `Do przypisania dodano ${files.length} pliki.`);
  }
  async function assignInbox(id: string, assetId: string, kind: AssetFileKind) {
    await api.assignInboxFile(id, assetId, kind);
    await refresh();
    setMessage('Plik przypisano do przedmiotu.');
  }
  async function inboxToDocument(id: string, input: CreateBinderDocumentInput) {
    await api.inboxToDocument(id, input); await refresh(); setMessage('Utworzono dokument w Dokumentach.');
  }
  async function updateDocument(id: string, input: Partial<CreateBinderDocumentInput>) {
    await api.updateDocument(id, input); await refresh(); setMessage('Zmiany dokumentu zapisano.');
  }
  async function runOcr(id:string){await api.runDocumentOcr(id);await refresh();setMessage('Rozpoznano tekst dokumentu.');}
  async function batchOcr(){const result=await api.batchDocumentOcr();await refresh();setMessage(result.data.processed?`Rozpoznano tekst w ${result.data.processed} dokumentach.`:'Nie ma dokumentów oczekujących na OCR.');}
  async function saveOcr(id:string,text:string){await api.saveDocumentOcr(id,text);await refresh();setMessage('Tekst OCR zapisano i zaindeksowano.');}
  async function uploadDocumentFiles(id: string, files: File[]) {
    for (const file of files) await api.uploadDocumentFile(id, file);
    if (files.length) await api.runDocumentOcr(id);
    await refresh(); setMessage(files.length === 1 ? 'Plik dodano do dokumentu.' : `Dodano ${files.length} pliki do dokumentu.`);
  }
  async function removeDocumentFile(documentId: string, fileId: string) { await api.deleteDocumentFile(documentId, fileId); await refresh(); setMessage("Załącznik usunięto, a treść OCR zaktualizowano."); }
  async function deleteInboxFile(id: string) { await api.deleteInboxFile(id); await refresh(); setMessage('Plik usunięto z listy Do przypisania.'); }
  async function trashAsset(id: string) { await api.trashAsset(id); setSelected(null); await refresh(); setView('items'); setMessage('Przedmiot przeniesiono do Kosza na 30 dni.'); }
  async function trashDocument(id: string) { await api.trashDocument(id); await refresh(); setMessage('Dokument przeniesiono do Kosza na 30 dni.'); }
  async function restoreTrash(kind: TrashKind, id: string) { await api.restoreTrash(kind, id); await refresh(); setMessage('Element przywrócono.'); }
  async function emptyTrash() { await api.emptyTrash(); await refresh(); setMessage('Kosz został opróżniony trwale.'); }
  async function completePlan(id: string, input: { performedOn?: string; notes?: string }) {
    await api.completePlan(id, input);
    setCompletionPlan(null);
    await refresh();
    setMessage('Wykonanie zapisano w historii, a kolejny termin wyliczono.');
  }

  if (!accessToken) return <AuthScreen onAuthenticated={(token) => { sessionStorage.setItem('boberit-session', token); setToken(token); }} />;

  const avatarInitials = Array.from(account?.login.trim() || 'U').slice(0, 2).join('').toLocaleUpperCase('pl-PL');

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" type="button" onClick={() => { void navigateTo('start'); }}><img src="/branding/boberit-icon.png" alt="" /><strong>Boberit</strong></button>
      <nav aria-label="Nawigacja główna">
        <button className={`nav-item ${view === "start" && !selected ? "active" : ""}`} type="button" onClick={() => { void navigateTo('start'); }}><Icon name="home" /> Start</button>
        <button className={`nav-item ${view === "items" || selected ? "active" : ""}`} type="button" onClick={() => { void navigateTo('items'); }}><Icon name="package" /> Przedmioty <span>{assets.length}</span></button>
        <button className={`nav-item ${["binder", "document-ocr"].includes(view) && !selected ? "active" : ""}`} type="button" onClick={() => { void navigateTo('binder'); }}><Icon name="file-text" /> Dokumenty <span>{documents.length}</span></button>
        <button className={`nav-item ${view === "timeline" && !selected ? "active" : ""}`} type="button" onClick={() => { void navigateTo('timeline'); }}><Icon name="calendar-event" /> Terminy</button>
        <button className={`nav-item ${view === "inbox" && !selected ? "active" : ""}`} type="button" onClick={() => { void navigateTo('inbox'); }}><Icon name="file-text" /> Do przypisania <span>{inboxFiles.length}</span></button>
      </nav>
      <div className="sidebar-footer">
        <button className={`nav-item ${view === "trash" && !selected ? "active" : ""}`} type="button" onClick={() => { void navigateTo('trash'); }}><Icon name="trash" /> Kosz <span>{trashEntries.length}</span></button>
        <button className={`nav-item sidebar-settings ${view === "settings" && !selected ? "active" : ""}`} type="button" onClick={() => { void navigateTo('settings'); }}><Icon name="dots" /> Ustawienia</button>
      </div>
    </aside>
    <nav className="mobile-nav" aria-label="Nawigacja mobilna">
      <button className={view === 'start' && !selected ? 'active' : ''} onClick={() => { void navigateTo('start'); }} type="button"><Icon name="home" /><span>Start</span></button>
      <button className={view === 'items' || selected ? 'active' : ''} onClick={() => { void navigateTo('items'); }} type="button"><Icon name="package" /><span>Przedmioty</span></button>
      <button className="mobile-add" aria-label="Dodaj przedmiot lub dokument" onClick={openQuickAdd} type="button"><span><Icon name="plus" /></span><b>Dodaj</b></button>
      <button className={['binder', 'document-ocr'].includes(view) && !selected ? 'active' : ''} onClick={() => { void navigateTo('binder'); }} type="button"><Icon name="file-text" /><span>Dokumenty</span></button>
      <button className={['timeline','inbox','trash','settings'].includes(view) && !selected ? 'active' : ''} onClick={() => setMobileMenuOpen(true)} type="button"><Icon name="dots" /><span>Więcej</span></button>
    </nav>

    <main>
      <header className="topbar">
        <label className="search"><Icon name="search" /><input ref={searchInputRef} aria-label="Szukaj w Boberit" value={query} onChange={(event) => updateSearch(event.target.value)} placeholder="Szukaj nazwy, modelu, serialu, tagu…" /><kbd>/</kbd></label>
        <div className="topbar-actions">
          <button className="primary topbar-save" type="button" onClick={openQuickAdd}><Icon name="plus" /> Dodaj</button>
          <NotificationsMenu hasUnreadToday={hasUnreadToday} history={notifications} onOpenAsset={(id) => void openDetail(id)} onReadToday={markTodayRead} todayReminders={todayReminders} />
          <AccountMenu account={account} active={view==='account'} activeHouseholdId={activeHouseholdId} avatarInitials={avatarInitials} households={households} onLogout={logout} onSelect={openAccount} onSwitch={switchHousehold}/>
        </div>
      </header>
      <section className="content">
        {selected ? <Detail key={selected.id} asset={selected} onBack={() => { void navigateTo('items'); }} onDirtyChange={setHasUnsavedAssetChanges} onTrash={trashAsset} onUpdate={update} onWarranty={saveWarranty} onPlan={addPlan} onUpdatePlan={updatePlan} onDeletePlan={removePlan} onUpload={uploadFiles} onDeleteFile={removeAssetFile} onComplete={setCompletionPlan} /> : view === 'start' ? <StartPage assets={assets} documentCount={documents.length} storageBytes={storageBytes} purchaseValues={purchaseValues} attention={attention} reminders={reminders} onCapture={openQuickAdd} onOpen={openDetail} onAllItems={() => setView('items')} onTimeline={() => setView('timeline')} /> : view === 'timeline' ? <TimelinePage assets={assets} filter={timelineFilter} onFilter={setTimelineFilter} onOpen={openDetail} onComplete={setCompletionPlan} /> : view === 'document-ocr' && selectedDocument ? <DocumentOcrPage document={selectedDocument} onBack={() => setView("binder")} onRun={runOcr} onSave={saveOcr} onDeleteFile={removeDocumentFile} /> : view === 'binder' ? <BinderPage documents={documents} onOpenOcr={(document) => { setSelectedDocument(document); setView("document-ocr"); }} onUpdate={updateDocument} onBatchOcr={batchOcr} onUpload={uploadDocumentFiles} onTrash={trashDocument} /> : view === 'trash' ? <TrashPage entries={trashEntries} onRestore={restoreTrash} onEmpty={emptyTrash} /> : view === 'account' ? <AccountPage section={accountSection} onSection={setAccountSection} onLogout={logout} /> : view === 'settings' ? <SettingsPage /> : view === 'search' ? <SearchPage query={query} assets={assets} documents={documents} onOpenAsset={openDetail} onOpenDocument={(document) => { setSelectedDocument(document); setView("document-ocr"); }} /> : view === 'inbox' ? <InboxPage files={inboxFiles} assets={assets} onUpload={uploadInboxFiles} onAssign={assignInbox} onToDocument={inboxToDocument} onDelete={deleteInboxFile} /> : <ItemsPage allAssets={assets} assets={collectionAssets} attention={attention} isLoading={isLoading} filter={filter} onFilter={setFilter} onCapture={openQuickAdd} onOpen={openDetail} />}
      </section>
    </main>
    {completionPlan && <CompletionDialog plan={completionPlan} onClose={() => setCompletionPlan(null)} onSave={(input) => void completePlan(completionPlan.id, input)} />}
    {isQuickAddOpen && <QuickAddDialog onClose={() => setQuickAddOpen(false)} onSave={quickAdd} />}
    {isMobileMenuOpen && <MobileMoreMenu inboxCount={inboxFiles.length} onClose={()=>setMobileMenuOpen(false)} onNavigate={(next)=>{if(navigateTo(next))setMobileMenuOpen(false)}} trashCount={trashEntries.length}/>}
    {message && <button className="toast" onClick={() => setMessage(null)} type="button"><span>{message}</span><Icon name="x" /></button>}
  </div>;
}

function NotificationsMenu({ hasUnreadToday, history, onOpenAsset, onReadToday, todayReminders }: { hasUnreadToday: boolean; history: UiNotification[]; onOpenAsset: (id: string) => void; onReadToday: () => void; todayReminders: ReminderEntry[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    window.document.addEventListener("mousedown", closeOnOutside);
    return () => window.document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);
  function toggle() { const next = !open; setOpen(next); if (next) onReadToday(); }
  return <div className="notifications-menu-wrap" ref={menuRef}>
    <button aria-expanded={open} aria-haspopup="dialog" className={open ? "notification-button active" : "notification-button"} onClick={toggle} title="Powiadomienia" type="button"><Icon label="Powiadomienia" name="bell" />{hasUnreadToday && <i aria-label="Nowe powiadomienia" />}</button>
    {open && <section aria-label="Powiadomienia" className="notifications-panel" role="dialog"><header><div><p className="eyebrow">Powiadomienia</p><h2>Centrum powiadomień</h2></div><button className="icon-button" onClick={() => setOpen(false)} type="button"><Icon label="Zamknij" name="x" /></button></header><div className="notifications-scroll"><section className="notifications-section"><h3>Dzisiaj</h3>{todayReminders.length ? todayReminders.map((entry) => <button className="notification-row notification-row--today" key={entry.kind + "-" + entry.id} onClick={() => { onOpenAsset(entry.asset.id); setOpen(false); }} type="button"><span className="notification-row-icon"><Icon name={entry.kind === "maintenance" ? "tool" : "shield-check"} /></span><span><strong>{entry.kind === "maintenance" ? entry.plan?.title : "Koniec gwarancji"}</strong><small>{entry.asset.name} · {entry.kind === "maintenance" ? "Przegląd jest zaplanowany na dziś" : "Gwarancja wygasa dzisiaj"}</small></span></button>) : <p className="notifications-empty">Brak terminów przypadających na dziś.</p>}</section><section className="notifications-section"><h3>Historia działań</h3>{history.length ? history.slice(0, 20).map((entry) => <div className="notification-row notification-row--history" key={entry.id}><span className="notification-row-icon"><Icon name="bell" /></span><span><strong>{entry.message}</strong><small>{new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}</small></span></div>) : <p className="notifications-empty">Działania wykonane w aplikacji pojawią się tutaj.</p>}</section></div></section>}
  </div>;
}

function AccountMenu({ account, active, activeHouseholdId, avatarInitials, households, onLogout, onSelect, onSwitch }: { account: {login:string;email:string} | null; active: boolean; activeHouseholdId: string | null; avatarInitials: string; households: {id:string;name:string;role:string}[]; onLogout: () => Promise<void>; onSelect: (section: AccountSection) => void; onSwitch: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.document.addEventListener('mousedown', closeOnOutsideClick);
    return () => window.document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);
  function choose(section: AccountSection) { onSelect(section); setOpen(false); }
  return <div className="account-menu-wrap" ref={menuRef}>
    <button aria-expanded={open} aria-haspopup="menu" className={`topbar-avatar ${active ? 'active' : ''}`} onClick={() => setOpen((value) => !value)} title="Konto użytkownika" type="button">{avatarInitials}</button>
    {open && <div className="account-menu" role="menu">
      <header><span className="account-menu-avatar">{avatarInitials}</span><div><strong>{account?.login ?? 'Użytkownik'}</strong><small>{account?.email ?? ''}</small></div></header>
      {households.length > 0 && <label className="account-household-switch">Aktywne gospodarstwo<select value={activeHouseholdId ?? ''} onChange={(event) => { const id = event.target.value; void onSwitch(id).then(() => setOpen(false)); }}>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select></label>}
      <p className="account-menu-label">Twoje gospodarstwa domowe</p>
      <button onClick={() => choose('households')} role="menuitem" type="button"><span className="account-menu-icon"><Icon name="home" /></span><span><strong>Gospodarstwa</strong><small>Tworzenie i zmiana nazw</small></span></button>
      <button onClick={() => choose('members')} role="menuitem" type="button"><span className="account-menu-icon"><Icon name="package" /></span><span><strong>Członkowie</strong><small>Dostęp i role użytkowników</small></span></button>
      <p className="account-menu-label">Konto</p>
      <button onClick={() => choose('security')} role="menuitem" type="button"><span className="account-menu-icon"><Icon name="shield-check" /></span><span><strong>Bezpieczeństwo konta</strong><small>Hasło i aktywne sesje</small></span></button>
      <button onClick={() => choose('webhooks')} role="menuitem" type="button"><span className="account-menu-icon"><Icon name="dots" /></span><span><strong>Webhooki</strong><small>Integracje i powiadomienia</small></span></button>
      <button className="account-logout" onClick={() => void onLogout().then(() => setOpen(false))} role="menuitem" type="button">Wyloguj się</button>
    </div>}
  </div>;
}

function MobileMoreMenu({ inboxCount, onClose, onNavigate, trashCount }: { inboxCount: number; onClose: () => void; onNavigate: (view: 'timeline' | 'inbox' | 'trash' | 'settings') => void; trashCount: number }) {
  return <div className="dialog-backdrop mobile-more-backdrop" role="presentation"><section aria-modal="true" className="mobile-more-dialog" role="dialog"><header><div><p className="eyebrow">Nawigacja</p><h2>Więcej</h2></div><button className="icon-button" onClick={onClose} type="button"><Icon label="Zamknij" name="x" /></button></header><div className="mobile-more-links"><button onClick={() => onNavigate('timeline')} type="button"><span className="mobile-more-icon"><Icon name="calendar-event" /></span><span><strong>Terminy</strong><small>Gwarancje i zaplanowane czynności</small></span></button><button onClick={() => onNavigate('inbox')} type="button"><span className="mobile-more-icon"><Icon name="file-text" /></span><span><strong>Do przypisania ({inboxCount})</strong><small>Pliki oczekujące na przypisanie</small></span></button><button onClick={() => onNavigate('trash')} type="button"><span className="mobile-more-icon"><Icon name="trash" /></span><span><strong>Kosz ({trashCount})</strong><small>Elementy oczekujące na usunięcie</small></span></button><button onClick={() => onNavigate('settings')} type="button"><span className="mobile-more-icon"><Icon name="dots" /></span><span><strong>Ustawienia</strong><small>Backup, dane i historia</small></span></button></div></section></div>;
}

function AccountPage({ section, onSection, onLogout }: { section: AccountSection; onSection: (section: AccountSection) => void; onLogout: () => Promise<void> }) {
  return <><div className="page-heading"><div><p className="eyebrow">Profil użytkownika</p><h1>Moje konto</h1><p>Zarządzaj gospodarstwami, dostępem użytkowników i bezpieczeństwem konta.</p></div></div><div className="account-settings-layout"><nav aria-label="Sekcje konta" className="account-settings-nav"><p>Gospodarstwa domowe</p><button className={section === 'households' ? 'active' : ''} onClick={() => onSection('households')} type="button"><Icon name="home" />Gospodarstwa</button><button className={section === 'members' ? 'active' : ''} onClick={() => onSection('members')} type="button"><Icon name="package" />Członkowie</button><p>Konto i integracje</p><button className={section === 'security' ? 'active' : ''} onClick={() => onSection('security')} type="button"><Icon name="shield-check" />Bezpieczeństwo</button><button className={section === 'webhooks' ? 'active' : ''} onClick={() => onSection('webhooks')} type="button"><Icon name="dots" />Webhooki</button></nav><div className="account-settings-content">{section === 'households' ? <HouseholdSettings /> : section === 'members' ? <MembersSettings /> : section === 'security' ? <SecuritySettings onLogout={onLogout} /> : <WebhookSettings />}</div></div></>;
}

function HouseholdSettings() {
  const [households,setHouseholds]=useState<{id:string;name:string;role:string}[]>([]);
  const [name,setName]=useState('');
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editingName,setEditingName]=useState('');
  const [error,setError]=useState('');
  const load=()=>void api.households().then(r=>setHouseholds(r.data.households));
  useEffect(load,[]);
  async function create(){try{setError('');await api.createHousehold(name);setName('');load();window.dispatchEvent(new Event('boberit-households-changed'));}catch(e){setError(e instanceof Error?e.message:'Nie udało się utworzyć gospodarstwa.')}}
  async function rename(id:string){if(!editingName.trim())return;try{setError('');await api.renameHousehold(id,editingName);setEditingId(null);setEditingName('');load();window.dispatchEvent(new Event('boberit-households-changed'));}catch(e){setError(e instanceof Error?e.message:'Nie udało się zmienić nazwy.')}}
  return <section className="settings-card"><span><Icon name="home"/></span><div><p className="eyebrow">Gospodarstwa domowe</p><h2>Twoje gospodarstwa</h2><p>Każde gospodarstwo ma własne przedmioty, dokumenty, terminy i backup.</p><div className="inline-form"><input aria-label="Nazwa nowego gospodarstwa" value={name} onChange={e=>setName(e.target.value)} maxLength={80} placeholder="Np. Dom letniskowy"/><button className="secondary" disabled={!name.trim()} onClick={()=>void create()} type="button">Utwórz gospodarstwo</button></div>{error&&<p className="form-error">{error}</p>}<div className="webhook-list">{households.map(h=><div key={h.id}>{editingId===h.id?<div className="inline-form household-rename"><input autoFocus aria-label={`Nowa nazwa ${h.name}`} value={editingName} maxLength={80} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void rename(h.id);if(e.key==='Escape')setEditingId(null)}}/><button className="text-action" disabled={!editingName.trim()} onClick={()=>void rename(h.id)} type="button">Zapisz</button><button className="text-action" onClick={()=>setEditingId(null)} type="button">Anuluj</button></div>:<><strong>{h.name}</strong><small>{h.role==='owner'?'Właściciel':'Członek'}</small>{h.role==='owner'&&<button className="text-action" onClick={()=>{setEditingId(h.id);setEditingName(h.name)}} type="button">Zmień nazwę</button>}</>}</div>)}</div></div></section>;
}

function MembersSettings(){const [members,setMembers]=useState<{id:string;login:string;email:string;role:'owner'|'member'}[]>([]);const [canManage,setCanManage]=useState(false);const [login,setLogin]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [role,setRole]=useState<'owner'|'member'>('member');const [error,setError]=useState('');const load=()=>void api.listMembers().then(r=>{setMembers(r.data.members as typeof members);setCanManage(r.data.canManage)}).catch(e=>setError(e instanceof Error?e.message:'Nie udało się odczytać członków.'));useEffect(load,[]);async function save(){try{await api.createMember({login,email,password,role});setLogin('');setEmail('');setPassword('');load()}catch(e){setError(e instanceof Error?e.message:'Nie udało się utworzyć konta.')}}async function changeRole(id:string,next:'owner'|'member'){try{await api.updateMemberRole(id,next);load()}catch(e){setError(e instanceof Error?e.message:'Nie udało się zmienić roli.')}}async function remove(id:string,memberLogin:string){if(!window.confirm(`Usunąć ${memberLogin} z tego gospodarstwa? Konto pozostanie zachowane, ale straci dostęp do jego danych.`))return;try{await api.removeMember(id);load()}catch(e){setError(e instanceof Error?e.message:'Nie udało się usunąć członka.')}}return <section className="settings-card"><span><Icon name="package"/></span><div><p className="eyebrow">Gospodarstwo domowe</p><h2>Członkowie</h2>{canManage&&<><input value={login} onChange={e=>setLogin(e.target.value)} placeholder="Login"/><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail"/><input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Hasło, min. 12 znaków" type="password"/><select value={role} onChange={e=>setRole(e.target.value as 'owner'|'member')}><option value="member">Członek</option><option value="owner">Właściciel</option></select><button className="secondary" disabled={!login||!email||password.length<12} onClick={()=>void save()} type="button">Utwórz konto</button></>}{!canManage&&<p>Role i dostęp do tego gospodarstwa zarządza jego właściciel.</p>}{error&&<p className="form-error">{error}</p>}<div className="webhook-list">{members.map(m=><div key={m.id}><strong>{m.login}</strong><small>{m.email} · {m.role==='owner'?'Właściciel':'Członek'}</small>{canManage&&<span className="member-actions"><select aria-label={`Rola ${m.login}`} value={m.role} onChange={e=>void changeRole(m.id,e.target.value as 'owner'|'member')}><option value="member">Członek</option><option value="owner">Właściciel</option></select><button className="text-action danger-action" onClick={()=>void remove(m.id,m.login)} type="button">Usuń z gospodarstwa</button></span>}</div>)}</div></div></section>;}

type WebhookRecord = { id: string; name: string; url: string; events: string[]; scopeAll: boolean; householdIds: string[] };
const availableWebhookEvents = ["asset.created", "asset.deleted", "document.created", "document.deleted", "maintenance.created", "maintenance.completed", "backup.exported", "backup.restored"];

function WebhookSettings() {
  const [hooks, setHooks] = useState<WebhookRecord[]>([]);
  const [households, setHouseholds] = useState<{ id: string; name: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [url, setUrl] = useState(""); const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["asset.created"]); const [householdIds, setHouseholdIds] = useState<string[]>([]); const [error, setError] = useState("");
  function load() { void api.listWebhooks().then((response) => setHooks(response.data)); void api.households().then((response) => setHouseholds(response.data.households)); }
  useEffect(load, []);
  function reset() { setEditingId(null); setName(""); setUrl(""); setSecret(""); setEvents(["asset.created"]); setHouseholdIds([]); setError(""); }
  function edit(hook: WebhookRecord) { setEditingId(hook.id); setName(hook.name); setUrl(hook.url); setSecret(""); setEvents(hook.events); setHouseholdIds(hook.scopeAll ? [] : hook.householdIds); setError(""); }
  async function save() { try { setError(""); const input = secret ? { name, url, secret, events, householdIds } : { name, url, events, householdIds }; if (editingId) await api.updateWebhook(editingId, input); else await api.createWebhook(input); reset(); load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się zapisać webhooka."); } }
  async function remove(hook: WebhookRecord) { if (!window.confirm("Usunąć webhook „" + hook.name + "”?")) return; await api.deleteWebhook(hook.id); if (editingId === hook.id) reset(); load(); }
  return <div className="webhook-settings-stack"><section className="settings-card webhook-card"><span><Icon name="dots" /></span><div><p className="eyebrow">Integracje</p><h2>{editingId ? "Edytuj webhook" : "Konfiguracja webhooka"}</h2><p>Podaj endpoint odbierający zdarzenia. Secret jest opcjonalny i służy do podpisywania żądań.</p><input aria-label="Nazwa webhooka" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nazwa webhooka" /><input aria-label="Adres webhooka" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /><input aria-label="Secret webhooka" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={editingId ? "Nowy secret — pozostaw puste, aby zachować obecny" : "Secret (opcjonalnie)"} type="password" /><div className="webhook-form-actions"><button className="secondary" disabled={!name.trim() || !url.trim() || !events.length} onClick={() => void save()} type="button">{editingId ? "Zapisz zmiany" : "Dodaj webhook"}</button>{editingId && <button className="text-action" onClick={reset} type="button">Anuluj edycję</button>}</div>{error && <p className="form-error">{error}</p>}<div className="webhook-list webhook-config-list">{hooks.map((hook) => <div key={hook.id}><span><strong>{hook.name}</strong><small>{hook.url}</small></span><button className="text-action" onClick={() => edit(hook)} type="button">Edytuj</button><button className="text-action danger-action" onClick={() => void remove(hook)} type="button">Usuń</button></div>)}{!hooks.length && <p className="subtle">Nie skonfigurowano jeszcze żadnego webhooka.</p>}</div></div></section><section className="settings-card webhook-notification-card"><span><Icon name="bell" /></span><div><p className="eyebrow">Powiadomienia</p><h2>Zakres powiadomień</h2><p>Wybierz gospodarstwa oraz zdarzenia dla aktualnie tworzonego lub edytowanego webhooka.</p><h3>Gospodarstwa</h3><div className="webhook-events">{households.map((household) => <label key={household.id}><input checked={householdIds.includes(household.id)} onChange={() => setHouseholdIds((ids) => ids.includes(household.id) ? ids.filter((id) => id !== household.id) : [...ids, household.id])} type="checkbox" />{household.name}</label>)}</div><small className="webhook-scope-hint">Brak zaznaczenia oznacza wszystkie gospodarstwa, do których należysz.</small><h3>Typy zdarzeń</h3><div className="webhook-events">{availableWebhookEvents.map((eventName) => <label key={eventName}><input checked={events.includes(eventName)} onChange={() => setEvents((current) => current.includes(eventName) ? current.filter((value) => value !== eventName) : [...current, eventName])} type="checkbox" />{eventLabel(eventName)}</label>)}</div></div></section></div>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [setup, setSetup] = useState<boolean | null>(null); const [login, setLogin] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [householdName, setHouseholdName] = useState(""); const [error, setError] = useState("");
  useEffect(() => { void api.setup().then((response) => setSetup(response.data.needsSetup)).catch((reason) => setError(reason instanceof Error ? reason.message : "Nie udało się połączyć z Boberit.")); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try { const response = setup ? await api.register({ login, email, password, householdName }) : await api.login({ login, password }); onAuthenticated(response.data.token); } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się zalogować."); } }
  return <main className="auth-screen"><section className="auth-shell"><div className="auth-banner-wrap"><img className="auth-banner" src="/branding/boberit-banner.png" alt="Boberit" /></div><section className="auth-card"><div className="auth-heading"><p className="eyebrow">{setup ? "Pierwsze uruchomienie" : "Witaj ponownie"}</p><h1>{setup ? "Utwórz pierwsze konto" : "Zaloguj się"}</h1><p>{setup ? "Skonfiguruj właściciela i pierwsze gospodarstwo." : "Wejdź do swojego gospodarstwa i sprawdź, co wymaga uwagi."}</p></div><form onSubmit={submit}><label>Login<input autoComplete="username" autoFocus required value={login} onChange={(event) => setLogin(event.target.value)} placeholder="Twój login" /></label>{setup && <><label>E-mail<input autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Adres e-mail" type="email" /></label><label>Nazwa gospodarstwa<input required value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder="np. Nasz dom" /></label></>}<label>Hasło<input autoComplete={setup ? "new-password" : "current-password"} minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 12 znaków" type="password" /></label><button className="primary auth-submit" disabled={setup === null} type="submit">{setup === null ? "Łączenie…" : setup ? "Utwórz konto" : "Zaloguj się"}</button>{error && <p className="form-error" role="alert">{error}</p>}</form><p className="auth-footnote">Twoje dane pozostają w Twojej instancji Boberit.</p></section></section></main>;
}

function SecuritySettings({ onLogout }: { onLogout: () => Promise<void> }){
  const [current,setCurrent]=useState('');
  const [next,setNext]=useState('');
  const [notice,setNotice]=useState<{kind:'success'|'error';text:string}|null>(null);
  async function change(){try{await api.changePassword(current,next);setCurrent('');setNext('');setNotice({kind:'success',text:'Hasło zmieniono. Pozostałe sesje zostały wylogowane.'})}catch(e){setNotice({kind:'error',text:e instanceof Error?e.message:'Nie udało się zmienić hasła.'})}}
  async function revoke(){try{const r=await api.logoutOthers();setNotice({kind:'success',text:`Wylogowano ${r.data.revoked} innych sesji.`})}catch(e){setNotice({kind:'error',text:e instanceof Error?e.message:'Nie udało się wylogować sesji.'})}}
  return <section className="settings-card"><span><Icon name="shield-check"/></span><div><p className="eyebrow">Bezpieczeństwo konta</p><h2>Hasło i sesje</h2><input aria-label="Obecne hasło" autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)} type="password" placeholder="Obecne hasło"/><input aria-label="Nowe hasło" autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)} type="password" placeholder="Nowe hasło, min. 12 znaków"/><div className="settings-actions"><button className="secondary" disabled={!current||next.length<12} onClick={()=>void change()} type="button">Zmień hasło</button><button className="text-action" onClick={()=>void revoke()} type="button">Wyloguj pozostałe urządzenia</button><button className="text-action danger-action" onClick={()=>void onLogout()} type="button">Wyloguj się</button></div>{notice&&<p className={notice.kind==='error'?'form-error':'form-success'} role="status">{notice.text}</p>}</div></section>;
}

function ActivitySettings(){
  const [events,setEvents]=useState<{action:string;entity_kind:string;label:string|null;user_login:string|null;created_at:string}[]>([]);
  const [bytes,setBytes]=useState(0);
  useEffect(()=>{void api.activity().then(r=>setEvents(r.data));void api.storage().then(r=>setBytes(r.data.bytes))},[]);
  const actionLabels:Record<string,string>={created:'Utworzono',trashed:'Przeniesiono do Kosza',restored:'Przywrócono',deleted:'Usunięto','password.changed':'Zmieniono hasło użytkownika','sessions.revoked':'Wylogowano inne sesje'};
  const entityLabels:Record<string,string>={asset:'przedmiot',document:'dokument',account:'konto',session:'sesję',backup:'backup'};
  const describe=(event:{action:string;entity_kind:string})=>`${actionLabels[event.action]??eventLabel(`${event.entity_kind}.${event.action}`)} ${entityLabels[event.entity_kind]??event.entity_kind}`;
  return <section className="settings-card"><span><Icon name="calendar-event"/></span><div><p className="eyebrow">Aktywność i pliki</p><h2>Historia gospodarstwa</h2><p>Wykorzystane miejsce: {(bytes/1024/1024).toFixed(1)} MB</p><div className="webhook-list activity-list">{events.map((e,i)=><div key={i}><strong>{describe(e)}</strong><small>{e.label??'Element'} · {e.user_login??'system'} · {new Date(e.created_at).toLocaleString('pl-PL')}</small></div>)}{!events.length&&<p>Brak zapisanych działań.</p>}</div></div></section>;
}

function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>("backup");
  return <>
    <div className="page-heading"><div><p className="eyebrow">Administracja</p><h1>Ustawienia</h1><p>Zarządzaj kopią danych oraz historią aktywnego gospodarstwa.</p></div></div>
    <div className="settings-layout">
      <nav aria-label="Sekcje ustawień" className="settings-nav"><p>Gospodarstwo</p><button className={section === "backup" ? "active" : ""} onClick={() => setSection("backup")} type="button"><Icon name="file-text" />Backup</button><button className={section === "activity" ? "active" : ""} onClick={() => setSection("activity")} type="button"><Icon name="calendar-event" />Historia gospodarstwa</button></nav>
      <div className="settings-content">{section === "backup" ? <BackupSettings /> : <ActivitySettings />}</div>
    </div>
  </>;
}

function BackupSettings() {
  const [file, setFile] = useState<File | null>(null); const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function download() { try { const blob=await api.downloadBackup(); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download="boberit-backup-" + new Date().toISOString().slice(0,10) + ".json"; link.click(); URL.revokeObjectURL(url); } catch(error) { setMessage(error instanceof Error?error.message:"Nie udało się pobrać backupu."); } }
  async function restore() { if (!file || confirmation !== "ZASTĄP") return; setBusy(true); try { await api.importBackup(file); window.location.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Nie udało się odtworzyć backupu."); } finally { setBusy(false); } }
  return <div className="settings-grid settings-grid--single"><section className="settings-card"><span><Icon name="file-text" /></span><div><p className="eyebrow">Backup</p><h2>Pakiet Boberit</h2><p>Pobierz dane i załączniki aktywnego gospodarstwa w jednym pliku JSON.</p><button className="primary" onClick={()=>void download()} type="button">Pobierz backup</button></div></section><section className="settings-card"><span><Icon name="package" /></span><div><p className="eyebrow">Odtwarzanie</p><h2>Przywróć pakiet</h2><p>Ta operacja zastąpi dane i pliki tylko aktywnego gospodarstwa. Najpierw pobierz aktualny backup.</p><label className="restore-file secondary">Wybierz backup<input accept="application/json,.json" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} type="file" /></label>{file && <label>Wpisz <b>ZASTĄP</b>, aby potwierdzić<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}<button className="secondary danger-button" disabled={!file || confirmation !== "ZASTĄP" || busy} onClick={() => void restore()} type="button">{busy ? "Odtwarzanie…" : "Zastąp dane backupem"}</button>{message && <p className="form-error">{message}</p>}</div></section></div>;
}

function StartPage({ assets, documentCount, storageBytes, purchaseValues, attention, reminders, onCapture, onOpen, onAllItems, onTimeline }: { assets: AssetSummary[]; documentCount: number; storageBytes: number; purchaseValues: PurchaseValue[]; attention: AssetSummary[]; reminders: ReminderEntry[]; onCapture: () => void; onOpen: (id: string) => Promise<void>; onAllItems: () => void; onTimeline: () => void }) {
  const today = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const drafts = assets.filter((asset) => asset.completeness !== 'complete');
  return <>
    <div className="page-heading start-heading"><div><p className="eyebrow">{today}</p><h1>Dzień dobry.</h1><p>Wszystko ważne jest pod ręką.</p></div><div className="heading-metrics"><div className="heading-metric"><strong>{assets.length}</strong><span>zapisane<br />przedmioty</span></div><div className="heading-metric"><strong>{documentCount}</strong><span>zapisane<br />dokumenty</span></div><div className="heading-metric heading-metric--storage"><strong>{formatStorage(storageBytes)}</strong><span>wykorzystane<br />miejsce</span></div><div className="heading-metric heading-metric--value"><strong title={formatPurchaseValues(purchaseValues)}>{formatPurchaseValues(purchaseValues)}</strong><span>wartość<br />zakupów</span></div></div></div>
    <div className="start-attention">
      {attention.map((asset) => <button className="start-attention-card urgent" onClick={() => void onOpen(asset.id)} key={asset.id} type="button"><span><Icon name="shield-check" /></span><div><small>Gwarancja wymaga uwagi · {warrantyLabel(asset).text}</small><strong>{asset.name}</strong><p>Otwórz przedmiot i sprawdź zakres ochrony oraz dokumenty.</p></div><b>Sprawdź →</b></button>)}
      {drafts.slice(0, Math.max(0, 2 - attention.length)).map((asset) => <button className="start-attention-card" onClick={() => void onOpen(asset.id)} key={asset.id} type="button"><span><Icon name="package" /></span><div><small>Wymaga uzupełnienia</small><strong>{asset.name}</strong><p>Dodaj dane zakupu, gwarancję lub dokumentację.</p></div><b>Uzupełnij →</b></button>)}
      {!attention.length && !drafts.length && <div className="start-empty">Nie ma pilnych spraw. Możesz spokojnie dodać kolejny przedmiot.</div>}
    </div>
    <div className="start-overview-grid">
    <section className="start-reminders"><div className="section-heading"><div><p className="eyebrow">Przypomnienia</p><h2>Wymagają uwagi <em>{reminders.length}</em></h2></div><button className="text-action" onClick={onTimeline} type="button">Wszystkie terminy →</button></div>{reminders.length ? <div className="reminder-list">{reminders.slice(0, 4).map((entry) => { const days = daysFromToday(entry.dueOn); const label = days < 0 ? `${Math.abs(days)} dni po terminie` : days === 0 ? 'Dzisiaj' : days === 1 ? 'Jutro' : `Za ${days} dni`; return <button className={days < 0 ? 'reminder-row overdue' : 'reminder-row'} key={`${entry.kind}-${entry.id}`} onClick={() => void onOpen(entry.asset.id)} type="button"><span className="reminder-icon"><Icon name={entry.kind === 'maintenance' ? 'tool' : 'shield-check'} /></span><span><strong>{entry.kind === 'maintenance' ? entry.plan?.title : 'Koniec gwarancji'} · {entry.asset.name}</strong><small>{entry.kind === 'maintenance' ? 'Konserwacja' : 'Gwarancja'} · {formatDate(entry.dueOn)}</small></span><b>{label}</b></button>; })}</div> : <div className="start-empty">Nie ma gwarancji ani konserwacji wymagających uwagi w ciągu 30 dni.</div>}</section>
    <section className="start-recent">
    <div className="section-heading"><div><p className="eyebrow">Kolekcja</p><h2>Ostatnio zapisane</h2></div><button className="text-action" type="button" onClick={onAllItems}>Wszystkie {assets.length} →</button></div>
    <div className="recent-list">{assets.slice(0, 5).map((asset) => <button className="recent-row" key={asset.id} type="button" onClick={() => void onOpen(asset.id)}><span className="asset-icon"><Icon name="package" /></span><span><strong>{asset.name}</strong><small>{[asset.manufacturer, asset.modelNumber].filter(Boolean).join(' · ') || 'Szkic — uzupełnij dane'}</small></span><span className={`warranty ${warrantyLabel(asset).state}`}><b />{warrantyLabel(asset).text}</span></button>)}{assets.length === 0 && <div className="empty"><Icon name="package" /><strong>Kolekcja jest jeszcze pusta</strong><p>Dodaj pierwszy przedmiot, aby Boberit mógł pilnować jego dokumentów i terminów.</p></div>}</div></section>
    </div>
  </>;
}

function formatStorage(bytes: number): string { if (bytes < 1024) return bytes + " B"; if (bytes < 1_048_576) return (bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0) + " KB"; if (bytes < 1_073_741_824) return (bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0) + " MB"; return (bytes / 1_073_741_824).toFixed(1) + " GB"; }
function formatPurchaseValues(values: PurchaseValue[]): string { if (!values.length) return "0,00 zł"; return values.map(({currency,amountMinor})=>{try{return new Intl.NumberFormat("pl-PL",{style:"currency",currency}).format(amountMinor/100)}catch{return (amountMinor/100).toFixed(2) + " " + currency}}).join(" + "); }
function fileSize(bytes: number): string { return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`; }
function InboxPage({ files, assets, onUpload, onAssign, onToDocument, onDelete }: { files: InboxFile[]; assets: AssetSummary[]; onUpload: (files: File[]) => Promise<void>; onAssign: (id: string, assetId: string, kind: AssetFileKind) => Promise<void>; onToDocument: (id: string, input: CreateBinderDocumentInput) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  return <>
    <div className="page-heading"><div><p className="eyebrow">Masowy import</p><h1>Do przypisania</h1><p>Dodaj pliki teraz. Przypisz je do przedmiotów albo zachowaj jako dokument później.</p></div><div className="inbox-capture-actions"><label className="primary inbox-upload">Import<input type="file" multiple accept="image/*,.pdf,.txt,.doc,.docx" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; if (files.length) void onUpload(files); }} /></label></div></div>
    <div className="section-heading"><div><p className="eyebrow">Do uporządkowania</p><h2>Pliki w Skrzynce <em>{files.length}</em></h2></div></div>
    <div className="inbox-list">{files.map((file) => <InboxRow file={file} assets={assets} key={file.id} onAssign={onAssign} onToDocument={onToDocument} onDelete={onDelete} />)}{files.length === 0 && <div className="empty"><Icon name="file-text" /><strong>Brak plików do przypisania</strong><p>Dodaj plik z telefonu lub komputera. Pojawi się tutaj, dopóki go nie uporządkujesz.</p></div>}</div>
  </>;
}
function InboxRow({ file, assets, onAssign, onToDocument, onDelete }: { file: InboxFile; assets: AssetSummary[]; onAssign: (id: string, assetId: string, kind: AssetFileKind) => Promise<void>; onToDocument: (id: string, input: CreateBinderDocumentInput) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [target, setTarget] = useState<'asset' | 'binder'>('asset'); const [assetId, setAssetId] = useState(''); const [kind, setKind] = useState<AssetFileKind>('receipt'); const [name, setName] = useState(file.originalName.replace(/\.[^/.]+$/, '')); const [type, setType] = useState(''); const [tags, setTags] = useState(''); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false);
  async function submit() { setBusy(true); try { if (target === 'asset' && assetId) await onAssign(file.id, assetId, kind); if (target === 'binder' && name.trim()) await onToDocument(file.id, { name, type, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), notes }); } finally { setBusy(false); } }
  return <article className="inbox-row inbox-row--expanded"><span className="inbox-file-icon"><Icon name="file-text" /></span><div className="inbox-file-copy"><strong>{file.originalName}</strong><small>{file.mimeType || 'plik'} · {fileSize(file.byteSize)} · dodano {formatDate(file.createdAt.slice(0, 10))}</small><span className="inbox-file-links"><button className="text-action" onClick={()=>void downloadAttachment(file.id,file.originalName)} type="button">Pobierz</button><button className="text-action danger-action" onClick={() => { if (window.confirm(`Usunąć plik „${file.originalName}” z listy Do przypisania? Tej operacji nie można cofnąć.`)) void onDelete(file.id); }} type="button">Usuń</button></span></div><div className="inbox-target"><div className="inbox-target-tabs"><button className={target === 'asset' ? 'active' : ''} onClick={() => setTarget('asset')} type="button">Przedmiot</button><button className={target === 'binder' ? 'active' : ''} onClick={() => setTarget('binder')} type="button">Dokument</button></div>{target === 'asset' ? <div className="inbox-assign"><select aria-label="Przedmiot" value={assetId} onChange={(event) => setAssetId(event.target.value)} disabled={!assets.length}><option value="">Wybierz przedmiot…</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><select aria-label="Rodzaj pliku" value={kind} onChange={(event) => setKind(event.target.value as AssetFileKind)}><option value="receipt">Paragon</option><option value="manual">Instrukcja</option><option value="photo">Zdjęcie</option><option value="other">Inne</option></select><button className="secondary" disabled={!assetId || busy} onClick={() => void submit()} type="button">{busy ? 'Przypisywanie…' : 'Przypisz'}</button></div> : <div className="inbox-document-fields"><input aria-label="Nazwa dokumentu" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nazwa dokumentu" /><input aria-label="Typ dokumentu" value={type} onChange={(event) => setType(event.target.value)} placeholder="Typ, np. faktura" /><input aria-label="Tagi" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tagi, po przecinku" /><input aria-label="Notatka" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notatka" /><button className="secondary" disabled={!name.trim() || busy} onClick={() => void submit()} type="button">{busy ? 'Zapisywanie…' : 'Dodaj do Dokumentów'}</button></div>}</div></article>;
}

type OcrStatus = "pending" | "processing" | "completed" | "failed" | "unsupported";
type OcrDetails = { status: OcrStatus; text: string; error: string | null; updatedAt: string | null };

function ocrStatusMeta(status: OcrStatus): { label: string; icon: IconName } {
  const statuses: Record<OcrStatus, { label: string; icon: IconName }> = {
    pending: { label: "nie uruchomiono", icon: "calendar-event" },
    processing: { label: "w toku", icon: "dots" },
    completed: { label: "gotowe", icon: "shield-check" },
    failed: { label: "błąd", icon: "x" },
    unsupported: { label: "brak obsługi", icon: "file-text" },
  };
  return statuses[status];
}

function OcrStatusIcon({ status: rawStatus }: { status: BinderDocument["ocrStatus"] }) {
  const status = (rawStatus ?? "pending") as OcrStatus;
  const meta = ocrStatusMeta(status);
  return <span aria-label={`OCR: ${meta.label}`} className={`ocr-status-icon ocr-status--${status}`} role="img" title={`OCR: ${meta.label}`}><Icon name={meta.icon} /></span>;
}

function BinderPage({ documents, onOpenOcr, onUpdate, onBatchOcr, onUpload, onTrash }: { documents: BinderDocument[]; onOpenOcr: (document: BinderDocument) => void; onUpdate: (id: string, input: Partial<CreateBinderDocumentInput>) => Promise<void>; onBatchOcr: () => Promise<void>; onUpload: (id: string, files: File[]) => Promise<void>; onTrash: (id: string) => Promise<void> }) {
  const overdueOcrCount = documents.filter((document) => document.files.length > 0 && (!document.ocrStatus || document.ocrStatus === "pending" || document.ocrStatus === "failed")).length;
  return <><div className="page-heading"><div><p className="eyebrow">Dokumenty niezależne</p><h1>Dokumenty</h1><p>Umowy, faktury, potwierdzenia i pełnotekstowe wyszukiwanie OCR.</p></div><button className="secondary" disabled={!overdueOcrCount} onClick={() => void onBatchOcr()} type="button">OCR zaległych dokumentów <span className="ocr-batch-count">{overdueOcrCount}</span></button></div><div className="document-table-wrap"><table className="document-table"><thead><tr><th>Dokument</th><th>Typ</th><th>Tagi</th><th>Dodano</th><th>OCR</th><th>Akcje</th></tr></thead><tbody>{documents.map((document) => <DocumentTableRow document={document} key={document.id} onOpenOcr={onOpenOcr} onUpdate={onUpdate} onUpload={onUpload} onTrash={onTrash} />)}</tbody></table>{documents.length === 0 && <div className="empty"><Icon name="file-text" /><strong>Brak dokumentów</strong><p>Dodaj dokument przyciskiem Dodaj w nagłówku.</p></div>}</div></>;
}

function DocumentTableRow({ document, onOpenOcr, onUpdate, onUpload, onTrash }: { document: BinderDocument; onOpenOcr: (document: BinderDocument) => void; onUpdate: (id: string, input: Partial<CreateBinderDocumentInput>) => Promise<void>; onUpload: (id: string, files: File[]) => Promise<void>; onTrash: (id: string) => Promise<void> }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!menuOpen) return; const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); }; window.document.addEventListener("mousedown", close); window.document.addEventListener("keydown", escape); return () => { window.document.removeEventListener("mousedown", close); window.document.removeEventListener("keydown", escape); }; }, [menuOpen]);
  function openDetails() { if (!menuOpen) onOpenOcr(document); }
  return <tr className="document-table-row" onClick={openDetails} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails(); } }} role="link" tabIndex={0}><td className="document-name-cell"><span className="document-kind-icon"><Icon name="file-text" /></span><strong>{document.name}</strong></td><td data-label="Typ">{document.type || "—"}</td><td data-label="Tagi"><span className="document-tags">{document.tags.length ? document.tags.map((tag) => <i key={tag}>{tag}</i>) : "—"}</span></td><td data-label="Dodano">{formatDate(document.createdAt.slice(0, 10))}</td><td className="document-ocr-cell" data-label="OCR"><OcrStatusIcon status={document.ocrStatus} /></td><td className="document-actions-cell" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><div className="document-actions" ref={menuRef}><button aria-expanded={menuOpen} aria-haspopup="menu" className="document-actions-trigger" onClick={() => setMenuOpen((open) => !open)} title="Akcje dokumentu" type="button"><Icon label="Akcje dokumentu" name="dots" /></button>{menuOpen && <div className="document-actions-menu" role="menu"><button onClick={() => { setMenuOpen(false); onOpenOcr(document); }} role="menuitem" type="button">Szczegóły</button><label className="document-action-upload">Dodaj plik<input multiple onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; if (files.length) void onUpload(document.id, files).then(() => setMenuOpen(false)); }} type="file" /></label><button onClick={() => { setMenuOpen(false); setEditing(true); }} role="menuitem" type="button">Edytuj dane</button><button className="danger-action" onClick={() => { setMenuOpen(false); if (window.confirm("Przenieść dokument „" + document.name + "” do Kosza?")) void onTrash(document.id); }} role="menuitem" type="button">Usuń</button></div>}</div>{editing && <DocumentEditDialog document={document} onClose={() => setEditing(false)} onSave={onUpdate} />}</td></tr>;
}

function DocumentEditDialog({ document, onClose, onSave }: { document: BinderDocument; onClose: () => void; onSave: (id: string, input: Partial<CreateBinderDocumentInput>) => Promise<void> }) {
  const [name, setName] = useState(document.name); const [type, setType] = useState(document.type ?? ""); const [tags, setTags] = useState(document.tags.join(", ")); const [notes, setNotes] = useState(document.notes ?? ""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await onSave(document.id, { name, type, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), notes }); onClose(); } finally { setBusy(false); } }
  return <div className="dialog-backdrop" role="presentation"><form className="dialog document-edit-dialog" onSubmit={submit}><header><div><p className="eyebrow">Dokument</p><h2>Edytuj dane</h2></div><button className="icon-button" onClick={onClose} type="button"><Icon label="Zamknij" name="x" /></button></header><label>Nazwa<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Typ<input value={type} onChange={(event) => setType(event.target.value)} /></label><label>Tagi<input value={tags} onChange={(event) => setTags(event.target.value)} /></label><label>Notatka<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label><footer><button className="secondary" onClick={onClose} type="button">Anuluj</button><button className="primary" disabled={busy || !name.trim()} type="submit">{busy ? "Zapisywanie…" : "Zapisz zmiany"}</button></footer></form></div>;
}

function DocumentOcrPage({ document, onBack, onRun, onSave, onDeleteFile }: { document: BinderDocument; onBack: () => void; onRun: (id: string) => Promise<void>; onSave: (id: string, text: string) => Promise<void>; onDeleteFile: (documentId: string, fileId: string) => Promise<void> }) {
  const [details, setDetails] = useState<OcrDetails>({ status: (document.ocrStatus ?? "pending") as OcrStatus, text: "", error: null, updatedAt: null });
  const [text, setText] = useState(""); const [loading, setLoading] = useState(Boolean(document.ocrStatus)); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false); const [error, setError] = useState(""); const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  function applyDetails(next: OcrDetails) { setDetails(next); setText(next.text); setDirty(false); }
  async function load() { if (!document.ocrStatus) { applyDetails({ status: "pending", text: "", error: null, updatedAt: null }); setLoading(false); return; } setLoading(true); try { const response = await api.getDocumentOcr(document.id); applyDetails({ status: response.data.status as OcrStatus, text: response.data.text, error: response.data.error, updatedAt: response.data.updated_at }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się odczytać OCR."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [document.id]);
  async function run() { if ((dirty || text.trim()) && !window.confirm("Ponowne OCR zastąpi obecny tekst i ręczne poprawki. Kontynuować?")) return; setBusy(true); setError(""); setDetails((current) => ({ ...current, status: "processing" })); try { await onRun(document.id); const response = await api.getDocumentOcr(document.id); applyDetails({ status: response.data.status as OcrStatus, text: response.data.text, error: response.data.error, updatedAt: response.data.updated_at }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się wykonać OCR."); setDetails((current) => ({ ...current, status: "failed" })); } finally { setBusy(false); } }
  async function save() { setBusy(true); setError(""); try { await onSave(document.id, text); setDetails((current) => ({ ...current, status: "completed", text, error: null, updatedAt: new Date().toISOString() })); setDirty(false); } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się zapisać tekstu OCR."); } finally { setBusy(false); } }
  async function removeFile(file: BinderDocument["files"][number]) { if (!window.confirm("Usunąć plik „" + file.originalName + "”? Treść OCR dokumentu zostanie przeliczona.")) return; setDeletingFileId(file.id); setError(""); try { await onDeleteFile(document.id, file.id); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się usunąć załącznika."); } finally { setDeletingFileId(null); } }
  const meta = ocrStatusMeta(details.status);
  return <><button className="back" onClick={onBack} type="button"><Icon name="arrow-left" /> Wróć do dokumentów</button><div className="detail-heading ocr-detail-heading"><div><p className="eyebrow">Szczegóły dokumentu</p><h1>{document.name}</h1><p>{[document.type, document.files.length === 0 ? "Brak załączników" : document.files.length === 1 ? "1 załącznik" : document.files.length < 5 ? String(document.files.length) + " załączniki" : String(document.files.length) + " załączników"].filter(Boolean).join(" · ") || "Dokument bez załączników"}</p></div><span className={`ocr-detail-status ocr-status--${details.status}`}><Icon name={meta.icon} />OCR: {meta.label}</span></div><div className="ocr-detail-layout"><section className="panel ocr-editor-panel"><div className="panel-title"><div><p className="eyebrow">Rozpoznany tekst</p><h2>Treść dokumentu</h2></div><div className="ocr-detail-actions"><button className="secondary" disabled={busy || loading || !document.files.length} onClick={() => void run()} type="button">{busy && details.status === "processing" ? "Rozpoznawanie…" : details.status === "pending" ? "Uruchom OCR" : "Uruchom ponownie OCR"}</button><button className="primary" disabled={busy || loading || !dirty} onClick={() => void save()} type="button">Zapisz poprawki</button></div></div>{loading ? <div className="ocr-loading">Wczytywanie tekstu OCR…</div> : <textarea aria-label="Rozpoznany tekst OCR" className="ocr-text-editor" onChange={(event) => { setText(event.target.value); setDirty(true); }} placeholder="Po uruchomieniu OCR rozpoznany tekst pojawi się tutaj." value={text} />}{(error || details.error) && <p className="form-error">{error || details.error}</p>}{details.updatedAt && <p className="ocr-updated">Ostatnia aktualizacja: {new Date(details.updatedAt).toLocaleString("pl-PL")}</p>}</section><aside className="ocr-source-panel"><section className="panel"><p className="eyebrow">Dokument</p><h2>Informacje</h2><dl className="document-details-meta"><div><dt>Typ</dt><dd>{document.type || "—"}</dd></div><div><dt>Tagi</dt><dd>{document.tags.length ? document.tags.join(", ") : "—"}</dd></div><div><dt>Notatka</dt><dd>{document.notes || "—"}</dd></div></dl><div className="ocr-source-heading"><p className="eyebrow">Pliki źródłowe</p><h2>Załączniki</h2></div><div className="ocr-source-files">{document.files.map((file) => <div key={file.id}><span><Icon name="file-text" /></span><div><strong>{file.originalName}</strong><small>{file.mimeType}</small></div><div className="ocr-file-actions"><button className="text-action" onClick={() => void previewAttachment(file.id)} type="button">Podgląd</button><button className="text-action" onClick={() => void downloadAttachment(file.id, file.originalName)} type="button">Pobierz</button><button className="text-action danger-action ocr-file-delete" disabled={deletingFileId === file.id} onClick={() => void removeFile(file)} type="button">{deletingFileId === file.id ? "Usuwanie…" : "Usuń"}</button></div></div>)}{!document.files.length && <p className="subtle">Brak pliku źródłowego. Dodaj go z menu Akcje na liście dokumentów.</p>}</div></section></aside></div></>;
}

function TrashPage({ entries, onRestore, onEmpty }: { entries: TrashEntry[]; onRestore: (kind: TrashKind, id: string) => Promise<void>; onEmpty: () => Promise<void> }) {
  const [filter, setFilter] = useState<'all' | TrashKind>('all'); const visible = entries.filter((entry) => filter === 'all' || entry.kind === filter);
  const daysLeft = (value: string) => Math.max(0, 30 - Math.floor((Date.now() - new Date(value).valueOf()) / 86_400_000));
  return <><div className="page-heading"><div><p className="eyebrow">Usunięte elementy</p><h1>Kosz</h1><p>Przedmioty i dokumenty pozostają tutaj przez 30 dni, zanim zostaną usunięte trwale.</p></div>{entries.length > 0 && <button className="secondary danger-button" onClick={() => { if (window.confirm('Opróżnić cały Kosz? Tej operacji nie będzie można cofnąć.')) void onEmpty(); }} type="button">Opróżnij kosz</button>}</div><div className="collection-heading"><div><h2>Elementy w Koszu <em>{visible.length}</em></h2></div><div className="filters"><button className={`filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')} type="button">Wszystkie</button><button className={`filter ${filter === 'asset' ? 'active' : ''}`} onClick={() => setFilter('asset')} type="button">Przedmioty</button><button className={`filter ${filter === 'document' ? 'active' : ''}`} onClick={() => setFilter('document')} type="button">Dokumenty</button></div></div><div className="trash-list">{visible.map((entry) => <article className="trash-row" key={`${entry.kind}-${entry.id}`}><span className="inbox-file-icon"><Icon name={entry.kind === 'asset' ? 'package' : 'file-text'} /></span><div><strong>{entry.name}</strong><small>{entry.kind === 'asset' ? 'Przedmiot' : 'Dokument'}{entry.detail ? ` · ${entry.detail}` : ''}</small><p>Usunięto {formatDate(entry.deletedAt.slice(0, 10))} · pozostało {daysLeft(entry.deletedAt)} dni</p></div><button className="secondary" onClick={() => void onRestore(entry.kind, entry.id)} type="button">Przywróć</button></article>)}{visible.length === 0 && <div className="empty"><Icon name="trash" /><strong>Kosz jest pusty</strong><p>Usunięte przedmioty i dokumenty będą tu dostępne przez 30 dni.</p></div>}</div></>;
}

type TimelineEntry = ReminderEntry;

function daysFromToday(value: string): number {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${value}T12:00:00`).valueOf() - start.valueOf()) / 86_400_000);
}
function intervalLabel(plan: MaintenancePlan): string {
  if (plan.scheduleKind === 'one_off') return 'Jednorazowo';
  const names: Record<NonNullable<MaintenancePlan['intervalUnit']>, string> = { days: 'dni', weeks: 'tygodnie', months: 'miesiące', years: 'lata' };
  return `Co ${plan.intervalValue} ${plan.intervalUnit ? names[plan.intervalUnit] : ''}`;
}
function TimelinePage({ assets, filter, onFilter, onOpen, onComplete }: { assets: AssetSummary[]; filter: TimelineFilter; onFilter: (filter: TimelineFilter) => void; onOpen: (id: string) => Promise<void>; onComplete: (plan: MaintenancePlan) => void }) {
  const entries = useMemo(() => assets.flatMap((asset): TimelineEntry[] => {
    const warranty = asset.warranty;
    const warrantyEntry = warranty?.kind === 'fixed' && warranty.expiresOn ? [{ id: `warranty-${asset.id}`, dueOn: warranty.expiresOn, kind: 'warranty' as const, asset }] : [];
    const maintenanceEntries = (asset.maintenancePlans ?? []).filter((plan) => plan.status === 'active' && plan.nextDueOn && (!plan.lastCompletedOn || plan.nextDueOn <= new Date().toISOString().slice(0, 10))).map((plan) => ({ id: plan.id, dueOn: plan.nextDueOn!, kind: 'maintenance' as const, asset, plan }));
    return [...warrantyEntry, ...maintenanceEntries];
  }).sort((a, b) => a.dueOn.localeCompare(b.dueOn)), [assets]);
  const visible = entries.filter((entry) => filter === 'all' || entry.kind === filter);
  const overdue = visible.filter((entry) => daysFromToday(entry.dueOn) < 0).length;
  const soon = visible.filter((entry) => { const days = daysFromToday(entry.dueOn); return days >= 0 && days <= 30; }).length;
  const later = visible.length - overdue - soon;
  const groups: { key: 'overdue' | 'soon' | 'later'; label: string; entries: TimelineEntry[] }[] = [
    { key: 'overdue', label: 'Zaległe', entries: visible.filter((entry) => daysFromToday(entry.dueOn) < 0) },
    { key: 'soon', label: 'Najbliższe 30 dni', entries: visible.filter((entry) => { const days = daysFromToday(entry.dueOn); return days >= 0 && days <= 30; }) },
    { key: 'later', label: 'Później', entries: visible.filter((entry) => daysFromToday(entry.dueOn) > 30) },
  ];
  return <>
    <div className="page-heading"><div><p className="eyebrow">Planowanie domu</p><h1>Terminy</h1><p>Gwarancje i konserwacje w jednym, uporządkowanym miejscu.</p></div></div>
    <div className="timeline-stats"><div className={overdue ? 'timeline-stat alert' : 'timeline-stat'}><strong>{overdue}</strong><span>zaległe</span></div><div className="timeline-stat"><strong>{soon}</strong><span>w ciągu 30 dni</span></div><div className="timeline-stat"><strong>{later}</strong><span>później</span></div></div>
    <div className="collection-heading timeline-toolbar"><div><h2>Nadchodzące terminy <em>{visible.length}</em></h2><p>Oznaczenie konserwacji jako wykonanej od razu wyliczy jej kolejny termin.</p></div><div className="filters"><button className={`filter ${filter === 'all' ? 'active' : ''}`} type="button" onClick={() => onFilter('all')}>Wszystkie</button><button className={`filter ${filter === 'maintenance' ? 'active' : ''}`} type="button" onClick={() => onFilter('maintenance')}>Konserwacja</button><button className={`filter ${filter === 'warranty' ? 'active' : ''}`} type="button" onClick={() => onFilter('warranty')}>Gwarancje</button></div></div>
    {visible.length > 0 ? <div className="timeline-groups">{groups.filter((group) => group.entries.length > 0).map((group) => <section className={`timeline-group ${group.key}`} key={group.key} aria-labelledby={`timeline-group-${group.key}`}>
      <div className="timeline-group-heading"><span aria-hidden="true" /><strong id={`timeline-group-${group.key}`}>{group.label}</strong><small>{group.entries.length}</small></div>
      <div className="timeline-list">{group.entries.map((entry) => { const days = daysFromToday(entry.dueOn); const label = days < 0 ? `${Math.abs(days)} dni po terminie` : days === 0 ? 'Dzisiaj' : days === 1 ? 'Jutro' : `Za ${days} dni`; return <article className={`timeline-row ${days < 0 ? 'overdue' : days <= 30 ? 'soon' : ''}`} key={entry.id}><div className="date-tile"><strong>{new Date(`${entry.dueOn}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(new Date(`${entry.dueOn}T12:00:00`))}</span></div><span className="timeline-icon"><Icon name={entry.kind === 'maintenance' ? 'tool' : 'shield-check'} /></span><div className="timeline-copy"><small>{entry.kind === 'maintenance' ? `Konserwacja · ${entry.plan ? intervalLabel(entry.plan) : ''}` : 'Gwarancja producenta'}</small><strong>{entry.kind === 'maintenance' ? entry.plan?.title : 'Koniec gwarancji'} · {entry.asset.name}</strong><p>{label}</p></div>{entry.kind === 'maintenance' && entry.plan ? <button className="secondary" type="button" onClick={() => onComplete(entry.plan!)}>Wykonane</button> : <button className="text-action" type="button" onClick={() => void onOpen(entry.asset.id)}>Sprawdź</button>}</article>; })}</div>
    </section>)}</div> : <div className="timeline-empty"><div className="empty"><Icon name="calendar-event" /><strong>Brak terminów w tym widoku</strong><p>Dodaj gwarancję lub plan konserwacji do wybranego przedmiotu.</p></div></div>}
  </>;
}

function SearchPage({query,assets,documents,onOpenAsset,onOpenDocument}:{query:string;assets:AssetSummary[];documents:BinderDocument[];onOpenAsset:(id:string)=>Promise<void>;onOpenDocument:(document:BinderDocument)=>void}){return <><div className="page-heading"><div><p className="eyebrow">Wyniki wyszukiwania</p><h1>„{query}”</h1><p>Przedmioty oraz dokumenty — również dopasowania z OCR.</p></div></div><div className="search-results"><section><div className="section-heading"><h2>Przedmioty <em>{assets.length}</em></h2></div>{assets.map(asset=><button className="recent-row" key={asset.id} onClick={()=>void onOpenAsset(asset.id)} type="button"><span className="asset-icon"><Icon name="package"/></span><span><strong>{asset.name}</strong><small>{[asset.manufacturer,asset.modelNumber].filter(Boolean).join(' · ')||'Przedmiot'}</small></span></button>)}</section><section><div className="section-heading"><h2>Dokumenty <em>{documents.length}</em></h2></div>{documents.map(doc=><button className="recent-row" key={doc.id} onClick={() => onOpenDocument(doc)} type="button"><span className="asset-icon"><Icon name="file-text"/></span><span><strong>{doc.name}</strong><small>{doc.ocrTextPreview||[doc.type,...doc.tags].filter(Boolean).join(' · ')||'Dokument'}</small></span></button>)}</section>{!assets.length&&!documents.length&&<div className="empty"><Icon name="search"/><strong>Brak wyników</strong><p>Spróbuj innego słowa lub fragmentu tekstu.</p></div>}</div></>;}

function ItemsPage({ allAssets, assets, attention, isLoading, filter, onFilter, onCapture, onOpen }: { allAssets: AssetSummary[]; assets: AssetSummary[]; attention: AssetSummary[]; isLoading: boolean; filter: CollectionFilter; onFilter: (filter: CollectionFilter) => void; onCapture: () => void; onOpen: (id: string) => Promise<void> }) {
  const filterCounts = { all: allAssets.length, warranty: allAssets.filter((asset) => asset.warranty && asset.warranty.kind !== 'unknown').length, draft: allAssets.filter((asset) => asset.completeness !== 'complete').length };
  return <>
    <div className="page-heading"><div><p className="eyebrow">Kolekcja domowa</p><h1>Przedmioty</h1><p>Zapisuj teraz, uzupełniaj wtedy, kiedy masz chwilę.</p></div><button className="primary" type="button" onClick={onCapture}><Icon name="plus" /> Dodaj przedmiot</button></div>
    {attention.length > 0 && <div className="attention-row">{attention.map((asset) => <button className="attention" onClick={() => void onOpen(asset.id)} key={asset.id} type="button"><span><Icon name="shield-check" /></span><div><small>Gwarancja wymaga uwagi</small><strong>{asset.name}</strong></div><b>{warrantyLabel(asset).text}</b></button>)}</div>}
    <div className="collection-heading items-toolbar"><div className="filters"><button className={'filter ' + (filter === 'all' ? 'active' : '')} type="button" onClick={() => onFilter('all')}>Wszystkie <em>{filterCounts.all}</em></button><button className={'filter ' + (filter === 'warranty' ? 'active' : '')} type="button" onClick={() => onFilter('warranty')}>Gwarancje <em>{filterCounts.warranty}</em></button><button className={'filter ' + (filter === 'draft' ? 'active' : '')} type="button" onClick={() => onFilter('draft')}>Do uzupełnienia <em>{filterCounts.draft}</em></button></div></div>
    <div className="asset-table" aria-live="polite"><div className="table-head"><span aria-hidden="true" /><span>Przedmiot</span><span>Tagi</span><span>Status / gwarancja</span><span aria-hidden="true" /></div>{isLoading ? <div className="empty">Ładowanie kolekcji…</div> : assets.length === 0 ? <div className="empty"><Icon name="search" /><strong>Brak pasujących przedmiotów</strong><p>Spróbuj innego filtra albo nazwy, producenta, modelu lub numeru seryjnego.</p></div> : assets.map((asset) => <AssetRow asset={asset} key={asset.id} onOpen={onOpen} />)}</div>
  </>;
}

function AssetRow({ asset, onOpen }: { asset: AssetSummary; onOpen: (id: string) => Promise<void> }) {
  const warranty = warrantyLabel(asset);
  return <button className="asset-row" type="button" onClick={() => void onOpen(asset.id)}>
    <span className="asset-icon"><Icon name="package" /></span>
    <span className="asset-name"><strong>{asset.name}</strong><small>{[asset.manufacturer, asset.modelNumber].filter(Boolean).join(' · ') || 'Szkic — uzupełnij dane'}</small></span>
    <span className="tags">{asset.tags.slice(0, 2).map((tag) => <i key={tag}>{tag}</i>)}</span>
    <span className={`warranty ${warranty.state}`}><b />{warranty.text}</span>
    <span className="more" aria-hidden="true"><Icon name="dots" /></span>
  </button>;
}

function CompletionDialog({ plan, onClose, onSave }: { plan: MaintenancePlan; onClose: () => void; onSave: (input: { performedOn?: string; notes?: string }) => void }) {
  const [performedOn, setPerformedOn] = useState(new Date().toISOString().slice(0, 10)); const [notes, setNotes] = useState('');
  return <div className="dialog-backdrop" role="presentation"><form className="dialog completion-dialog" onSubmit={(event) => { event.preventDefault(); onSave(notes.trim() ? { performedOn, notes: notes.trim() } : { performedOn }); }}><header><div><p className="eyebrow">Konserwacja</p><h2>Oznacz jako wykonane</h2></div><button type="button" className="icon-button" onClick={onClose}><Icon name="x" label="Zamknij" /></button></header><p className="dialog-intro">Zapis trafi do historii czynności dla „{plan.title}”.</p><label>Data wykonania<input value={performedOn} onChange={(event) => setPerformedOn(event.target.value)} required type="date" /></label><label>Notatka <small>opcjonalnie</small><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="np. użyty filtr, koszt lub dodatkowa informacja" rows={3} /></label><footer><button className="secondary" type="button" onClick={onClose}>Anuluj</button><button className="primary" type="submit">Zapisz wykonanie</button></footer></form></div>;
}

function QuickAddDialog({ onClose, onSave }: { onClose: () => void; onSave: (kind: 'asset' | 'document', input: CreateAssetInput | CreateBinderDocumentInput, files: File[]) => Promise<void> }) {
  const [kind, setKind] = useState<'asset' | 'document'>('asset'); const [name, setName] = useState(''); const [manufacturer, setManufacturer] = useState(''); const [modelNumber, setModelNumber] = useState(''); const [type, setType] = useState(''); const [tags, setTags] = useState(''); const [notes, setNotes] = useState(''); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  function selectFiles(list: FileList | null) { const selectedFiles = Array.from(list ?? []); if (selectedFiles.length) setFiles((current) => [...current, ...selectedFiles]); }
  async function submit(event: FormEvent) { event.preventDefault(); if (!name.trim()) return; setBusy(true); setError(null); try { const parsedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean); await onSave(kind, kind === 'asset' ? { name: name.trim(), manufacturer, modelNumber, tags: parsedTags } : { name: name.trim(), type, tags: parsedTags, notes }, files); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać.'); } finally { setBusy(false); } }
  return <div className="dialog-backdrop quick-add-backdrop" role="presentation"><form className="dialog quick-add-dialog" onSubmit={submit}><header><div><p className="eyebrow">Szybki zapis</p><h2>Co chcesz dodać?</h2></div><button type="button" className="icon-button" onClick={onClose}><Icon name="x" label="Zamknij" /></button></header><div className="quick-kind-tabs"><button className={kind === 'asset' ? 'active' : ''} onClick={() => setKind('asset')} type="button"><Icon name="package" />Przedmiot</button><button className={kind === 'document' ? 'active' : ''} onClick={() => setKind('document')} type="button"><Icon name="file-text" />Dokument</button></div><label>Nazwa {kind === 'asset' ? 'przedmiotu' : 'dokumentu'}<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'asset' ? 'np. Ekspres do kawy' : 'np. Faktura za usługę'} /></label><div className="quick-file-actions"><label className="secondary inbox-upload">Zrób zdjęcie<input accept="image/*" capture="environment" onChange={(event) => { selectFiles(event.currentTarget.files); event.currentTarget.value = ''; }} type="file" /></label><label className="secondary inbox-upload">Wybierz plik<input multiple accept="image/*,.pdf,.txt,.doc,.docx" onChange={(event) => { selectFiles(event.currentTarget.files); event.currentTarget.value = ''; }} type="file" /></label></div>{files.length > 0 && <p className="quick-files-selected">Wybrano pliki: {files.map((file) => file.name).join(', ')}</p>}{kind === 'asset' ? <div className="form-grid quick-asset-fields"><label>Producent<input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></label><label>Model<input value={modelNumber} onChange={(event) => setModelNumber(event.target.value)} /></label></div> : <><label>Typ dokumentu<input value={type} onChange={(event) => setType(event.target.value)} placeholder="np. faktura, umowa" /></label><label>Notatka <small>opcjonalnie</small><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></label></>}<label>Tagi <small>oddziel przecinkami</small><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="np. kuchnia, usługi" /></label>{error && <p className="form-error">{error}</p>}<footer><button className="secondary" onClick={onClose} type="button">Anuluj</button><button className="primary" disabled={busy || !name.trim()} type="submit">{busy ? 'Zapisywanie…' : kind === 'asset' ? 'Dodaj przedmiot' : 'Dodaj dokument'}</button></footer></form></div>;
}


function MaintenancePlanDialog({ plan, onClose, onSave }: { plan: MaintenancePlan; onClose: () => void; onSave: (input: Pick<MaintenancePlan, "title" | "scheduleKind" | "intervalValue" | "intervalUnit" | "nextDueOn" | "notes">) => Promise<void> }) {
  const [title, setTitle] = useState(plan.title); const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(plan.scheduleKind); const [intervalValue, setIntervalValue] = useState(String(plan.intervalValue ?? 1)); const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(plan.intervalUnit ?? "months"); const [nextDueOn, setNextDueOn] = useState(plan.nextDueOn ?? ""); const [notes, setNotes] = useState(plan.notes ?? ""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { await onSave({ title: title.trim(), scheduleKind, intervalValue: scheduleKind === "recurring" ? Math.max(1, Number(intervalValue) || 1) : null, intervalUnit: scheduleKind === "recurring" ? intervalUnit : null, nextDueOn: nextDueOn || null, notes: notes.trim() || null }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się zapisać zmian."); setBusy(false); } }
  return <div className="dialog-backdrop" role="presentation"><form aria-label="Edycja planu konserwacji" className="dialog maintenance-edit-dialog" onSubmit={submit}><header><div><p className="eyebrow">Konserwacja</p><h2>Edytuj plan</h2></div><button className="icon-button" onClick={onClose} type="button"><Icon label="Zamknij" name="x" /></button></header><label>Nazwa czynności<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="form-grid"><label>Typ terminu<select value={scheduleKind} onChange={(event) => setScheduleKind(event.target.value as ScheduleKind)}><option value="recurring">Cyklicznie</option><option value="one_off">Konkretna data</option></select></label><label>Następny termin<input value={nextDueOn} onChange={(event) => setNextDueOn(event.target.value)} type="date" /></label>{scheduleKind === "recurring" && <><label>Co ile<input min="1" required value={intervalValue} onChange={(event) => setIntervalValue(event.target.value)} type="number" /></label><label>Jednostka<select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value as IntervalUnit)}><option value="days">Dni</option><option value="weeks">Tygodnie</option><option value="months">Miesiące</option><option value="years">Lata</option></select></label></>}</div><label>Notatka <small>opcjonalnie</small><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>{error && <p className="form-error">{error}</p>}<footer><button className="secondary" onClick={onClose} type="button">Anuluj</button><button className="primary" disabled={busy || !title.trim()} type="submit">{busy ? "Zapisywanie…" : "Zapisz zmiany"}</button></footer></form></div>;
}

function Detail({ asset, onBack, onDirtyChange, onTrash, onUpdate, onWarranty, onPlan, onUpdatePlan, onDeletePlan, onUpload, onDeleteFile, onComplete }: { asset: AssetSummary; onBack: () => void; onDirtyChange: (dirty: boolean) => void; onTrash: (id: string) => Promise<void>; onUpdate: (id: string, input: Partial<CreateAssetInput>) => Promise<void>; onWarranty: (id: string, kind: WarrantyKind, scope: string, expiresOn: string) => Promise<void>; onPlan: (id: string, input: Pick<MaintenancePlan, "title" | "scheduleKind" | "intervalValue" | "intervalUnit" | "nextDueOn" | "notes">) => Promise<void>; onUpdatePlan: (id: string, input: Pick<MaintenancePlan, "title" | "scheduleKind" | "intervalValue" | "intervalUnit" | "nextDueOn" | "notes">) => Promise<void>; onDeletePlan: (id: string) => Promise<void>; onUpload: (id: string, files: File[], kind: AssetFileKind) => Promise<void>; onDeleteFile: (assetId: string, fileId: string) => Promise<void>; onComplete: (plan: MaintenancePlan) => void }) {
  const [name, setName] = useState(asset.name); const [manufacturer, setManufacturer] = useState(asset.manufacturer ?? ''); const [model, setModel] = useState(asset.modelNumber ?? '');
  const [serialNumber, setSerialNumber] = useState(asset.serialNumber ?? ''); const [purchaseDate, setPurchaseDate] = useState(asset.purchaseDate ?? ''); const [quantity, setQuantity] = useState(String(asset.quantity));
  const [price, setPrice] = useState(asset.priceMinor === null ? '' : (asset.priceMinor / 100).toFixed(2)); const [currency, setCurrency] = useState(asset.currency ?? 'PLN'); const [externalUrl, setExternalUrl] = useState(asset.externalUrl ?? '');
  const [tags, setTags] = useState(asset.tags.join(', ')); const [notes, setNotes] = useState(asset.notes ?? '');
  const [kind, setKind] = useState<WarrantyKind>(asset.warranty?.kind ?? 'unknown'); const [scope, setScope] = useState(asset.warranty?.scope ?? ''); const [expiresOn, setExpiresOn] = useState(asset.warranty?.expiresOn ?? '');
  const [warrantyDateIsAutomatic, setWarrantyDateIsAutomatic] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null); const [planTitle, setPlanTitle] = useState(''); const [planDue, setPlanDue] = useState(''); const [planKind, setPlanKind] = useState<ScheduleKind>('recurring'); const [planInterval, setPlanInterval] = useState('3'); const [planUnit, setPlanUnit] = useState<IntervalUnit>('months'); const [planNotes, setPlanNotes] = useState(''); const [fileKind, setFileKind] = useState<AssetFileKind>('receipt');
  const warranty = warrantyLabel(asset);
  const saveDetails = () => void onUpdate(asset.id, { name, manufacturer, modelNumber: model, serialNumber, purchaseDate, quantity: Math.max(1, Number(quantity) || 1), priceMinor: price.trim() ? Math.round(Number(price.replace(',', '.')) * 100) : null, currency, externalUrl, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean), notes });
  const formTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  const formPriceMinor = price.trim() ? Math.round(Number(price.replace(',', '.')) * 100) : null;
  const detailsDirty =
    name.trim() !== asset.name ||
    manufacturer.trim() !== (asset.manufacturer ?? '') ||
    model.trim() !== (asset.modelNumber ?? '') ||
    serialNumber.trim() !== (asset.serialNumber ?? '') ||
    purchaseDate !== (asset.purchaseDate ?? '') ||
    Math.max(1, Number(quantity) || 1) !== asset.quantity ||
    formPriceMinor !== asset.priceMinor ||
    currency.trim() !== (asset.currency ?? 'PLN') ||
    externalUrl.trim() !== (asset.externalUrl ?? '') ||
    JSON.stringify(formTags) !== JSON.stringify(asset.tags) ||
    notes.trim() !== (asset.notes ?? '');
  const storedWarrantyKind = asset.warranty?.kind ?? 'unknown';
  const warrantyDirty =
    kind !== storedWarrantyKind ||
    scope.trim() !== (asset.warranty?.scope ?? '') ||
    (kind === 'fixed' && expiresOn !== (asset.warranty?.expiresOn ?? ''));
  const hasUnsavedChanges = detailsDirty || warrantyDirty;

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
    return () => onDirtyChange(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  function changePurchaseDate(value: string) {
    setPurchaseDate(value);
    if (!value && warrantyDateIsAutomatic) {
      setKind('unknown');
      setExpiresOn('');
      setWarrantyDateIsAutomatic(false);
    } else if (value && (kind === 'unknown' || (kind === 'fixed' && (!expiresOn || warrantyDateIsAutomatic)))) {
      setKind('fixed');
      setExpiresOn(addYearsToDate(value, 2));
      setWarrantyDateIsAutomatic(true);
    }
  }

  function changeWarrantyKind(next: WarrantyKind) {
    setKind(next);
    if (next === 'fixed' && purchaseDate && !expiresOn) {
      setExpiresOn(addYearsToDate(purchaseDate, 2));
      setWarrantyDateIsAutomatic(true);
    } else if (next !== 'fixed') {
      setWarrantyDateIsAutomatic(false);
    }
  }
  return <>
    <button className="back" type="button" onClick={onBack}><Icon name="arrow-left" /> Wróć do przedmiotów</button>
    <div className="detail-heading"><div><p className="eyebrow">{[asset.manufacturer, asset.modelNumber].filter(Boolean).join(' · ') || 'Przedmiot bez pełnych danych'}</p><h1>{asset.name}</h1><p>Dodano {formatDate(asset.createdAt.slice(0, 10))}. {asset.completeness === 'draft' ? 'To szkic — możesz go uzupełnić.' : 'Dane są gotowe do użycia.'}</p></div><div className="detail-heading-actions"><span className={`detail-status ${warranty.state}`}>{warranty.text}</span><button className="text-action danger-action" onClick={() => { if (window.confirm(`Przenieść przedmiot „${asset.name}” do Kosza?`)) void onTrash(asset.id); }} type="button">Usuń</button></div></div>
    <div className="detail-layout"><div className="detail-main">
      <section className="panel"><header className="panel-title"><div><p className="eyebrow">Dane przedmiotu</p><h2>Informacje</h2></div><button className="text-action" onClick={saveDetails} type="button">Zapisz zmiany</button></header><div className="field-grid">
        <label>Nazwa<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Producent<input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} /></label><label>Model<input value={model} onChange={(e) => setModel(e.target.value)} /></label><label>Numer seryjny<input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></label><label>Data zakupu<input value={purchaseDate} onChange={(e) => changePurchaseDate(e.target.value)} type="date" /></label><label>Ilość<input min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" /></label><label>Cena<input min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} type="number" /></label><label>Waluta<input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="PLN" /></label><label className="span-all">Link<input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" type="url" /></label><label className="span-all">Tagi <small>oddziel przecinkami</small><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Kuchnia, AGD" /></label><label className="span-all">Notatki<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Co warto pamiętać?" rows={3} /></label>
      </div></section>
      <section className="panel"><header className="panel-title"><div><p className="eyebrow">Pliki</p><h2>Dokumentacja</h2></div><label className="text-action upload-trigger">Dodaj plik<input type="file" multiple onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; if (files.length) void onUpload(asset.id, files, fileKind); }} /></label></header><div className="file-toolbar"><label>Typ pliku<select value={fileKind} onChange={(event) => setFileKind(event.target.value as AssetFileKind)}><option value="receipt">Paragon</option><option value="manual">Instrukcja</option><option value="photo">Zdjęcie</option><option value="other">Inne</option></select></label><small>Do 25 MB na plik</small></div>{asset.files?.length ? <div className="file-list">{asset.files.map((file) => <div className="file-row" key={file.id}><Icon name={file.kind === 'receipt' ? 'receipt' : 'file-text'} /><button className="file-download" onClick={()=>void downloadAttachment(file.id,file.originalName)} type="button"><strong>{file.originalName}</strong><small>{file.kind} · {(file.byteSize / 1024 / 1024).toFixed(1)} MB</small></button><button aria-label={"Usuń " + file.originalName} className="text-action danger-action file-delete" onClick={() => { if (window.confirm("Usunąć plik „" + file.originalName + "”?")) void onDeleteFile(asset.id, file.id); }} type="button">Usuń</button></div>)}</div> : <div className="file-placeholder"><Icon name="receipt" /><div><strong>Paragon, instrukcja i zdjęcia</strong><p>Dodaj je z komputera lub telefonu — Boberit przypisze je do tego przedmiotu.</p></div></div>}</section>
      <section className="panel"><header className="panel-title"><div><p className="eyebrow">Czynności</p><h2>Konserwacja</h2></div></header><div className="plan-list">{asset.maintenancePlans?.length ? asset.maintenancePlans.map((plan) => <div className="plan" key={plan.id}><span><Icon name="tool" /></span><div><strong>{plan.title}</strong><small>{plan.status === 'completed' ? 'Czynność zakończona' : `${plan.scheduleKind === 'recurring' ? `Co ${plan.intervalValue} ${plan.intervalUnit} · ` : ''}następny termin: ${formatDate(plan.nextDueOn)}`}</small></div><div className="plan-actions"><button className="text-action" onClick={() => setEditingPlan(plan)} type="button">Edytuj</button>{plan.status === 'active' ? <button className="secondary" type="button" onClick={() => onComplete(plan)}>Wykonane</button> : <span className="plan-completed">Wykonane</span>}<button aria-label={"Usuń plan " + plan.title} className="text-action danger-action" onClick={() => { if (window.confirm("Usunąć plan „" + plan.title + "” wraz z historią wykonań?")) void onDeletePlan(plan.id); }} type="button">Usuń</button></div></div>) : <p className="subtle">Brak planów konserwacji.</p>}</div><div className="maintenance-history"><p className="eyebrow">Historia</p><h3>Wykonane czynności</h3>{asset.maintenanceRecords?.length ? <div className="history-list">{asset.maintenanceRecords.map((record: MaintenanceRecord) => <div className="history-row" key={record.id}><span><Icon name="tool" /></span><div><strong>{record.planTitle}</strong><small>Wykonano {formatDate(record.performedOn)}{record.dueOn ? ` · termin: ${formatDate(record.dueOn)}` : ''}</small>{record.notes && <p>{record.notes}</p>}</div></div>)}</div> : <p className="subtle">Jeszcze nie zapisano wykonanych czynności.</p>}</div><form className="plan-form" onSubmit={(e) => { e.preventDefault(); if (planTitle && planDue) { void onPlan(asset.id, { title: planTitle, scheduleKind: planKind, intervalValue: planKind === 'recurring' ? Math.max(1, Number(planInterval) || 1) : null, intervalUnit: planKind === 'recurring' ? planUnit : null, nextDueOn: planDue, notes: planNotes || null }); setPlanTitle(''); setPlanDue(''); setPlanNotes(''); } }}><div className="plan-form-grid"><label>Nazwa czynności<input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="np. Wymiana filtra" required /></label><label>Typ terminu<select value={planKind} onChange={(e) => setPlanKind(e.target.value as ScheduleKind)}><option value="recurring">Cyklicznie</option><option value="one_off">Konkretna data</option></select></label><label>Następny termin<input value={planDue} onChange={(e) => setPlanDue(e.target.value)} type="date" required /></label>{planKind === 'recurring' && <><label>Co ile<input min="1" value={planInterval} onChange={(e) => setPlanInterval(e.target.value)} type="number" required /></label><label>Jednostka<select value={planUnit} onChange={(e) => setPlanUnit(e.target.value as IntervalUnit)}><option value="days">Dni</option><option value="weeks">Tygodnie</option><option value="months">Miesiące</option><option value="years">Lata</option></select></label></>}<label className="span-all">Notatka <small>opcjonalnie</small><input value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="np. filtr HEPA, numer części" /></label></div><button className="secondary plan-submit" type="submit">Dodaj plan</button></form></section>
    </div><aside className="detail-aside"><section className="warranty-card"><Icon name="shield-check" /><p className="eyebrow">Gwarancja</p><h2>{warranty.text}</h2><p>Ustaw zakres i datę, aby Boberit mógł przypomnieć o końcu ochrony.</p><select value={kind} onChange={(e) => changeWarrantyKind(e.target.value as WarrantyKind)}><option value="unknown">Brak danych</option><option value="fixed">Z określoną datą</option><option value="lifetime">Dożywotnia</option></select><input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Zakres gwarancji" />{kind === 'fixed' && <input value={expiresOn} onChange={(e) => { setExpiresOn(e.target.value); setWarrantyDateIsAutomatic(false); }} type="date" required />}<button className="secondary bright" onClick={() => void onWarranty(asset.id, kind, scope, expiresOn)} type="button">Zapisz gwarancję</button></section><section className="notes-card"><p className="eyebrow">Notatka</p><h2>Co warto pamiętać?</h2><p>{asset.notes ?? 'Nie dodano notatki.'}</p></section></aside></div>
    {editingPlan && <MaintenancePlanDialog plan={editingPlan} onClose={() => setEditingPlan(null)} onSave={async (input) => { await onUpdatePlan(editingPlan.id, input); setEditingPlan(null); }} />}
  </>;
}
