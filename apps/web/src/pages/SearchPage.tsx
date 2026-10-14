import type { AssetSummary, BinderDocument } from '@boberit/shared';
import { Icon } from '../components/Icon';

export function SearchPage({
  query,
  assets,
  documents,
  isLoading,
  error,
  onOpenAsset,
  onOpenDocument,
}: {
  query: string;
  assets: AssetSummary[];
  documents: BinderDocument[];
  isLoading: boolean;
  error: string;
  onOpenAsset: (id: string) => Promise<void>;
  onOpenDocument: (document: BinderDocument) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Wyniki wyszukiwania</p>
          <h1>„{query}”</h1>
          <p>Przedmioty oraz dokumenty — również dopasowania z OCR.</p>
        </div>
      </div>
      <div className="search-results" aria-live="polite" aria-busy={isLoading}>
        {isLoading ? (
          <div className="empty">Wyszukiwanie…</div>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : (
          <>
            <section>
              <div className="section-heading">
                <h2>
                  Przedmioty <em>{assets.length}</em>
                </h2>
              </div>
              {assets.map((asset) => (
                <button className="recent-row" key={asset.id} onClick={() => void onOpenAsset(asset.id)} type="button">
                  <span className="asset-icon">
                    <Icon name="package" />
                  </span>
                  <span>
                    <strong>{asset.name}</strong>
                    <small>{[asset.manufacturer, asset.modelNumber].filter(Boolean).join(' · ') || 'Przedmiot'}</small>
                  </span>
                </button>
              ))}
            </section>
            <section>
              <div className="section-heading">
                <h2>
                  Dokumenty <em>{documents.length}</em>
                </h2>
              </div>
              {documents.map((doc) => (
                <button className="recent-row" key={doc.id} onClick={() => onOpenDocument(doc)} type="button">
                  <span className="asset-icon">
                    <Icon name="file-text" />
                  </span>
                  <span>
                    <strong>{doc.name}</strong>
                    <small>
                      {doc.ocrTextPreview || [doc.type, ...doc.tags].filter(Boolean).join(' · ') || 'Dokument'}
                    </small>
                  </span>
                </button>
              ))}
            </section>
            {!assets.length && !documents.length && (
              <div className="empty">
                <Icon name="search" />
                <strong>Brak wyników</strong>
                <p>Spróbuj innego słowa lub fragmentu tekstu.</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
