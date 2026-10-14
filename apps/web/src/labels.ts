import type { MaintenancePlan } from '@boberit/shared';

export function intervalLabel(plan: MaintenancePlan): string {
  if (plan.scheduleKind === 'one_off') return 'Jednorazowo';
  if (!plan.intervalUnit || !plan.intervalValue) return 'Cyklicznie';
  if (plan.intervalValue === 1)
    return { days: 'Codziennie', weeks: 'Co tydzień', months: 'Co miesiąc', years: 'Co rok' }[plan.intervalUnit];
  // Polish plural: 2-4 (except 12-14) take the "few" form, everything else the "many" form.
  const forms: Record<NonNullable<MaintenancePlan['intervalUnit']>, [string, string]> = {
    days: ['dni', 'dni'],
    weeks: ['tygodnie', 'tygodni'],
    months: ['miesiące', 'miesięcy'],
    years: ['lata', 'lat'],
  };
  const value = plan.intervalValue;
  const few = value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14);
  return `Co ${value} ${forms[plan.intervalUnit][few ? 0 : 1]}`;
}
