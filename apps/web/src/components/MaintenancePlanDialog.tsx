import type { IntervalUnit, MaintenancePlan, ScheduleKind } from '@boberit/shared';
import { FormEvent, useId, useState } from 'react';
import { newPlanInput, type PlanInput } from '../assetForm';
import { useDialog } from '../hooks/useDialog';
import { FormSelect } from './FormSelect';
import { Icon } from './Icon';

/** Creates a maintenance plan (`plan` is null) or edits an existing one. */
export function MaintenancePlanDialog({
  plan,
  onClose,
  onSave,
}: {
  plan: MaintenancePlan | null;
  onClose: () => void;
  onSave: (input: PlanInput) => Promise<void>;
}) {
  const isNew = plan === null;
  const [title, setTitle] = useState(plan?.title ?? '');
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(plan?.scheduleKind ?? 'recurring');
  const [intervalValue, setIntervalValue] = useState(String(plan?.intervalValue ?? (isNew ? 3 : 1)));
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(plan?.intervalUnit ?? 'months');
  const [nextDueOn, setNextDueOn] = useState(plan?.nextDueOn ?? '');
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useDialog<HTMLFormElement>(onClose);
  const titleId = useId();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const input = newPlanInput({
        title: title.trim(),
        kind: scheduleKind,
        interval: intervalValue,
        unit: intervalUnit,
        dueOn: nextDueOn,
        notes: notes.trim(),
      });
      await onSave({ ...input, nextDueOn: nextDueOn || null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zapisać planu.');
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
        className="dialog maintenance-edit-dialog"
        onSubmit={submit}
      >
        <header>
          <div>
            <p className="eyebrow">Konserwacja</p>
            <h2 id={titleId}>{isNew ? 'Nowy plan' : 'Edytuj plan'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            <Icon label="Zamknij" name="x" />
          </button>
        </header>
        <label>
          Nazwa czynności
          <input
            autoFocus
            placeholder="np. Wymiana filtra"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="form-grid">
          <FormSelect
            label="Typ terminu"
            value={scheduleKind}
            onChange={(value) => setScheduleKind(value as ScheduleKind)}
            options={[
              { value: 'recurring', label: 'Cyklicznie' },
              { value: 'one_off', label: 'Konkretna data' },
            ]}
          />
          <label>
            Następny termin
            {/* A new plan needs its first date; an existing one may have none after completion. */}
            <input
              required={isNew}
              value={nextDueOn}
              onChange={(event) => setNextDueOn(event.target.value)}
              type="date"
            />
          </label>
          {scheduleKind === 'recurring' && (
            <>
              <label>
                Co ile
                <input
                  min="1"
                  required
                  value={intervalValue}
                  onChange={(event) => setIntervalValue(event.target.value)}
                  type="number"
                />
              </label>
              <FormSelect
                label="Jednostka"
                value={intervalUnit}
                onChange={(value) => setIntervalUnit(value as IntervalUnit)}
                options={[
                  { value: 'days', label: 'Dni' },
                  { value: 'weeks', label: 'Tygodnie' },
                  { value: 'months', label: 'Miesiące' },
                  { value: 'years', label: 'Lata' },
                ]}
              />
            </>
          )}
        </div>
        <label>
          <span>
            Notatka <small>opcjonalnie</small>
          </span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="secondary" onClick={onClose} type="button">
            Anuluj
          </button>
          <button className="primary" disabled={busy || !title.trim()} type="submit">
            {busy ? 'Zapisywanie…' : isNew ? 'Dodaj plan' : 'Zapisz zmiany'}
          </button>
        </footer>
      </form>
    </div>
  );
}
