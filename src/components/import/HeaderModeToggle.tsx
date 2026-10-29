import { useTranslation } from 'react-i18next';

interface HeaderModeToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function HeaderModeToggle({
  checked,
  onChange,
  disabled = false,
}: HeaderModeToggleProps) {
  const { t } = useTranslation();

  return (
    <label
      className="flex cursor-pointer items-center gap-3 text-sm font-bold text-charcoal select-none"
      data-testid="header-toggle"
    >
      <input
        type="checkbox"
        data-testid="header-checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="neo-focus size-5 rounded-sm border-2 border-black accent-black disabled:opacity-50"
      />
      <span>{t('header')}</span>
    </label>
  );
}
