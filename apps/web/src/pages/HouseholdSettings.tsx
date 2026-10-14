import { useEffect, useState } from 'react';
import { api } from '../api';
import { AssetDictionaries } from '../components/AssetDictionaries';
import { Icon } from '../components/Icon';

export function HouseholdSettings() {
  const [households, setHouseholds] = useState<{ id: string; name: string; role: string }[]>([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    void api
      .households()
      .then((r) => {
        setHouseholds(r.data.households);
        setActiveHouseholdId(r.data.activeHouseholdId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać gospodarstw.'));
  useEffect(load, []);
  async function create() {
    try {
      setError('');
      await api.createHousehold(name);
      setName('');
      load();
      window.dispatchEvent(new Event('boberit-households-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się utworzyć gospodarstwa.');
    }
  }
  async function rename(id: string) {
    if (!editingName.trim()) return;
    try {
      setError('');
      await api.renameHousehold(id, editingName);
      setEditingId(null);
      setEditingName('');
      load();
      window.dispatchEvent(new Event('boberit-households-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się zmienić nazwy.');
    }
  }
  const active = households.find((h) => h.id === activeHouseholdId);
  return (
    <div className="household-settings-stack">
      <section className="settings-card">
        <span>
          <Icon name="home" />
        </span>
        <div>
          <p className="eyebrow">Gospodarstwa domowe</p>
          <h2>Twoje gospodarstwa</h2>
          <p>Każde gospodarstwo ma własne przedmioty, dokumenty, terminy i backup.</p>
          <div className="inline-form">
            <input
              aria-label="Nazwa nowego gospodarstwa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Np. Dom letniskowy"
            />
            <button className="secondary" disabled={!name.trim()} onClick={() => void create()} type="button">
              Utwórz gospodarstwo
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="webhook-list">
            {households.map((h) => (
              <div key={h.id}>
                {editingId === h.id ? (
                  <div className="inline-form household-rename">
                    <input
                      autoFocus
                      aria-label={`Nowa nazwa ${h.name}`}
                      value={editingName}
                      maxLength={80}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void rename(h.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button
                      className="text-action"
                      disabled={!editingName.trim()}
                      onClick={() => void rename(h.id)}
                      type="button"
                    >
                      Zapisz
                    </button>
                    <button className="text-action" onClick={() => setEditingId(null)} type="button">
                      Anuluj
                    </button>
                  </div>
                ) : (
                  <>
                    <strong>
                      {h.name}
                      {h.id === activeHouseholdId ? ' · aktywne' : ''}
                    </strong>
                    <small>{h.role === 'owner' ? 'Właściciel' : 'Członek'}</small>
                    {h.role === 'owner' && (
                      <button
                        className="text-action"
                        onClick={() => {
                          setEditingId(h.id);
                          setEditingName(h.name);
                        }}
                        type="button"
                      >
                        Zmień nazwę
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
      {active && <AssetDictionaries canManage={active.role === 'owner'} householdName={active.name} />}
    </div>
  );
}
