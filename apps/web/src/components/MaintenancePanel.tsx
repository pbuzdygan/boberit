import type { AssetSummary, IntervalUnit, MaintenancePlan, MaintenanceRecord, ScheduleKind } from '@boberit/shared';
import { useState } from 'react';
import { newPlanInput, type PlanInput } from '../assetForm';
import { formatDate } from '../format';
import { useReportError } from '../hooks/useReportError';
import { intervalLabel } from '../labels';
import { FormSelect } from './FormSelect';
import { Icon } from './Icon';

/** Maintenance plans, completion history, and the form for a new plan of one item. */
export function MaintenancePanel({
  asset,
  onEdit,
  onComplete,
  onDeletePlan,
  onPlan,
}: {
  asset: AssetSummary;
  onEdit: (plan: MaintenancePlan) => void;
  onComplete: (plan: MaintenancePlan) => void;
  onDeletePlan: (id: string) => Promise<void>;
  onPlan: (id: string, input: PlanInput) => Promise<void>;
}) {
  const [planTitle, setPlanTitle] = useState('');
  const [planDue, setPlanDue] = useState('');
  const [planKind, setPlanKind] = useState<ScheduleKind>('recurring');
  const [planInterval, setPlanInterval] = useState('3');
  const [planUnit, setPlanUnit] = useState<IntervalUnit>('months');
  const [planNotes, setPlanNotes] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const reportError = useReportError();
  return (
    <section className="panel">
      <header className="panel-title">
        <div>
          <p className="eyebrow">Czynności</p>
          <h2>Konserwacja</h2>
        </div>
      </header>
      <div className="plan-list">
        {asset.maintenancePlans?.length ? (
          asset.maintenancePlans.map((plan) => (
            <div className="plan" key={plan.id}>
              <span>
                <Icon name="tool" />
              </span>
              <div>
                <strong>{plan.title}</strong>
                <small>
                  {plan.status === 'completed'
                    ? 'Czynność zakończona'
                    : `${plan.scheduleKind === 'recurring' ? `${intervalLabel(plan)} · ` : ''}następny termin: ${formatDate(plan.nextDueOn)}`}
                </small>
              </div>
              <div className="plan-actions">
                <button className="text-action" onClick={() => onEdit(plan)} type="button">
                  Edytuj
                </button>
                {plan.status === 'active' ? (
                  <button className="secondary" type="button" onClick={() => onComplete(plan)}>
                    Wykonane
                  </button>
                ) : (
                  <span className="plan-completed">Wykonane</span>
                )}
                <button
                  aria-label={'Usuń plan ' + plan.title}
                  className="text-action danger-action"
                  onClick={() => {
                    if (window.confirm('Usunąć plan „' + plan.title + '” wraz z historią wykonań?'))
                      void onDeletePlan(plan.id).catch(reportError('Nie udało się usunąć planu.'));
                  }}
                  type="button"
                >
                  Usuń
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="subtle">Brak planów konserwacji.</p>
        )}
      </div>
      <div className="maintenance-history">
        <p className="eyebrow">Historia</p>
        <h3>Wykonane czynności</h3>
        {asset.maintenanceRecords?.length ? (
          <div className="history-list">
            {asset.maintenanceRecords.map((record: MaintenanceRecord) => (
              <div className="history-row" key={record.id}>
                <span>
                  <Icon name="tool" />
                </span>
                <div>
                  <strong>{record.planTitle}</strong>
                  <small>
                    Wykonano {formatDate(record.performedOn)}
                    {record.dueOn ? ` · termin: ${formatDate(record.dueOn)}` : ''}
                  </small>
                  {record.notes && <p>{record.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="subtle">Jeszcze nie zapisano wykonanych czynności.</p>
        )}
      </div>
      <form
        className="plan-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (planTitle && planDue && !planBusy) {
            setPlanBusy(true);
            // Clear the form only after a successful save, so a failure keeps what was typed.
            void onPlan(
              asset.id,
              newPlanInput({
                title: planTitle,
                kind: planKind,
                interval: planInterval,
                unit: planUnit,
                dueOn: planDue,
                notes: planNotes,
              }),
            )
              .then(() => {
                setPlanTitle('');
                setPlanDue('');
                setPlanNotes('');
              })
              .catch(reportError('Nie udało się dodać planu.'))
              .finally(() => setPlanBusy(false));
          }
        }}
      >
        <div className="plan-form-grid">
          <label>
            Nazwa czynności
            <input
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              placeholder="np. Wymiana filtra"
              required
            />
          </label>
          <FormSelect
            label="Typ terminu"
            value={planKind}
            onChange={(value) => setPlanKind(value as ScheduleKind)}
            options={[
              { value: 'recurring', label: 'Cyklicznie' },
              { value: 'one_off', label: 'Konkretna data' },
            ]}
          />
          <label>
            Następny termin
            <input value={planDue} onChange={(e) => setPlanDue(e.target.value)} type="date" required />
          </label>
          {planKind === 'recurring' && (
            <>
              <label>
                Co ile
                <input
                  min="1"
                  value={planInterval}
                  onChange={(e) => setPlanInterval(e.target.value)}
                  type="number"
                  required
                />
              </label>
              <FormSelect
                label="Jednostka"
                value={planUnit}
                onChange={(value) => setPlanUnit(value as IntervalUnit)}
                options={[
                  { value: 'days', label: 'Dni' },
                  { value: 'weeks', label: 'Tygodnie' },
                  { value: 'months', label: 'Miesiące' },
                  { value: 'years', label: 'Lata' },
                ]}
              />
            </>
          )}
          <label className="span-all">
            <span>
              Notatka <small>opcjonalnie</small>
            </span>
            <input
              value={planNotes}
              onChange={(e) => setPlanNotes(e.target.value)}
              placeholder="np. filtr HEPA, numer części"
            />
          </label>
        </div>
        <button className="secondary plan-submit" disabled={planBusy} type="submit">
          {planBusy ? 'Dodawanie…' : 'Dodaj plan'}
        </button>
      </form>
    </section>
  );
}
