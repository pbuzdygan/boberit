import type { AssetSummary, ItemStatus } from '@boberit/shared';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';
import { warrantyLabel, itemStatusMeta } from '../labels';
import type { CollectionFilter } from '../types';

type AssetGroupBy = 'category' | 'status' | 'location';
export function AssetColumnHeader({
  filterValue,
  grouped,
  label,
  onFilter,
  onGroup,
  options,
}: {
  filterValue: string;
  grouped: boolean;
  label: string;
  onFilter: (value: string) => void;
  onGroup: () => void;
  options: { value: string; label: string }[];
}) {
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const controlRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuPosition) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!controlRef.current?.contains(target) && !menuRef.current?.contains(target)) setMenuPosition(null);
    };
    const closeOnMove = () => setMenuPosition(null);
    window.document.addEventListener('mousedown', close);
    window.addEventListener('resize', closeOnMove);
    window.addEventListener('scroll', closeOnMove, true);
    return () => {
      window.document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', closeOnMove);
      window.removeEventListener('scroll', closeOnMove, true);
    };
  }, [menuPosition]);
  function toggleFilter(event: React.MouseEvent<HTMLButtonElement>) {
    if (menuPosition) {
      setMenuPosition(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 170;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = window.innerHeight - rect.bottom < 210 ? Math.max(8, rect.top - 198) : rect.bottom + 4;
    setMenuPosition({ left, top, width });
  }
  const menu =
    menuPosition &&
    createPortal(
      <div className="asset-column-filter" ref={menuRef} role="menu" style={menuPosition}>
        <button
          className={!filterValue ? 'active' : ''}
          onClick={() => {
            onFilter('');
            setMenuPosition(null);
          }}
          role="menuitemradio"
          aria-checked={!filterValue}
          type="button"
        >
          Wszystkie
        </button>
        {options.map((option) => (
          <button
            className={filterValue === option.value ? 'active' : ''}
            key={option.value}
            onClick={() => {
              onFilter(option.value);
              setMenuPosition(null);
            }}
            role="menuitemradio"
            aria-checked={filterValue === option.value}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>,
      window.document.body,
    );
  return (
    <span className={`asset-column-header${filterValue ? ' filtered' : ''}`} ref={controlRef}>
      <span className="asset-column-title">
        <strong>{label}</strong>
        <span className="asset-column-actions">
          <button
            aria-label={`${grouped ? 'Wyłącz grupowanie' : 'Grupuj po'}: ${label}`}
            aria-pressed={grouped}
            className={grouped ? 'active' : ''}
            onClick={() => {
              setMenuPosition(null);
              onGroup();
            }}
            title={`${grouped ? 'Wyłącz grupowanie' : 'Grupuj po'}: ${label}`}
            type="button"
          >
            <Icon name="list" />
          </button>
          <button
            aria-expanded={Boolean(menuPosition)}
            aria-label={`Filtruj po: ${label}`}
            className={filterValue ? 'active' : ''}
            onClick={toggleFilter}
            title={`Filtruj po: ${label}`}
            type="button"
          >
            <Icon name="filter" />
          </button>
        </span>
      </span>
      {menu}
    </span>
  );
}

export function ItemsPage({
  allAssets,
  assets,
  attention,
  isLoading,
  filter,
  onFilter,
  onOpen,
}: {
  allAssets: AssetSummary[];
  assets: AssetSummary[];
  attention: AssetSummary[];
  isLoading: boolean;
  filter: CollectionFilter;
  onFilter: (filter: CollectionFilter) => void;
  onOpen: (id: string) => Promise<void>;
}) {
  const [columnQuery, setColumnQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [groupBy, setGroupBy] = useState<AssetGroupBy | null>(null);
  const filterCounts = {
    all: allAssets.length,
    warranty: allAssets.filter((asset) => asset.warranty && asset.warranty.kind !== 'unknown').length,
    draft: allAssets.filter((asset) => asset.completeness !== 'complete').length,
  };
  const uniqueOptions = (values: { value: string; label: string }[]) =>
    [...new Map(values.map((option) => [option.value, option])).values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'pl'),
    );
  const categoryOptions = [
    ...uniqueOptions(
      allAssets
        .filter((asset) => asset.categoryId && asset.categoryName)
        .map((asset) => ({ value: asset.categoryId!, label: asset.categoryName! })),
    ),
    { value: 'none', label: 'Bez kategorii' },
  ];
  const locationOptions = [
    ...uniqueOptions(
      allAssets
        .filter((asset) => asset.locationId && asset.locationName)
        .map((asset) => ({ value: asset.locationId!, label: asset.locationName! })),
    ),
    { value: 'none', label: 'Bez lokalizacji' },
  ];
  const statusOptions = (Object.keys(itemStatusMeta) as ItemStatus[]).map((value) => ({
    value,
    label: itemStatusMeta[value].label,
  }));
  const normalizedQuery = columnQuery.trim().toLocaleLowerCase('pl-PL');
  const visibleAssets = assets.filter((asset) => {
    const matchesFilters =
      (!categoryFilter || (categoryFilter === 'none' ? !asset.categoryId : asset.categoryId === categoryFilter)) &&
      (!statusFilter || asset.itemStatus === statusFilter) &&
      (!locationFilter || (locationFilter === 'none' ? !asset.locationId : asset.locationId === locationFilter));
    const matchesSearch =
      !normalizedQuery ||
      [
        asset.name,
        asset.manufacturer,
        asset.modelNumber,
        asset.serialNumber,
        asset.categoryName,
        itemStatusMeta[asset.itemStatus].label,
        asset.locationName,
        ...asset.tags,
        warrantyLabel(asset).text,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('pl-PL').includes(normalizedQuery));
    return matchesFilters && matchesSearch;
  });
  function grouped() {
    if (!groupBy) return [{ key: 'all', label: '', assets: visibleAssets }];
    const groups = new Map<string, { label: string; assets: AssetSummary[] }>();
    for (const asset of visibleAssets) {
      const key =
        groupBy === 'category'
          ? asset.categoryId || 'none'
          : groupBy === 'location'
            ? asset.locationId || 'none'
            : asset.itemStatus;
      const label =
        groupBy === 'category'
          ? asset.categoryName || 'Bez kategorii'
          : groupBy === 'location'
            ? asset.locationName || 'Bez lokalizacji'
            : itemStatusMeta[asset.itemStatus].label;
      const current = groups.get(key) ?? { label, assets: [] };
      current.assets.push(asset);
      groups.set(key, current);
    }
    return [...groups.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Kolekcja domowa</p>
          <h1>Przedmioty</h1>
          <p>Zapisuj teraz, uzupełniaj wtedy, kiedy masz chwilę.</p>
        </div>
      </div>
      {attention.length > 0 && (
        <div className="attention-row">
          {attention.map((asset) => (
            <button className="attention" onClick={() => void onOpen(asset.id)} key={asset.id} type="button">
              <span>
                <Icon name="shield-check" />
              </span>
              <div>
                <small>Gwarancja wymaga uwagi</small>
                <strong>{asset.name}</strong>
              </div>
              <b>{warrantyLabel(asset).text}</b>
            </button>
          ))}
        </div>
      )}
      <div className="collection-heading items-toolbar">
        <div className="filters">
          <button
            className={'filter ' + (filter === 'all' ? 'active' : '')}
            type="button"
            onClick={() => onFilter('all')}
          >
            Wszystkie <em>{filterCounts.all}</em>
          </button>
          <button
            className={'filter ' + (filter === 'warranty' ? 'active' : '')}
            type="button"
            onClick={() => onFilter('warranty')}
          >
            Gwarancje <em>{filterCounts.warranty}</em>
          </button>
          <button
            className={'filter ' + (filter === 'draft' ? 'active' : '')}
            type="button"
            onClick={() => onFilter('draft')}
          >
            Do uzupełnienia <em>{filterCounts.draft}</em>
          </button>
        </div>
        <div className="asset-table-toolbar">
          <label className={`column-search${columnQuery ? ' active' : ''}`}>
            <Icon name="search" />
            <input
              aria-label="Przeszukaj tabelę przedmiotów"
              value={columnQuery}
              onChange={(event) => setColumnQuery(event.target.value)}
              placeholder="Szukaj w tabeli…"
            />
            {columnQuery && (
              <button aria-label="Wyczyść wyszukiwanie tabeli" onClick={() => setColumnQuery('')} type="button">
                <Icon name="x" />
              </button>
            )}
          </label>
        </div>
      </div>
      <div className="asset-table" aria-live="polite">
        <div className="table-head">
          <span aria-hidden="true" />
          <span>Przedmiot</span>
          <AssetColumnHeader
            filterValue={categoryFilter}
            grouped={groupBy === 'category'}
            label="Kategoria"
            onFilter={setCategoryFilter}
            onGroup={() => setGroupBy((current) => (current === 'category' ? null : 'category'))}
            options={categoryOptions}
          />
          <AssetColumnHeader
            filterValue={statusFilter}
            grouped={groupBy === 'status'}
            label="Status"
            onFilter={setStatusFilter}
            onGroup={() => setGroupBy((current) => (current === 'status' ? null : 'status'))}
            options={statusOptions}
          />
          <AssetColumnHeader
            filterValue={locationFilter}
            grouped={groupBy === 'location'}
            label="Lokalizacja"
            onFilter={setLocationFilter}
            onGroup={() => setGroupBy((current) => (current === 'location' ? null : 'location'))}
            options={locationOptions}
          />
          <span>Tagi</span>
          <span>Gwarancja</span>
          <span aria-hidden="true" />
        </div>
        {isLoading ? (
          <div className="empty">Ładowanie kolekcji…</div>
        ) : visibleAssets.length === 0 ? (
          <div className="empty">
            <Icon name="search" />
            <strong>Brak pasujących przedmiotów</strong>
            <p>Wyczyść filtry albo spróbuj innego wyszukiwania.</p>
          </div>
        ) : (
          grouped().map((group) => (
            <section className="asset-group" key={group.key}>
              {groupBy && (
                <div className="asset-group-heading">
                  <strong>{group.label}</strong>
                  <span>{group.assets.length}</span>
                </div>
              )}
              {group.assets.map((asset) => (
                <AssetRow asset={asset} key={asset.id} onOpen={onOpen} />
              ))}
            </section>
          ))
        )}
      </div>
    </>
  );
}

function AssetRow({ asset, onOpen }: { asset: AssetSummary; onOpen: (id: string) => Promise<void> }) {
  const warranty = warrantyLabel(asset);
  const status = itemStatusMeta[asset.itemStatus];
  return (
    <button className="asset-row" type="button" onClick={() => void onOpen(asset.id)}>
      <span className="asset-icon">
        <Icon name="package" />
      </span>
      <span className="asset-name">
        <strong>{asset.name}</strong>
        <small>{[asset.manufacturer, asset.modelNumber].filter(Boolean).join(' · ') || 'Szkic — uzupełnij dane'}</small>
      </span>
      <span className="asset-taxonomy category-cell">{asset.categoryName || '—'}</span>
      <span className={`item-status ${status.className}`}>
        <b />
        {status.label}
      </span>
      <span className="asset-taxonomy location-cell">{asset.locationName || '—'}</span>
      <span className="tags">
        {asset.tags.slice(0, 2).map((tag) => (
          <i key={tag}>{tag}</i>
        ))}
      </span>
      <span className={`warranty ${warranty.state}`}>
        <b />
        {warranty.text}
      </span>
      <span className="more" aria-hidden="true">
        <Icon name="dots" />
      </span>
    </button>
  );
}
