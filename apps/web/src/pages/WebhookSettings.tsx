import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { eventLabel } from '../labels';

type WebhookRecord = {
  id: string;
  name: string;
  url: string;
  events: string[];
  scopeAll: boolean;
  householdIds: string[];
};
const availableWebhookEvents = [
  'asset.created',
  'asset.deleted',
  'document.created',
  'document.deleted',
  'maintenance.created',
  'maintenance.completed',
  'backup.exported',
  'backup.restored',
];

export function WebhookSettings() {
  const [hooks, setHooks] = useState<WebhookRecord[]>([]);
  const [households, setHouseholds] = useState<{ id: string; name: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>(['asset.created']);
  const [householdIds, setHouseholdIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  function load() {
    const fail = (reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'Nie udało się wczytać webhooków.');
    void api
      .listWebhooks()
      .then((response) => {
        setHooks(response.data);
        const [onlyHook] = response.data;
        if (onlyHook && response.data.length === 1 && !editingId) edit(onlyHook);
      })
      .catch(fail);
    void api
      .households()
      .then((response) => setHouseholds(response.data.households))
      .catch(fail);
  }
  useEffect(load, []);
  function reset() {
    setEditingId(null);
    setName('');
    setUrl('');
    setSecret('');
    setEvents(['asset.created']);
    setHouseholdIds([]);
    setError('');
  }
  function edit(hook: WebhookRecord) {
    setEditingId(hook.id);
    setName(hook.name);
    setUrl(hook.url);
    setSecret('');
    setEvents(hook.events);
    setHouseholdIds(hook.scopeAll ? [] : hook.householdIds);
    setError('');
  }
  async function saveNotificationSettings(nextEvents: string[], nextHouseholdIds: string[]) {
    if (!editingId) return;
    try {
      setError('');
      const input = secret
        ? { name, url, secret, events: nextEvents, householdIds: nextHouseholdIds }
        : { name, url, events: nextEvents, householdIds: nextHouseholdIds };
      await api.updateWebhook(editingId, input);
      setSecret('');
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać ustawień powiadomień.');
    }
  }
  async function save() {
    try {
      setError('');
      const input = secret ? { name, url, secret, events, householdIds } : { name, url, events, householdIds };
      if (editingId) {
        await api.updateWebhook(editingId, input);
        setSecret('');
      } else {
        const created = await api.createWebhook(input);
        setEditingId(created.data.id);
        setSecret('');
      }
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać webhooka.');
    }
  }
  async function remove(hook: WebhookRecord) {
    if (!window.confirm('Usunąć webhook „' + hook.name + '”?')) return;
    try {
      setError('');
      await api.deleteWebhook(hook.id);
      if (editingId === hook.id) reset();
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się usunąć webhooka.');
    }
  }
  return (
    <div className="webhook-settings-stack">
      <section className="settings-card webhook-card">
        <span>
          <Icon name="dots" />
        </span>
        <div>
          <p className="eyebrow">Integracje</p>
          <h2>{editingId ? 'Edytuj webhook' : 'Konfiguracja webhooka'}</h2>
          <p>Podaj endpoint odbierający zdarzenia. Secret jest opcjonalny i służy do podpisywania żądań.</p>
          <div className="settings-form">
            <label>
              Nazwa
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="np. Home Assistant" />
            </label>
            <label>
              Adres URL
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" type="url" />
            </label>
            <label className="span-all">
              <span>
                {editingId ? 'Nowy secret' : 'Secret'}{' '}
                <small>{editingId ? 'pozostaw puste, aby zachować obecny' : 'opcjonalnie'}</small>
              </span>
              <input
                autoComplete="off"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                type="password"
              />
            </label>
          </div>
          <div className="webhook-form-actions">
            <button
              className="secondary"
              disabled={!name.trim() || !url.trim() || !events.length}
              onClick={() => void save()}
              type="button"
            >
              {editingId ? 'Zapisz zmiany' : 'Dodaj webhook'}
            </button>
            {editingId && (
              <button className="text-action" onClick={reset} type="button">
                Anuluj edycję
              </button>
            )}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="webhook-list webhook-config-list">
            {hooks.map((hook) => (
              <div key={hook.id}>
                <span>
                  <strong>{hook.name}</strong>
                  <small>{hook.url}</small>
                </span>
                <button className="text-action" onClick={() => edit(hook)} type="button">
                  Edytuj
                </button>
                <button className="text-action danger-action" onClick={() => void remove(hook)} type="button">
                  Usuń
                </button>
              </div>
            ))}
            {!hooks.length && <p className="subtle">Nie skonfigurowano jeszcze żadnego webhooka.</p>}
          </div>
        </div>
      </section>
      <section className="settings-card webhook-notification-card">
        <span>
          <Icon name="bell" />
        </span>
        <div>
          <p className="eyebrow">Powiadomienia</p>
          <h2>Zakres powiadomień</h2>
          <p>Wybierz gospodarstwa oraz zdarzenia dla aktualnie tworzonego lub edytowanego webhooka.</p>
          <h3>Gospodarstwa</h3>
          <div className="webhook-events">
            {households.map((household) => (
              <label key={household.id}>
                <input
                  checked={householdIds.includes(household.id)}
                  onChange={() => {
                    const next = householdIds.includes(household.id)
                      ? householdIds.filter((id) => id !== household.id)
                      : [...householdIds, household.id];
                    setHouseholdIds(next);
                    void saveNotificationSettings(events, next);
                  }}
                  type="checkbox"
                />
                {household.name}
              </label>
            ))}
          </div>
          <small className="webhook-scope-hint">
            Brak zaznaczenia oznacza wszystkie gospodarstwa, do których należysz.
          </small>
          <h3>Typy zdarzeń</h3>
          <div className="webhook-events">
            {availableWebhookEvents.map((eventName) => (
              <label key={eventName}>
                <input
                  checked={events.includes(eventName)}
                  onChange={() => {
                    const next = events.includes(eventName)
                      ? events.filter((value) => value !== eventName)
                      : [...events, eventName];
                    setEvents(next);
                    void saveNotificationSettings(next, householdIds);
                  }}
                  type="checkbox"
                />
                {eventLabel(eventName)}
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
