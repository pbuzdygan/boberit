/**
 * Shown instead of a household view until its data has loaded once: a skeleton while loading,
 * or the error with a retry. This keeps "not loaded" from looking like an empty household.
 */
export function LoadState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error)
    return (
      <div className="load-error" role="alert">
        <strong>Nie udało się wczytać danych</strong>
        <p>{error}</p>
        <button className="primary" onClick={onRetry} type="button">
          Spróbuj ponownie
        </button>
      </div>
    );
  return (
    <div className="load-skeleton" role="status">
      <span className="visually-hidden">Wczytywanie danych gospodarstwa…</span>
      <span aria-hidden="true" className="load-skeleton-title" />
      <span aria-hidden="true" className="load-skeleton-text" />
      <span aria-hidden="true" className="load-skeleton-block" />
      <span aria-hidden="true" className="load-skeleton-block" />
    </div>
  );
}
