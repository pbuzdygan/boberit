import { type FormEvent, useEffect, useId, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { SettingsHeader } from '../components/SettingsBlock';
import { useDialog } from '../hooks/useDialog';
import { eventLabel } from '../labels';

type WebhookRecord = {
  id: string;
  name: string;
  url: string;
  events: string[];
  scopeAll: boolean;
  householdIds: string[];
};
type Household = { id: string; name: string };

const eventGroups = [
  { label: 'Przedmioty', events: ['asset.created', 'asset.deleted'] },
  { label: 'Dokumenty', events: ['document.created', 'document.deleted'] },
  { label: 'Konserwacja', events: ['maintenance.created', 'maintenance.completed'] },
  { label: 'Kopia zapasowa', events: ['backup.exported', 'backup.restored'] },
];

/** Webhooks of the signed-in user: endpoints that receive selected household events. */
export function WebhookSettings() {
  const [hooks, setHooks] = useState<WebhookRecord[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  // The webhook being edited, `null` for a new one; `undefined` while the dialog is closed.
  const [editing, setEditing] = useState<WebhookRecord | null | undefined>(undefined);
  const [error, setError] = useState('');
  function load() {
    const fail = (reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'Nie udało się wczytać webhooków.');
    void api
      .listWebhooks()
      .then((response) => setHooks(response.data))
      .catch(fail);
    void api
      .households()
      .then((response) => setHouseholds(response.data.households))
      .catch(fail);
  }
  useEffect(load, []);
  async function remove(hook: WebhookRecord) {
    if (!window.confirm('Usunąć webhook „' + hook.name + '”?')) return;
    try {
      setError('');
      await api.deleteWebhook(hook.id);
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się usunąć webhooka.');
    }
  }
  const scopeText = (hook: WebhookRecord) =>
    hook.scopeAll || !hook.householdIds.length
      ? 'Wszystkie gospodarstwa'
      : households
          .filter((household) => hook.householdIds.includes(household.id))
          .map((household) => household.name)
          .join(', ');

  return (
    <>
      <SettingsHeader
        action={
          <button className="primary" onClick={() => setEditing(null)} type="button">
            <Icon name="plus" /> Dodaj webhook
          </button>
        }
        description="Wysyłaj wybrane zdarzenia z Boberit do innych usług, np. Home Assistant lub n8n."
        title="Integracje"
      />
      {error && <p className="form-error">{error}</p>}
      {hooks.length ? (
        <ul className="webhook-cards">
          {hooks.map((hook) => (
            <li key={hook.id}>
              <span aria-hidden="true" className="webhook-card-icon">
                <Icon name="webhook" />
              </span>
              <div className="webhook-card-body">
                <strong>{hook.name}</strong>
                <code>{hook.url}</code>
                <ul aria-label="Zdarzenia" className="tag-chips">
                  {hook.events.map((event) => (
                    <li key={event}>{eventLabel(event)}</li>
                  ))}
                </ul>
                <small>{scopeText(hook)}</small>
              </div>
              <div className="webhook-card-actions">
                <button className="secondary" onClick={() => setEditing(hook)} type="button">
                  Edytuj
                </button>
                <button
                  aria-label={`Usuń webhook ${hook.name}`}
                  className="icon-button icon-button--danger"
                  onClick={() => void remove(hook)}
                  title="Usuń"
                  type="button"
                >
                  <Icon name="x" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty settings-empty">
          <Icon name="webhook" />
          <strong>Nie ma jeszcze webhooków</strong>
          <p>Dodaj adres, pod który Boberit wyśle informację, gdy np. dodasz przedmiot lub wykonasz konserwację.</p>
        </div>
      )}
      {editing !== undefined && (
        <WebhookDialog
          hook={editing}
          households={households}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            load();
          }}
        />
      )}
    </>
  );
}

function WebhookDialog({
  hook,
  households,
  onClose,
  onSaved,
}: {
  hook: WebhookRecord | null;
  households: Household[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(hook?.name ?? '');
  const [url, setUrl] = useState(hook?.url ?? '');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>(hook?.events ?? ['asset.created']);
  const [householdIds, setHouseholdIds] = useState<string[]>(hook && !hook.scopeAll ? hook.householdIds : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useDialog<HTMLFormElement>(onClose);
  const titleId = useId();
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const input = secret ? { name, url, secret, events, householdIds } : { name, url, events, householdIds };
      if (hook) await api.updateWebhook(hook.id, input);
      else await api.createWebhook(input);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać webhooka.');
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        {...dialog}
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog webhook-dialog"
        onSubmit={(event) => void submit(event)}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">Integracje</p>
            <h2 id={titleId}>{hook ? 'Edytuj webhook' : 'Nowy webhook'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <Icon label="Zamknij" name="x" />
          </button>
        </header>
        <div className="form-grid">
          <label>
            Nazwa
            <input
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="np. Home Assistant"
              required
              value={name}
            />
          </label>
          <label>
            Adres URL
            <input
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              required
              type="url"
              value={url}
            />
          </label>
          <label className="span-all">
            <span>
              {hook ? 'Nowy secret' : 'Secret'}{' '}
              <small>{hook ? 'pozostaw puste, aby zachować obecny' : 'opcjonalnie, do podpisywania żądań'}</small>
            </span>
            <input
              autoComplete="off"
              onChange={(event) => setSecret(event.target.value)}
              type="password"
              value={secret}
            />
          </label>
        </div>
        <fieldset className="toggle-group">
          <legend>Zdarzenia</legend>
          {eventGroups.map((group) => (
            <div className="toggle-row" key={group.label}>
              <span>{group.label}</span>
              <div>
                {group.events.map((eventName) => (
                  <button
                    aria-pressed={events.includes(eventName)}
                    className="toggle-chip"
                    key={eventName}
                    onClick={() => setEvents((current) => toggle(current, eventName))}
                    type="button"
                  >
                    {events.includes(eventName) && <Icon name="check" />}
                    {eventLabel(eventName)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
        <fieldset className="toggle-group">
          <legend>
            Gospodarstwa <small>bez zaznaczenia: wszystkie, do których należysz</small>
          </legend>
          <div>
            {households.map((household) => (
              <button
                aria-pressed={householdIds.includes(household.id)}
                className="toggle-chip"
                key={household.id}
                onClick={() => setHouseholdIds((current) => toggle(current, household.id))}
                type="button"
              >
                {householdIds.includes(household.id) && <Icon name="check" />}
                {household.name}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="secondary" onClick={onClose} type="button">
            Anuluj
          </button>
          <button className="primary" disabled={busy || !name.trim() || !url.trim() || !events.length} type="submit">
            {busy ? 'Zapisywanie…' : hook ? 'Zapisz zmiany' : 'Dodaj webhook'}
          </button>
        </footer>
      </form>
    </div>
  );
}
