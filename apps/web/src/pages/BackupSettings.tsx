import { localDate } from '@boberit/shared';
import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { SettingsBlock, SettingsHeader } from '../components/SettingsBlock';

/** Download the active household as one file, or replace it from such a file (owners only). */
export function BackupSettings({ isOwner }: { isOwner: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  async function download() {
    if (!exportPassword) return;
    setExportError(null);
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
      setExportError(error instanceof Error ? error.message : 'Nie udało się pobrać kopii zapasowej.');
    }
  }
  async function restore() {
    if (!file || confirmation !== 'ZASTĄP' || !restorePassword) return;
    setBusy(true);
    setRestoreError(null);
    try {
      await api.importBackup(file, restorePassword);
      window.location.reload();
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : 'Nie udało się przywrócić kopii zapasowej.');
    } finally {
      setBusy(false);
    }
  }
  const header = (
    <SettingsHeader
      description="Jeden plik z danymi i załącznikami aktywnego gospodarstwa — do przechowania poza serwerem."
      title="Kopia zapasowa"
    />
  );
  if (!isOwner)
    return (
      <>
        {header}
        <SettingsBlock title="Tylko dla właściciela">
          <p className="subtle">Kopią zapasową i przywracaniem danych zarządza właściciel gospodarstwa.</p>
        </SettingsBlock>
      </>
    );
  return (
    <>
      {header}
      <SettingsBlock
        description="Plik JSON z przedmiotami, dokumentami, terminami i załącznikami. Pobranie wymaga hasła."
        title="Pobierz kopię"
      >
        <form
          className="settings-inline-field"
          onSubmit={(event) => {
            event.preventDefault();
            void download();
          }}
        >
          <label>
            Obecne hasło
            <input
              autoComplete="current-password"
              onChange={(event) => setExportPassword(event.target.value)}
              type="password"
              value={exportPassword}
            />
          </label>
          <button className="primary" disabled={!exportPassword} type="submit">
            Pobierz kopię zapasową
          </button>
        </form>
        {exportError && <p className="form-error">{exportError}</p>}
      </SettingsBlock>
      <SettingsBlock
        danger
        description="Zastępuje wszystkie dane i pliki aktywnego gospodarstwa zawartością kopii. Tej operacji nie można cofnąć — najpierw pobierz aktualną kopię."
        title="Przywróć z kopii"
      >
        <ol className="restore-steps">
          <li>
            <span>Wybierz plik kopii</span>
            <label className="restore-file secondary">
              <Icon name="archive" />
              {file ? file.name : 'Wybierz plik…'}
              <input
                accept="application/json,.json"
                onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
                type="file"
              />
            </label>
          </li>
          <li>
            <span>Potwierdź</span>
            <div className="settings-form">
              <label>
                <span>
                  Wpisz <b>ZASTĄP</b>
                </span>
                <input
                  disabled={!file}
                  onChange={(event) => setConfirmation(event.target.value)}
                  value={confirmation}
                />
              </label>
              <label>
                Obecne hasło
                <input
                  autoComplete="current-password"
                  disabled={!file}
                  onChange={(event) => setRestorePassword(event.target.value)}
                  type="password"
                  value={restorePassword}
                />
              </label>
            </div>
          </li>
        </ol>
        <button
          className="secondary danger-button"
          disabled={!file || confirmation !== 'ZASTĄP' || !restorePassword || busy}
          onClick={() => void restore()}
          type="button"
        >
          {busy ? 'Przywracanie…' : 'Zastąp dane kopią'}
        </button>
        {restoreError && <p className="form-error">{restoreError}</p>}
      </SettingsBlock>
    </>
  );
}
