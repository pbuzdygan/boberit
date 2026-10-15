import type { ReactNode } from 'react';

/** Title row of a settings section: what it is, one sentence of context, and its main action. */
export function SettingsHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="settings-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

/** A group of related settings; `danger` marks irreversible operations. */
export function SettingsBlock({
  title,
  description,
  action,
  danger = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`settings-block${danger ? ' settings-block--danger' : ''}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
