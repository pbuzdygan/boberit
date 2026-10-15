import type { AppInformation } from '@boberit/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { SettingsBlock, SettingsHeader } from '../components/SettingsBlock';

function statusText(info: AppInformation): string {
  switch (info.status) {
    case 'current':
      return 'Masz aktualną wersję';
    case 'available':
      return `Dostępna wersja ${info.latestVersion}`;
    case 'preparing':
      return `Wersja ${info.latestVersion} jest przygotowywana do pobrania`;
    case 'ahead':
      return 'Ta instalacja jest nowsza niż opublikowane wydanie';
    case 'error':
      return 'Nie udało się sprawdzić aktualizacji. Spróbuj ponownie za minutę.';
    case 'unchecked':
      return info.version
        ? 'Aktualizacje nie zostały jeszcze sprawdzone'
        : 'Wersja lokalna — sprawdzanie aktualizacji jest niedostępne';
  }
}

export function AboutSettings() {
  const [info, setInfo] = useState<AppInformation | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const initial = (await api.about()).data;
        if (active) setInfo(initial);
        const result = initial.version ? (await api.checkUpdates()).data : initial;
        if (active) setInfo(result);
      } catch (reason) {
        if (active) {
          setInfo((previous) => (previous ? { ...previous, status: 'error' } : null));
          setError(reason instanceof Error ? reason.message : 'Nie udało się wczytać informacji.');
        }
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function check() {
    setBusy(true);
    setError('');
    try {
      const initial = info ?? (await api.about()).data;
      const result = initial.version ? (await api.checkUpdates()).data : initial;
      setInfo(result);
    } catch (reason) {
      setInfo((previous) => (previous ? { ...previous, status: 'error' } : null));
      setError(reason instanceof Error ? reason.message : 'Nie udało się sprawdzić aktualizacji.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsHeader title="Informacje" description="Wersja aplikacji i dostępność aktualizacji." />
      <SettingsBlock title={info?.version ? `Boberit v${info.version.replace(/^dev/, '')}` : 'Boberit'}>
        <div className="about-details">
          {info && (
            <p>
              Kanał wydania: {info.channel ?? 'lokalny'}
              {info.checkedAt && (
                <>
                  {' '}
                  · ostatnio sprawdzono{' '}
                  {new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(
                    new Date(info.checkedAt),
                  )}
                </>
              )}
            </p>
          )}
          <p role="status" aria-label="Stan aktualizacji" className="about-status">
            <Icon name={info?.status === 'current' && !busy ? 'circle-check' : 'info-circle'} />
            {busy ? 'Sprawdzanie…' : info ? statusText(info) : 'Informacje są niedostępne'}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="about-actions">
            <button
              className="secondary"
              disabled={busy || (!!info && !info.version)}
              onClick={() => void check()}
              type="button"
            >
              {busy ? 'Sprawdzanie…' : 'Sprawdź ponownie'}
            </button>
            {info?.releaseUrl && (info.status === 'available' || info.status === 'preparing') && (
              <a href={info.releaseUrl} target="_blank" rel="noopener noreferrer">
                Opis wydania
              </a>
            )}
          </div>
          {info?.status === 'available' && (
            <p>Aktualizację instaluje administrator przez Docker. Przed aktualizacją utwórz kopię zapasową.</p>
          )}
        </div>
      </SettingsBlock>
    </>
  );
}
