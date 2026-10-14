import { type MaintenancePlan, localDate } from '@boberit/shared';
import { useState } from 'react';
import { Icon } from './Icon';

export function CompletionDialog({
  plan,
  onClose,
  onSave,
}: {
  plan: MaintenancePlan;
  onClose: () => void;
  onSave: (input: { performedOn?: string; notes?: string }) => void;
}) {
  const [performedOn, setPerformedOn] = useState(() => localDate());
  const [notes, setNotes] = useState('');
  return (
    <div className="dialog-backdrop" role="presentation">
      <form
        className="dialog completion-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(notes.trim() ? { performedOn, notes: notes.trim() } : { performedOn });
        }}
      >
        <header>
          <div>
            <p className="eyebrow">Konserwacja</p>
            <h2>Oznacz jako wykonane</h2>
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
          Notatka <small>opcjonalnie</small>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="np. użyty filtr, koszt lub dodatkowa informacja"
            rows={3}
          />
        </label>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Anuluj
          </button>
          <button className="primary" type="submit">
            Zapisz wykonanie
          </button>
        </footer>
      </form>
    </div>
  );
}
