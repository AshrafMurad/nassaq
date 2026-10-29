import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectType = (selected: 'text' | 'number') => {
    if (selected === 'number') {
      if (!meta.isNumericEligible) {
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

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    selectType(e.target.value as 'text' | 'number');
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
        <div ref={containerRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setIsOpen(!isOpen)}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className={`control-feedback neo-control neo-focus flex min-h-8 w-full cursor-pointer items-center justify-between rounded-md border-2 border-black px-2 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              currentType === 'number'
                ? 'bg-yellow text-black hover:bg-yellow'
                : 'bg-white text-charcoal hover:bg-sage/30'
            }`}
          >
            <span>{currentType === 'number' ? t('columnTypeNumber') : t('columnTypeText')}</span>
            <ChevronDown
              className={`size-3.5 shrink-0 stroke-[2.5] transition-transform duration-150 ${
                isOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {isOpen && (
            <div
              role="listbox"
              className="absolute start-0 top-full mt-1.5 min-w-[120px] w-full z-50 rounded-md border-2 border-black bg-white p-1 shadow-[4px_4px_0_0_#000]"
            >
              <button
                type="button"
                role="option"
                aria-selected={currentType === 'text'}
                onClick={() => {
                  selectType('text');
                  setIsOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-xs font-bold transition-colors ${
                  currentType === 'text'
                    ? 'bg-yellow text-black'
                    : 'text-charcoal hover:bg-sage/40'
                }`}
              >
                <span>{t('columnTypeText')}</span>
                {currentType === 'text' && (
                  <Check className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                role="option"
                aria-selected={currentType === 'number'}
                onClick={() => {
                  selectType('number');
                  setIsOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-xs font-bold transition-colors ${
                  currentType === 'number'
                    ? 'bg-yellow text-black'
                    : 'text-charcoal hover:bg-sage/40'
                }`}
              >
                <span>{t('columnTypeNumber')}</span>
                {currentType === 'number' && (
                  <Check className="size-3.5 shrink-0 stroke-[2.5]" aria-hidden="true" />
                )}
              </button>
            </div>
          )}

          <select
            id={`col-type-${columnIndex}`}
            data-testid={`column-type-select-${columnIndex}`}
            value={currentType}
            disabled={disabled}
            onChange={handleSelectChange}
            className="sr-only"
          >
            <option value="text">{t('columnTypeText')}</option>
            <option value="number">{t('columnTypeNumber')}</option>
          </select>
        </div>

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
          className="neo-control z-20 rounded-md border-2 border-black bg-yellow p-2.5 text-xs text-black"
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
                className="neo-focus mt-2 cursor-pointer rounded-sm border border-black bg-white px-2 py-0.5 text-xs font-bold text-black hover:bg-sage"
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
