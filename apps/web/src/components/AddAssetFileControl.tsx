import type { AssetFileKind } from '@boberit/shared';
import { useEffect, useRef, useState } from 'react';
import { fileKindLabels } from '../labels';
import { FormSelect } from './FormSelect';

export function ProvisionalFileKind({
  assetId,
  fileId,
  onSave,
}: {
  assetId: string;
  fileId: string;
  onSave: (assetId: string, fileId: string, kind: AssetFileKind) => Promise<void>;
}) {
  const [kind, setKind] = useState<AssetFileKind>('photo');
  const [busy, setBusy] = useState(false);
  return (
    <span className="file-kind-picker">
      <FormSelect
        className="file-kind-select"
        hideLabel
        label="Wybierz typ pliku"
        value={kind}
        onChange={(value) => setKind(value as AssetFileKind)}
        options={[
          { value: 'photo', label: 'Zdjęcie' },
          { value: 'receipt', label: 'Paragon' },
          { value: 'manual', label: 'Instrukcja' },
          { value: 'other', label: 'Inne' },
        ]}
      />
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onSave(assetId, fileId, kind).finally(() => setBusy(false));
        }}
        type="button"
      >
        {busy ? 'Zapisywanie…' : 'Ustaw typ'}
      </button>
    </span>
  );
}

export function AddAssetFileControl({
  assetId,
  onUpload,
}: {
  assetId: string;
  onUpload: (id: string, files: File[], kind: AssetFileKind) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<AssetFileKind>('other');
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.document.addEventListener('mousedown', close);
    return () => window.document.removeEventListener('mousedown', close);
  }, [open]);
  function choose(kind: AssetFileKind) {
    kindRef.current = kind;
    setOpen(false);
    inputRef.current?.click();
  }
  return (
    <span className="add-asset-file" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="text-action"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Dodaj plik
      </button>
      {open && (
        <span className="add-file-kind-menu" role="menu">
          {(Object.keys(fileKindLabels) as AssetFileKind[]).map((kind) => (
            <button key={kind} onClick={() => choose(kind)} role="menuitem" type="button">
              {fileKindLabels[kind]}
            </button>
          ))}
        </span>
      )}
      <input
        ref={inputRef}
        hidden
        multiple
        type="file"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) void onUpload(assetId, files, kindRef.current);
        }}
      />
    </span>
  );
}
