import { useTranslation } from 'react-i18next';
import type { SupportedEncoding } from '@/domain/protocol';

interface EncodingSelectorProps {
  value: SupportedEncoding;
  hadBom?: boolean;
  onChange: (encoding: SupportedEncoding) => void;
  disabled?: boolean;
}

const ENCODING_OPTIONS: { value: SupportedEncoding; label: string }[] = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'windows-1256', label: 'Windows-1256 (Arabic)' },
  { value: 'iso-8859-6', label: 'ISO-8859-6 (Arabic)' },
];

export function EncodingSelector({
  value,
  hadBom,
  onChange,
  disabled = false,
}: EncodingSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5" data-testid="encoding-selector">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label
          htmlFor="encoding-select"
          className="text-sm font-bold text-charcoal"
        >
          {t('encoding')}
        </label>
        {value === 'utf-8' && (
          <span
            className="text-xs text-muted-foreground"
            data-testid="encoding-detection-hint"
          >
            {hadBom ? t('encodingDetectedBom') : t('encodingSuggested')}
          </span>
        )}
      </div>

      <select
        id="encoding-select"
        data-testid="encoding-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as SupportedEncoding)}
        className="neo-control neo-focus w-full rounded-sm border-2 border-black bg-white px-3 py-2 text-sm font-medium text-charcoal disabled:opacity-50"
      >
        {ENCODING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
