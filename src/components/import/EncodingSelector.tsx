import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check } from 'lucide-react';
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

  const selectedLabel =
    ENCODING_OPTIONS.find((opt) => opt.value === value)?.label ?? value;

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

      <div ref={containerRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className="control-feedback neo-control neo-focus min-h-11 w-full cursor-pointer rounded-lg border-2 border-black bg-white px-3.5 pe-4 text-start text-sm font-bold text-charcoal hover:bg-sage/20 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-between"
        >
          <span>{selectedLabel}</span>
          <ChevronDown
            className={`pointer-events-none size-4 text-black stroke-[2.5] transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {isOpen && (
          <div
            role="listbox"
            className="absolute start-0 top-full mt-2 w-full z-50 rounded-lg border-2 border-black bg-white p-1.5 shadow-[4px_4px_0_0_#000]"
          >
            {ENCODING_OPTIONS.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm font-bold transition-colors ${
                    isSelected
                      ? 'bg-yellow text-black'
                      : 'text-charcoal hover:bg-sage/40'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <Check
                      className="size-4 shrink-0 stroke-[2.5]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <select
          id="encoding-select"
          data-testid="encoding-select"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as SupportedEncoding)}
          className="sr-only"
        >
          {ENCODING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
