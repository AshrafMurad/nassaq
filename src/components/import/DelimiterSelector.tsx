import { useTranslation } from 'react-i18next';
import { DELIMITER_CANDIDATES, delimiterLabel } from '@/domain/delimiter';
import type { DelimiterChar } from '@/domain/protocol';

interface DelimiterSelectorProps {
  value: DelimiterChar;
  onChange: (delimiter: DelimiterChar) => void;
  disabled?: boolean;
}

export function DelimiterSelector({
  value,
  onChange,
  disabled = false,
}: DelimiterSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5" data-testid="delimiter-selector">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label className="text-sm font-bold text-charcoal" id="delimiter-label">
          {t('delimiter')}
        </label>
        <span className="text-xs text-muted-foreground">{t('delimiterHelp')}</span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="delimiter-label"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {DELIMITER_CANDIDATES.map((d) => {
          const isSelected = value === d;
          const testIdSuffix = d === '\t' ? 'tab' : d;

          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(d)}
              data-testid={`delimiter-choice-${testIdSuffix}`}
              className={`control-feedback neo-control neo-focus min-h-11 rounded-sm px-3 py-2 text-sm font-bold transition-all disabled:opacity-50 ${
                isSelected
                  ? 'border-2 border-black bg-yellow text-black'
                  : 'border-2 border-black bg-white text-charcoal hover:bg-sage'
              }`}
            >
              {delimiterLabel(d)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
