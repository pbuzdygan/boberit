import type { AssetOption, AssetOptionKind, DocumentType } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { ChipDictionary } from '../components/ChipDictionary';
import { SettingsHeader } from '../components/SettingsBlock';

/** Lets the collection views reload names after a rename or removal. */
const dictionariesChanged = () => window.dispatchEvent(new Event('boberit-data-dictionaries-changed'));

/** Categories and locations of items, and types of documents, in the active household. */
export function DataSettings({ canManage }: { canManage: boolean }) {
  const [options, setOptions] = useState<AssetOption[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [error, setError] = useState('');
  async function load() {
    try {
      const [optionResponse, typeResponse] = await Promise.all([api.listAssetOptions(), api.listDocumentTypes()]);
      setOptions(optionResponse.data);
      setTypes(typeResponse.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się wczytać kategorii i typów.');
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function optionDictionary(kind: AssetOptionKind) {
    const isCategory = kind === 'category';
    return (
      <ChipDictionary
        addLabel={isCategory ? 'Dodaj kategorię' : 'Dodaj lokalizację'}
        canManage={canManage}
        description={
          isCategory
            ? 'Grupują przedmioty, np. AGD, Elektronika, Narzędzia.'
            : 'Mówią, gdzie przedmiot jest w domu, np. Kuchnia, Garaż.'
        }
        emptyText={isCategory ? 'Nie ma jeszcze kategorii.' : 'Nie ma jeszcze lokalizacji.'}
        entries={options.filter((option) => option.kind === kind)}
        onAdd={async (name) => {
          await api.createAssetOption(kind, name);
          await load();
        }}
        onRemove={async (entry) => {
          if (!window.confirm(`Usunąć „${entry.name}”? Pole zostanie wyczyszczone w powiązanych przedmiotach.`)) return;
          await api.deleteAssetOption(entry.id);
          await load();
          dictionariesChanged();
        }}
        onRename={async (id, name) => {
          await api.updateAssetOption(id, name);
          await load();
          dictionariesChanged();
        }}
        placeholder={isCategory ? 'np. Elektronika' : 'np. Garaż'}
        title={isCategory ? 'Kategorie przedmiotów' : 'Lokalizacje przedmiotów'}
      />
    );
  }

  return (
    <>
      <SettingsHeader
        description={
          canManage
            ? 'Listy do wyboru przy przedmiotach i dokumentach. Kliknij ołówek, aby zmienić nazwę.'
            : 'Listy do wyboru przy przedmiotach i dokumentach. Zmienia je właściciel gospodarstwa.'
        }
        title="Kategorie i typy"
      />
      {error && <p className="form-error">{error}</p>}
      {optionDictionary('category')}
      {optionDictionary('location')}
      <ChipDictionary
        addLabel="Dodaj typ dokumentu"
        canManage={canManage}
        description="Rodzaje dokumentów, np. Umowa, Faktura, Polisa."
        emptyText="Nie ma jeszcze typów dokumentów."
        entries={types}
        onAdd={async (name) => {
          await api.createDocumentType(name);
          await load();
          dictionariesChanged();
        }}
        onRemove={async (entry) => {
          if (!window.confirm(`Usunąć typ „${entry.name}”? Typ zostanie wyczyszczony w powiązanych dokumentach.`))
            return;
          await api.deleteDocumentType(entry.id);
          await load();
          dictionariesChanged();
        }}
        onRename={async (id, name) => {
          await api.updateDocumentType(id, name);
          await load();
          dictionariesChanged();
        }}
        placeholder="np. Gwarancja"
        title="Typy dokumentów"
      />
    </>
  );
}
