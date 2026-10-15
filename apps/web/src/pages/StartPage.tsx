import { type AssetSummary, daysUntil } from '@boberit/shared';
import { Icon } from '../components/Icon';
import { formatDate, formatStorage, formatPurchaseValues } from '../format';
import { warrantyLabel } from '../labels';
import type { ReminderEntry, PurchaseValue } from '../types';

export function StartPage({
  assets,
  documentCount,
  storageBytes,
  purchaseValues,
  attention,
  reminders,
  onOpen,
  onAllItems,
  onTimeline,
  onAdd,
}: {
  assets: AssetSummary[];
  documentCount: number;
  storageBytes: number;
  purchaseValues: PurchaseValue[];
  attention: AssetSummary[];
  reminders: ReminderEntry[];
  onOpen: (id: string) => Promise<void>;
  onAllItems: () => void;
  onTimeline: () => void;
  onAdd: () => void;
}) {
  const today = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const drafts = assets.filter((asset) => asset.completeness !== 'complete');
  return (
    <>
      <div className="page-heading start-heading">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>Dzień dobry.</h1>
          <p>Wszystko ważne jest pod ręką.</p>
        </div>
        <div className="heading-metrics">
          <div className="heading-metric">
            <strong>{assets.length}</strong>
            <span>
              zapisane
              <br />
              przedmioty
            </span>
          </div>
          <div className="heading-metric">
            <strong>{documentCount}</strong>
            <span>
              zapisane
              <br />
              dokumenty
            </span>
          </div>
          <div className="heading-metric heading-metric--storage">
            <strong>{formatStorage(storageBytes)}</strong>
            <span>
              wykorzystane
              <br />
              miejsce
            </span>
          </div>
          <div className="heading-metric heading-metric--value">
            <strong title={formatPurchaseValues(purchaseValues)}>{formatPurchaseValues(purchaseValues)}</strong>
            <span>wartość</span>
          </div>
        </div>
      </div>
      <div className="start-attention">
        {attention.map((asset) => (
          <button
            className="start-attention-card urgent"
            onClick={() => void onOpen(asset.id)}
            key={asset.id}
            type="button"
          >
            <span>
              <Icon name="shield-check" />
            </span>
            <div>
              <small>Gwarancja wymaga uwagi · {warrantyLabel(asset).text}</small>
              <strong>{asset.name}</strong>
              <p>Otwórz przedmiot i sprawdź zakres ochrony oraz dokumenty.</p>
            </div>
            <b>Sprawdź →</b>
          </button>
        ))}
        {drafts.slice(0, Math.max(0, 2 - attention.length)).map((asset) => (
          <button className="start-attention-card" onClick={() => void onOpen(asset.id)} key={asset.id} type="button">
            <span>
              <Icon name="package" />
            </span>
            <div>
              <small>Wymaga uzupełnienia</small>
              <strong>{asset.name}</strong>
              <p>Dodaj dane zakupu, gwarancję lub dokumentację.</p>
            </div>
            <b>Uzupełnij →</b>
          </button>
        ))}
        {!attention.length && !drafts.length && (
          <div className="start-empty">
            {assets.length
              ? 'Nie ma pilnych spraw. Możesz spokojnie dodać kolejny przedmiot.'
              : 'Nie ma pilnych spraw.'}
          </div>
        )}
      </div>
      <div className="start-overview-grid">
        <section className="start-reminders">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Przypomnienia</p>
              <h2>
                Wymagają uwagi <em>{reminders.length}</em>
              </h2>
            </div>
            <button className="text-action" onClick={onTimeline} type="button">
              Wszystkie terminy →
            </button>
          </div>
          {reminders.length ? (
            <div className="reminder-list">
              {reminders.slice(0, 4).map((entry) => {
                const days = daysUntil(entry.dueOn);
                const label =
                  days < 0
                    ? `${Math.abs(days)} dni po terminie`
                    : days === 0
                      ? 'Dzisiaj'
                      : days === 1
                        ? 'Jutro'
                        : `Za ${days} dni`;
                return (
                  <button
                    className={days < 0 ? 'reminder-row overdue' : 'reminder-row'}
                    key={`${entry.kind}-${entry.id}`}
                    onClick={() => void onOpen(entry.asset.id)}
                    type="button"
                  >
                    <span className="reminder-icon">
                      <Icon name={entry.kind === 'maintenance' ? 'tool' : 'shield-check'} />
                    </span>
                    <span>
                      <strong>
                        {entry.kind === 'maintenance' ? entry.plan?.title : 'Koniec gwarancji'} · {entry.asset.name}
                      </strong>
                      <small>
                        {entry.kind === 'maintenance' ? 'Konserwacja' : 'Gwarancja'} · {formatDate(entry.dueOn)}
                      </small>
                    </span>
                    <b>{label}</b>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="start-empty">Nie ma gwarancji ani konserwacji wymagających uwagi w ciągu 30 dni.</div>
          )}
        </section>
        <section className="start-recent">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Kolekcja</p>
              <h2>Ostatnio zapisane</h2>
            </div>
            <button className="text-action" type="button" onClick={onAllItems}>
              Wszystkie {assets.length} →
            </button>
          </div>
          <div className="recent-list">
            {assets.slice(0, 5).map((asset) => (
              <button className="recent-row" key={asset.id} type="button" onClick={() => void onOpen(asset.id)}>
                <span className="asset-icon">
                  <Icon name="package" />
                </span>
                <span>
                  <strong>{asset.name}</strong>
                  <small>
                    {[asset.manufacturer, asset.modelNumber].filter(Boolean).join(' · ') || 'Szkic — uzupełnij dane'}
                  </small>
                </span>
                <span className={`warranty ${warrantyLabel(asset).state}`}>
                  <b />
                  {warrantyLabel(asset).text}
                </span>
              </button>
            ))}
            {assets.length === 0 && (
              <div className="empty">
                <Icon name="package" />
                <strong>Kolekcja jest jeszcze pusta</strong>
                <p>Dodaj pierwszy przedmiot, aby Boberit mógł pilnować jego dokumentów i terminów.</p>
                <button className="primary" onClick={onAdd} type="button">
                  Dodaj przedmiot
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
