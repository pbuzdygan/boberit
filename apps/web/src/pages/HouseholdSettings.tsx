import { type FormEvent, useState } from 'react';
import { api } from '../api';
import { nameInitials, paletteSlot } from '../collections';
import { Icon } from '../components/Icon';
import { SettingsHeader } from '../components/SettingsBlock';
import type { HouseholdMembership } from '../types';

const badgeColors = 6;
const householdsChanged = () => window.dispatchEvent(new Event('boberit-households-changed'));

/** The signed-in user's households as cards: switch, rename (owners), and create a new one. */
export function HouseholdSettings({
  households,
  activeHouseholdId,
  onSwitch,
}: {
  households: HouseholdMembership[];
  activeHouseholdId: string | null;
  onSwitch: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback);
    } finally {
      setBusy(false);
    }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    void run(async () => {
      await api.createHousehold(newName.trim());
      setNewName('');
      setCreating(false);
      householdsChanged();
    }, 'Nie udało się utworzyć gospodarstwa.');
  }
  function rename(event: FormEvent, id: string) {
    event.preventDefault();
    if (!editingName.trim()) return;
    void run(async () => {
      await api.renameHousehold(id, editingName.trim());
      setEditingId(null);
      householdsChanged();
    }, 'Nie udało się zmienić nazwy.');
  }

  return (
    <>
      <SettingsHeader
        description="Każde gospodarstwo ma własne przedmioty, dokumenty, terminy i kopię zapasową."
        title="Gospodarstwa"
      />
      {error && <p className="form-error">{error}</p>}
      <ul className="household-cards">
        {households.map((household) => {
          const active = household.id === activeHouseholdId;
          return (
            <li className={`household-card${active ? ' is-active' : ''}`} key={household.id}>
              <span aria-hidden="true" className={`household-badge tone-${paletteSlot(household.name, badgeColors)}`}>
                {nameInitials(household.name)}
              </span>
              {editingId === household.id ? (
                <form className="household-rename" onSubmit={(event) => rename(event, household.id)}>
                  <input
                    aria-label={`Nowa nazwa: ${household.name}`}
                    autoFocus
                    maxLength={80}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    value={editingName}
                  />
                  <button className="secondary" disabled={busy || !editingName.trim()} type="submit">
                    Zapisz
                  </button>
                  <button className="text-action" onClick={() => setEditingId(null)} type="button">
                    Anuluj
                  </button>
                </form>
              ) : (
                <div className="household-card-body">
                  <strong>{household.name}</strong>
                  <span className="household-card-meta">
                    <span className="role-badge">{household.role === 'owner' ? 'Właściciel' : 'Członek'}</span>
                    {active && <span className="active-badge">Aktywne</span>}
                  </span>
                </div>
              )}
              {editingId !== household.id && (
                <div className="household-card-actions">
                  {household.role === 'owner' && (
                    <button
                      aria-label={`Zmień nazwę: ${household.name}`}
                      className="icon-button"
                      onClick={() => {
                        setEditingId(household.id);
                        setEditingName(household.name);
                      }}
                      title="Zmień nazwę"
                      type="button"
                    >
                      <Icon name="pencil" />
                    </button>
                  )}
                  {!active && (
                    <button className="secondary" onClick={() => void onSwitch(household.id)} type="button">
                      Przełącz
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        <li className="household-card household-card--new">
          {creating ? (
            <form className="household-rename" onSubmit={create}>
              <input
                aria-label="Nazwa nowego gospodarstwa"
                autoFocus
                maxLength={80}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setCreating(false);
                }}
                placeholder="np. Dom letniskowy"
                value={newName}
              />
              <button className="primary" disabled={busy || !newName.trim()} type="submit">
                Utwórz
              </button>
              <button className="text-action" onClick={() => setCreating(false)} type="button">
                Anuluj
              </button>
            </form>
          ) : (
            <button className="household-new-button" onClick={() => setCreating(true)} type="button">
              <Icon name="plus" />
              Nowe gospodarstwo
            </button>
          )}
        </li>
      </ul>
    </>
  );
}
