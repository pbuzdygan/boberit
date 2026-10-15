import type { AssetSummary, MaintenancePlan, MaintenanceRecord } from '@boberit/shared';
import { formatDate } from '../format';
import { useReportError } from '../hooks/useReportError';
import { intervalLabel } from '../labels';
import { Icon } from './Icon';

/** Maintenance plans and completion history of one item; plans are added and edited in a dialog. */
export function MaintenancePanel({
  asset,
  onAdd,
  onEdit,
  onComplete,
  onDeletePlan,
}: {
  asset: AssetSummary;
  onAdd: () => void;
  onEdit: (plan: MaintenancePlan) => void;
  onComplete: (plan: MaintenancePlan) => void;
  onDeletePlan: (id: string) => Promise<void>;
}) {
  const reportError = useReportError();
  return (
    <section className="panel detail-maintenance">
      <header className="panel-title">
        <div>
          <p className="eyebrow">Czynności</p>
          <h2>Konserwacja</h2>
        </div>
        <button className="secondary" onClick={onAdd} type="button">
          Dodaj plan
        </button>
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
                {plan.status === 'active' ? (
                  <button className="secondary" type="button" onClick={() => onComplete(plan)}>
                    Wykonane
                  </button>
                ) : (
                  <span className="plan-completed">Wykonane</span>
                )}
                <button className="text-action" onClick={() => onEdit(plan)} type="button">
                  Edytuj
                </button>
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
    </section>
  );
}
