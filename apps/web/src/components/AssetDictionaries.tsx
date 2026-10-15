import type { AssetOption, AssetOptionKind, DocumentType } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from './Icon';

export function AssetDictionaries({ canManage, householdName }: { canManage: boolean; householdName: string }) {
  const [options, setOptions] = useState<AssetOption[]>([]);
  const [names, setNames] = useState<Record<AssetOptionKind, string>>({ category: '', location: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    void api
      .listAssetOptions()
      .then((r) => setOptions(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się odczytać słowników.'));
  useEffect(load, []);
  async function add(kind: AssetOptionKind) {
    const name = names[kind].trim();
    if (!name) return;
    try {
      setError('');
      await api.createAssetOption(kind, name);
      setNames((current) => ({ ...current, [kind]: '' }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się dodać pozycji.');
    }
  }
  async function save(id: string) {
    if (!editingName.trim()) return;
    try {
      setError('');
      await api.updateAssetOption(id, editingName);
      setEditing(null);
      load();
      window.dispatchEvent(new Event('boberit-data-dictionaries-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zmienić pozycji.');
    }
  }
  async function remove(option: AssetOption) {
    if (!window.confirm(`Usunąć „${option.name}”? Pole zostanie wyczyszczone w powiązanych przedmiotach.`)) return;
    try {
      setError('');
      await api.deleteAssetOption(option.id);
      load();
      window.dispatchEvent(new Event('boberit-data-dictionaries-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć pozycji.');
    }
  }
  return (
    <section className="settings-card asset-dictionaries">
      <span>
        <Icon name="list" />
      </span>
      <div>
        <p className="eyebrow">Aktywne gospodarstwo · {householdName}</p>
        <h2>Słowniki danych</h2>
        <section className="dictionary-domain">
          <div className="dictionary-domain-title">
            <strong>Przedmioty</strong>
            <small>Kategorie i lokalizacje używane wyłącznie przez przedmioty.</small>
          </div>
          {(['category', 'location'] as AssetOptionKind[]).map((kind) => (
            <section className="dictionary-group" key={kind}>
              <h3>{kind === 'category' ? 'Kategorie' : 'Lokalizacje'}</h3>
              {canManage && (
                <div className="inline-form">
                  <input
                    aria-label={`Nowa ${kind === 'category' ? 'kategoria' : 'lokalizacja'}`}
                    value={names[kind]}
                    maxLength={80}
                    onChange={(e) => setNames((current) => ({ ...current, [kind]: e.target.value }))}
                    placeholder={kind === 'category' ? 'Np. Elektronika' : 'Np. Garaż'}
                  />
                  <button
                    className="secondary"
                    disabled={!names[kind].trim()}
                    onClick={() => void add(kind)}
                    type="button"
                  >
                    Dodaj
                  </button>
                </div>
              )}
              <div className="dictionary-list">
                {options
                  .filter((option) => option.kind === kind)
                  .map((option) => (
                    <div key={option.id}>
                      {editing === option.id ? (
                        <>
                          <input
                            autoFocus
                            value={editingName}
                            maxLength={80}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void save(option.id);
                              if (e.key === 'Escape') setEditing(null);
                            }}
                          />
                          <button className="text-action" onClick={() => void save(option.id)} type="button">
                            Zapisz
                          </button>
                          <button className="text-action" onClick={() => setEditing(null)} type="button">
                            Anuluj
                          </button>
                        </>
                      ) : (
                        <>
                          <strong>{option.name}</strong>
                          {canManage && (
                            <>
                              <button
                                className="text-action"
                                onClick={() => {
                                  setEditing(option.id);
                                  setEditingName(option.name);
                                }}
                                type="button"
                              >
                                Zmień
                              </button>
                              <button
                                className="text-action danger-action"
                                onClick={() => void remove(option)}
                                type="button"
                              >
                                Usuń
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                {!options.some((option) => option.kind === kind) && <p className="subtle">Brak pozycji.</p>}
              </div>
            </section>
          ))}
        </section>
        <DocumentTypesDictionary canManage={canManage} />
        {!canManage && <p className="subtle">Słownikami zarządza właściciel gospodarstwa.</p>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </section>
  );
}

function DocumentTypesDictionary({ canManage }: { canManage: boolean }) {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    void api
      .listDocumentTypes()
      .then((r) => setTypes(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się odczytać typów dokumentów.'));
  const changed = () => window.dispatchEvent(new Event('boberit-data-dictionaries-changed'));
  useEffect(load, []);
  async function add() {
    if (!name.trim()) return;
    try {
      setError('');
      await api.createDocumentType(name);
      setName('');
      load();
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się dodać typu.');
    }
  }
  async function save(id: string) {
    if (!editingName.trim()) return;
    try {
      setError('');
      await api.updateDocumentType(id, editingName);
      setEditing(null);
      load();
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zmienić typu.');
    }
  }
  async function remove(type: DocumentType) {
    if (!window.confirm(`Usunąć typ „${type.name}”? Typ zostanie wyczyszczony w powiązanych dokumentach.`)) return;
    try {
      setError('');
      await api.deleteDocumentType(type.id);
      load();
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się usunąć typu.');
    }
  }
  return (
    <section className="dictionary-domain document-type-domain">
      <div className="dictionary-domain-title">
        <strong>Dokumenty</strong>
        <small>Typy używane wyłącznie przez dokumenty.</small>
      </div>
      <section className="dictionary-group">
        <h3>Typy dokumentów</h3>
        {canManage && (
          <div className="inline-form">
            <input
              aria-label="Nowy typ dokumentu"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Np. Faktura"
            />
            <button className="secondary" disabled={!name.trim()} onClick={() => void add()} type="button">
              Dodaj
            </button>
          </div>
        )}
        <div className="dictionary-list">
          {types.map((type) => (
            <div key={type.id}>
              {editing === type.id ? (
                <>
                  <input
                    autoFocus
                    value={editingName}
                    maxLength={80}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void save(type.id);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                  <button className="text-action" onClick={() => void save(type.id)} type="button">
                    Zapisz
                  </button>
                  <button className="text-action" onClick={() => setEditing(null)} type="button">
                    Anuluj
                  </button>
                </>
              ) : (
                <>
                  <strong>{type.name}</strong>
                  {canManage && (
                    <>
                      <button
                        className="text-action"
                        onClick={() => {
                          setEditing(type.id);
                          setEditingName(type.name);
                        }}
                        type="button"
                      >
                        Zmień
                      </button>
                      <button className="text-action danger-action" onClick={() => void remove(type)} type="button">
                        Usuń
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          {!types.length && <p className="subtle">Brak typów dokumentów.</p>}
        </div>
      </section>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
