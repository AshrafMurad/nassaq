import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check } from 'lucide-react';
import type { ColumnMeta } from '@/domain/protocol';

interface ColumnTypeSelectorProps {
  columnIndex: number;
  columnLetter: string;
  currentType: 'text' | 'number';
  meta: ColumnMeta;
  onChange: (type: 'text' | 'number') => void;
  disabled?: boolean;
}

export function ColumnTypeSelector({
  columnIndex,
  columnLetter,
  currentType,
  meta,
  onChange,
  disabled = false,
}: ColumnTypeSelectorProps) {
  const { t } = useTranslation();
  const [blockedAlert, setBlockedAlert] = useState<string | null>(null);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value as 'text' | 'number';

    if (selected === 'number') {
      if (!meta.isNumericEligible) {
        // Block conversion and show reason with failing row coordinates
        const rowsStr = (meta.numericIneligibleSampleRows ?? []).join(', ');
        let reason = '';

        switch (meta.numericIneligibleReason) {
          case 'EMPTY_COLUMN':
            reason = t('numericBlockedReasonEmpty');
            break;
          case 'PRECISION_LIMIT_EXCEEDED':
            reason = t('numericBlockedReasonPrecision', { rows: rowsStr });
            break;
          case 'IDENTIFIER_RISK':
            reason = t('numericBlockedReasonIdentifier', { rows: rowsStr });
            break;
          case 'UNSAFE_INTEGER':
            reason = t('numericBlockedReasonSafeInteger', { rows: rowsStr });
            break;
          case 'LEXICAL_ROUNDTRIP_MISMATCH':
            reason = t('numericBlockedReasonRoundtrip', { rows: rowsStr });
            break;
          case 'NON_CANONICAL_GRAMMAR':
          default:
            reason = t('numericBlockedReasonGrammar', { rows: rowsStr });
            break;
        }

        setBlockedAlert(reason);
        onChange('text');
        return;
      }

      setBlockedAlert(null);
      onChange('number');
    } else {
      setBlockedAlert(null);
      onChange('text');
    }
  };

  return (
    <div className="relative mt-2 space-y-1.5" data-testid={`column-type-control-${columnIndex}`}>
      <label
        htmlFor={`col-type-${columnIndex}`}
        className="sr-only"
      >
        {t('columnTypeLabel', { col: columnLetter })}
      </label>

      <div className="flex items-center gap-1.5">
        <select
          id={`col-type-${columnIndex}`}
          data-testid={`column-type-select-${columnIndex}`}
          value={currentType}
          disabled={disabled}
          onChange={handleSelectChange}
          className={`neo-control neo-focus w-full rounded-sm border-2 border-black px-2 py-1 text-xs font-semibold ${
            currentType === 'number'
              ? 'bg-yellow text-black'
              : 'bg-white text-charcoal'
          }`}
        >
          <option value="text">{t('columnTypeText')}</option>
          <option value="number">{t('columnTypeNumber')}</option>
        </select>

        {currentType === 'number' && (
          <span
            title={t('numericApprovedNotice')}
            data-testid={`column-numeric-approved-${columnIndex}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-green-700 text-white"
          >
            <Check className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t('numericApprovedNotice')}</span>
          </span>
        )}
      </div>

      {blockedAlert && (
        <div
          role="alert"
          data-testid={`column-blocked-alert-${columnIndex}`}
          className="neo-control z-20 rounded-sm border-2 border-black bg-yellow p-2.5 text-xs text-black"
        >
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {t('numericBlockedTitle', { col: columnLetter })}
              </p>
              <p className="mt-1 text-xs leading-normal">{blockedAlert}</p>
              <button
                type="button"
                onClick={() => setBlockedAlert(null)}
                data-testid={`column-blocked-dismiss-${columnIndex}`}
                className="neo-focus mt-2 rounded-sm border border-black bg-white px-2 py-0.5 text-xs font-bold text-black"
              >
                {t('numericBlockedDismiss')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
