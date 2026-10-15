import { type MaintenancePlan, localDate } from '@boberit/shared';
import { type FormEvent, useId, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { Icon } from './Icon';

export function CompletionDialog({
  plan,
  onClose,
  onSave,
}: {
  plan: MaintenancePlan;
  onClose: () => void;
  onSave: (input: { performedOn?: string; notes?: string }) => Promise<void>;
}) {
  const [performedOn, setPerformedOn] = useState(() => localDate());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useDialog<HTMLFormElement>(onClose);
  const titleId = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    // Blocks a second click: each submit would add its own history record.
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(notes.trim() ? { performedOn, notes: notes.trim() } : { performedOn });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać wykonania.');
      setBusy(false);
    }
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        {...dialog}
        aria-labelledby={titleId}
        aria-modal="true"
        role="dialog"
        className="dialog completion-dialog"
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <div>
            <p className="eyebrow">Konserwacja</p>
            <h2 id={titleId}>Oznacz jako wykonane</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <Icon name="x" label="Zamknij" />
          </button>
        </header>
        <p className="dialog-intro">Zapis trafi do historii czynności dla „{plan.title}”.</p>
        <label>
          Data wykonania
          <input value={performedOn} onChange={(event) => setPerformedOn(event.target.value)} required type="date" />
        </label>
        <label>
          <span>
            Notatka <small>opcjonalnie</small>
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="np. użyty filtr, koszt lub dodatkowa informacja"
            rows={3}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Anuluj
          </button>
          <button className="primary" disabled={busy} type="submit">
            {busy ? 'Zapisywanie…' : 'Zapisz wykonanie'}
          </button>
        </footer>
      </form>
    </div>
  );
}
