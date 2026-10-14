import type { BinderDocument } from '@boberit/shared';
import { ocrStatusMeta } from '../labels';
import type { OcrStatus } from '../types';
import { Icon } from './Icon';

export function OcrStatusIcon({ status: rawStatus }: { status: BinderDocument['ocrStatus'] }) {
  const status = (rawStatus ?? 'pending') as OcrStatus;
  const meta = ocrStatusMeta(status);
  return (
    <span
      aria-label={`OCR: ${meta.label}`}
      className={`ocr-status-icon ocr-status--${status}`}
      role="img"
      title={`OCR: ${meta.label}`}
    >
      <Icon name={meta.icon} />
    </span>
  );
}
