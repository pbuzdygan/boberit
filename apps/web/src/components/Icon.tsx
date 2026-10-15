export type IconName =
  | 'home'
  | 'package'
  | 'search'
  | 'plus'
  | 'shield-check'
  | 'tool'
  | 'calendar-event'
  | 'arrow-left'
  | 'x'
  | 'receipt'
  | 'file-text'
  | 'dots'
  | 'bell'
  | 'trash'
  | 'list'
  | 'filter'
  | 'settings'
  | 'users'
  | 'inbox'
  | 'webhook'
  | 'history'
  | 'clock'
  | 'circle-check'
  | 'alert-triangle';
export const icon = (name: IconName) => `/icons/${name}.svg`;

export function Icon({ name, label }: { name: IconName; label?: string }) {
  return <img className="icon" src={icon(name)} alt={label ?? ''} aria-hidden={label ? undefined : true} />;
}
