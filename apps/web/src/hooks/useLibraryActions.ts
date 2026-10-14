import type {
  AssetFileKind,
  CreateAssetInput,
  CreateBinderDocumentInput,
  MaintenancePlan,
  TrashKind,
  WarrantyKind,
} from '@boberit/shared';
import { api } from '../api';
import { batchOcrMessage } from '../labels';
import type { useCollections } from './useCollections';
import type { NavigationState } from './useNavigation';
import type { SearchState } from './useSearch';

/**
 * Changes to household data triggered from the views. Each action calls the API, reloads the
 * affected data, and reports the outcome as a toast; API errors propagate to the caller.
 */
export function useLibraryActions({
  collections,
  navigation,
  search,
  setMessage,
  closeQuickAdd,
  closeCompletion,
}: {
  collections: ReturnType<typeof useCollections>;
  navigation: NavigationState;
  search: SearchState;
  setMessage: (message: string | null) => void;
  closeQuickAdd: () => void;
  closeCompletion: () => void;
}) {
  async function quickAdd(
    kind: 'asset' | 'document',
    input: CreateAssetInput | CreateBinderDocumentInput,
    files: File[],
  ) {
    if (kind === 'asset') {
      const created = await api.createAsset(input as CreateAssetInput);
      for (const file of files) await api.uploadFile(created.data.id, file, 'other', true);
      await collections.refresh();
      await navigation.openDetail(created.data.id);
      setMessage(files.length ? 'Przedmiot i zdjęcia zostały zapisane.' : 'Przedmiot został zapisany.');
    } else {
      const created = await api.createDocument(input as CreateBinderDocumentInput);
      for (const file of files) await api.uploadDocumentFile(created.data.id, file);
      if (files.length) await api.runDocumentOcr(created.data.id);
      await collections.refresh();
      navigation.navigateTo('binder');
      setMessage(files.length ? 'Dokument i pliki trafiły do Dokumentów.' : 'Dokument trafił do Dokumentów.');
    }
    closeQuickAdd();
  }
  async function update(id: string, input: Partial<CreateAssetInput>) {
    const response = await api.updateAsset(id, input);
    navigation.setSelected(response.data);
    setMessage('Dane przedmiotu zapisano.');
    await collections.refresh();
  }
  async function saveWarranty(id: string, kind: WarrantyKind, scope: string, expiresOn: string) {
    const response = await api.saveWarranty(id, {
      kind,
      scope: scope || null,
      expiresOn: kind === 'fixed' ? expiresOn : null,
    });
    navigation.setSelected((current) => (current?.id === id ? { ...current, warranty: response.data } : current));
    setMessage('Gwarancję zapisano.');
    await collections.refresh();
  }
  async function addPlan(
    id: string,
    input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>,
  ) {
    await api.createPlan(id, input);
    navigation.setSelected((await api.getAsset(id)).data);
    await collections.refresh();
    setMessage('Plan czynności został dodany.');
  }
  async function removeAssetFile(assetId: string, fileId: string) {
    await api.deleteAssetFile(assetId, fileId);
    navigation.setSelected((await api.getAsset(assetId)).data);
    await collections.refresh();
    setMessage('Załącznik przedmiotu został usunięty.');
  }
  async function classifyFile(assetId: string, fileId: string, kind: AssetFileKind) {
    await api.classifyAssetFile(assetId, fileId, kind);
    navigation.setSelected((await api.getAsset(assetId)).data);
    await collections.refresh();
    setMessage('Typ pliku został zapisany.');
  }
  async function updatePlan(
    id: string,
    input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>,
  ) {
    await api.updatePlan(id, input);
    if (navigation.selected) navigation.setSelected((await api.getAsset(navigation.selected.id)).data);
    await collections.refresh();
    setMessage('Plan konserwacji został zaktualizowany.');
  }
  async function removePlan(id: string) {
    await api.deletePlan(id);
    if (navigation.selected) navigation.setSelected((await api.getAsset(navigation.selected.id)).data);
    await collections.refresh();
    setMessage('Plan konserwacji i jego historia zostały usunięte.');
  }
  async function uploadFiles(id: string, files: File[], kind: AssetFileKind) {
    for (const file of files) await api.uploadFile(id, file, kind);
    navigation.setSelected((await api.getAsset(id)).data);
    setMessage(files.length === 1 ? 'Plik został dodany.' : `Dodano ${files.length} pliki.`);
  }
  async function uploadInboxFiles(files: File[]) {
    for (const file of files) await api.uploadInboxFile(file);
    await collections.refresh();
    setMessage(
      files.length === 1 ? 'Plik trafił do sekcji Do przypisania.' : `Do przypisania dodano ${files.length} pliki.`,
    );
  }
  async function assignInbox(id: string, assetId: string, kind: AssetFileKind) {
    await api.assignInboxFile(id, assetId, kind);
    await collections.refresh();
    setMessage('Plik przypisano do przedmiotu.');
  }
  async function inboxToDocument(id: string, input: CreateBinderDocumentInput) {
    await api.inboxToDocument(id, input);
    await collections.refresh();
    setMessage('Utworzono dokument w Dokumentach.');
  }
  async function updateDocument(id: string, input: Partial<CreateBinderDocumentInput>) {
    await api.updateDocument(id, input);
    await collections.refresh();
    setMessage('Zmiany dokumentu zapisano.');
  }
  async function runOcr(id: string) {
    await api.runDocumentOcr(id);
    await collections.refresh();
    setMessage('Rozpoznano tekst dokumentu.');
  }
  async function batchOcr() {
    const result = await api.batchDocumentOcr();
    await collections.refresh();
    setMessage(batchOcrMessage(result.data));
  }
  async function saveOcr(id: string, text: string) {
    await api.saveDocumentOcr(id, text);
    await collections.refresh();
    setMessage('Tekst OCR zapisano i zaindeksowano.');
  }
  async function uploadDocumentFiles(id: string, files: File[]) {
    for (const file of files) await api.uploadDocumentFile(id, file);
    if (files.length) await api.runDocumentOcr(id);
    await collections.refresh();
    setMessage(files.length === 1 ? 'Plik dodano do dokumentu.' : `Dodano ${files.length} pliki do dokumentu.`);
  }
  async function removeDocumentFile(documentId: string, fileId: string) {
    await api.deleteDocumentFile(documentId, fileId);
    await collections.refresh();
    setMessage('Załącznik usunięto, a treść OCR zaktualizowano.');
  }
  async function deleteInboxFile(id: string) {
    await api.deleteInboxFile(id);
    await collections.refresh();
    setMessage('Plik usunięto z listy Do przypisania.');
  }
  async function trashAsset(id: string) {
    await api.trashAsset(id);
    navigation.setSelected(null);
    search.clearSearch();
    await collections.refresh();
    navigation.setView('items');
    setMessage('Przedmiot przeniesiono do Kosza na 30 dni.');
  }
  async function trashDocument(id: string) {
    await api.trashDocument(id);
    await collections.refresh();
    setMessage('Dokument przeniesiono do Kosza na 30 dni.');
  }
  async function restoreTrash(kind: TrashKind, id: string) {
    await api.restoreTrash(kind, id);
    await collections.refresh();
    setMessage('Element przywrócono.');
  }
  async function emptyTrash() {
    await api.emptyTrash();
    await collections.refresh();
    setMessage('Kosz został opróżniony trwale.');
  }
  async function completePlan(id: string, input: { performedOn?: string; notes?: string }) {
    await api.completePlan(id, input);
    closeCompletion();
    await collections.refresh();
    setMessage('Wykonanie zapisano w historii, a kolejny termin wyliczono.');
  }

  return {
    quickAdd,
    update,
    saveWarranty,
    addPlan,
    removeAssetFile,
    classifyFile,
    updatePlan,
    removePlan,
    uploadFiles,
    uploadInboxFiles,
    assignInbox,
    inboxToDocument,
    updateDocument,
    runOcr,
    batchOcr,
    saveOcr,
    uploadDocumentFiles,
    removeDocumentFile,
    deleteInboxFile,
    trashAsset,
    trashDocument,
    restoreTrash,
    emptyTrash,
    completePlan,
  };
}
