import { localDate } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { eventLabel } from '../labels';
import type { SettingsSection } from '../types';

function ActivitySettings() {
  const [events, setEvents] = useState<
    { action: string; entity_kind: string; label: string | null; user_login: string | null; created_at: string }[]
  >([]);
  const [bytes, setBytes] = useState(0);
  useEffect(() => {
    void api.activity().then((r) => setEvents(r.data));
    void api.storage().then((r) => setBytes(r.data.bytes));
  }, []);
  const actionLabels: Record<string, string> = {
    created: 'Utworzono',
    trashed: 'Przeniesiono do Kosza',
    restored: 'Przywrócono',
    deleted: 'Usunięto',
    exported: 'Pobrano',
    emptied: 'Opróżniono',
    'password.changed': 'Zmieniono hasło użytkownika',
    'sessions.revoked': 'Wylogowano inne sesje',
    'login.locked': 'Zablokowano logowanie po nieudanych próbach',
    'member.added': 'Dodano członka gospodarstwa',
    'member.promoted': 'Nadano rolę właściciela',
    'member.demoted': 'Zmieniono rolę na członka',
    'member.removed': 'Usunięto członka gospodarstwa',
    'webhook.created': 'Dodano webhook',
    'webhook.updated': 'Zmieniono webhook',
    'webhook.deleted': 'Usunięto webhook',
  };
  const entityLabels: Record<string, string> = {
    asset: 'przedmiot',
    document: 'dokument',
    account: 'konto',
    session: 'sesję',
    backup: 'backup',
    trash: 'Kosz',
  };
  // Compound actions ("member.added") are complete phrases; simple ones are combined with the entity.
  const describe = (event: { action: string; entity_kind: string }) =>
    event.action.includes('.')
      ? (actionLabels[event.action] ?? event.action)
      : `${actionLabels[event.action] ?? eventLabel(`${event.entity_kind}.${event.action}`)} ${entityLabels[event.entity_kind] ?? event.entity_kind}`;
  return (
    <section className="settings-card">
      <span>
        <Icon name="calendar-event" />
      </span>
      <div>
        <p className="eyebrow">Aktywność i pliki</p>
        <h2>Historia gospodarstwa</h2>
        <p>Wykorzystane miejsce: {(bytes / 1024 / 1024).toFixed(1)} MB</p>
        <div className="webhook-list activity-list">
          {events.map((e, i) => (
            <div key={i}>
              <strong>{describe(e)}</strong>
              <small>
                {e.label ?? 'Element'} · {e.user_login ?? 'system'} · {new Date(e.created_at).toLocaleString('pl-PL')}
              </small>
            </div>
          ))}
          {!events.length && <p>Brak zapisanych działań.</p>}
        </div>
      </div>
    </section>
  );
}

export function SettingsPage({ isOwner }: { isOwner: boolean }) {
  const [section, setSection] = useState<SettingsSection>('backup');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administracja</p>
          <h1>Ustawienia</h1>
          <p>Zarządzaj kopią danych oraz historią aktywnego gospodarstwa.</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav aria-label="Sekcje ustawień" className="settings-nav">
          <p>Gospodarstwo</p>
          <button className={section === 'backup' ? 'active' : ''} onClick={() => setSection('backup')} type="button">
            <Icon name="file-text" />
            Backup
          </button>
          <button
            className={section === 'activity' ? 'active' : ''}
            onClick={() => setSection('activity')}
            type="button"
          >
            <Icon name="calendar-event" />
            Historia gospodarstwa
          </button>
        </nav>
        <div className="settings-content">
          {section === 'backup' ? <BackupSettings isOwner={isOwner} /> : <ActivitySettings />}
        </div>
      </div>
    </>
  );
}

function BackupSettings({ isOwner }: { isOwner: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function download() {
    if (!exportPassword) return;
    setMessage(null);
    try {
      const blob = await api.downloadBackup(exportPassword);
      setExportPassword('');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'boberit-backup-' + localDate() + '.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się pobrać backupu.');
    }
  }
  async function restore() {
    if (!file || confirmation !== 'ZASTĄP' || !restorePassword) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.importBackup(file, restorePassword);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udało się odtworzyć backupu.');
    } finally {
      setBusy(false);
    }
  }
  if (!isOwner)
    return (
      <section className="settings-card">
        <span>
          <Icon name="file-text" />
        </span>
        <div>
          <p className="eyebrow">Backup</p>
          <h2>Pakiet Boberit</h2>
          <p>Backupem i odtwarzaniem danych zarządza właściciel gospodarstwa.</p>
        </div>
      </section>
    );
  return (
    <div className="settings-grid settings-grid--single">
      <section className="settings-card">
        <span>
          <Icon name="file-text" />
        </span>
        <div>
          <p className="eyebrow">Backup</p>
          <h2>Pakiet Boberit</h2>
          <p>Pobierz dane i załączniki aktywnego gospodarstwa w jednym pliku JSON.</p>
          <label>
            Obecne hasło
            <input
              autoComplete="current-password"
              onChange={(event) => setExportPassword(event.target.value)}
              type="password"
              value={exportPassword}
            />
          </label>
          <button className="primary" disabled={!exportPassword} onClick={() => void download()} type="button">
            Pobierz backup
          </button>
        </div>
      </section>
      <section className="settings-card">
        <span>
          <Icon name="package" />
        </span>
        <div>
          <p className="eyebrow">Odtwarzanie</p>
          <h2>Przywróć pakiet</h2>
          <p>Ta operacja zastąpi dane i pliki tylko aktywnego gospodarstwa. Najpierw pobierz aktualny backup.</p>
          <label className="restore-file secondary">
            Wybierz backup
            <input
              accept="application/json,.json"
              onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
              type="file"
            />
          </label>
          {file && (
            <>
              <label>
                Wpisz <b>ZASTĄP</b>, aby potwierdzić
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
              <label>
                Obecne hasło
                <input
                  autoComplete="current-password"
                  onChange={(event) => setRestorePassword(event.target.value)}
                  type="password"
                  value={restorePassword}
                />
              </label>
            </>
          )}
          <button
            className="secondary danger-button"
            disabled={!file || confirmation !== 'ZASTĄP' || !restorePassword || busy}
            onClick={() => void restore()}
            type="button"
          >
            {busy ? 'Odtwarzanie…' : 'Zastąp dane backupem'}
          </button>
          {message && <p className="form-error">{message}</p>}
        </div>
      </section>
    </div>
  );
}
