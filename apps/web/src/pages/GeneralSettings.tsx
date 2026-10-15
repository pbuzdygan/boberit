import { useEffect, useState } from 'react';
import { api } from '../api';
import { SettingsBlock, SettingsHeader } from '../components/SettingsBlock';
import { formatStorage } from '../format';
import type { HouseholdMembership } from '../types';

/** Name, role, and size of the active household. */
export function GeneralSettings({
  household,
  itemCount,
  documentCount,
  storageBytes,
}: {
  household: HouseholdMembership | undefined;
  itemCount: number;
  documentCount: number;
  storageBytes: number;
}) {
  const [name, setName] = useState(household?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => setName(household?.name ?? ''), [household?.name]);
  const isOwner = household?.role === 'owner';
  const changed = name.trim() !== '' && name.trim() !== household?.name;

  async function rename() {
    if (!household || !changed) return;
    setBusy(true);
    setNotice(null);
    try {
      await api.renameHousehold(household.id, name.trim());
      window.dispatchEvent(new Event('boberit-households-changed'));
      setNotice({ kind: 'success', text: 'Nazwę gospodarstwa zapisano.' });
    } catch (reason) {
      setNotice({ kind: 'error', text: reason instanceof Error ? reason.message : 'Nie udało się zmienić nazwy.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsHeader description="Podstawowe informacje o gospodarstwie, z którym teraz pracujesz." title="Ogólne" />
      <SettingsBlock
        description={
          isOwner ? 'Nazwa jest widoczna dla wszystkich członków.' : 'Nazwę może zmienić właściciel gospodarstwa.'
        }
        title="Gospodarstwo"
      >
        <form
          className="settings-inline-field"
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <label>
            Nazwa
            <input disabled={!isOwner} maxLength={80} onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          {isOwner && (
            <button className="secondary" disabled={!changed || busy} type="submit">
              {busy ? 'Zapisywanie…' : 'Zapisz nazwę'}
            </button>
          )}
        </form>
        <p className="settings-meta">
          Twoja rola: <span className="role-badge">{isOwner ? 'Właściciel' : 'Członek'}</span>
        </p>
        {notice && (
          <p className={notice.kind === 'error' ? 'form-error' : 'form-success'} role="status">
            {notice.text}
          </p>
        )}
      </SettingsBlock>
      <SettingsBlock title="Zawartość">
        <dl className="settings-stats">
          <div>
            <dt>Przedmioty</dt>
            <dd>{itemCount}</dd>
          </div>
          <div>
            <dt>Dokumenty</dt>
            <dd>{documentCount}</dd>
          </div>
          <div>
            <dt>Zajęte miejsce</dt>
            <dd>{formatStorage(storageBytes)}</dd>
          </div>
        </dl>
      </SettingsBlock>
    </>
  );
}
