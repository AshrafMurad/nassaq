import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ParseSummary } from '@/domain/protocol';
import type { RiskCategory } from '@/domain/risks';

interface RiskSummaryProps {
  summary: ParseSummary;
}

export function RiskSummary({ summary }: RiskSummaryProps) {
  const { t } = useTranslation();

  if (summary.totalRisks === 0) {
    return (
      <div
        role="status"
        data-testid="risk-summary-safe"
        className="neo-control flex items-start gap-3 rounded-sm border-2 border-black bg-white p-4"
      >
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0 text-green-700"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-bold text-charcoal">{t('riskNoneTitle')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('riskNoneSub')}</p>
        </div>
      </div>
    );
  }

  const categoryMap: Array<{ key: RiskCategory; label: string; count: number }> = [
    {
      key: 'LEADING_ZERO' as const,
      label: t('riskLeadingZero'),
      count: summary.riskSummary.LEADING_ZERO,
    },
    {
      key: 'LONG_NUMBER' as const,
      label: t('riskLongNumber'),
      count: summary.riskSummary.LONG_NUMBER,
    },
    {
      key: 'DATE_SHAPED' as const,
      label: t('riskDateShaped'),
      count: summary.riskSummary.DATE_SHAPED,
    },
    {
      key: 'FORMULA_LIKE' as const,
      label: t('riskFormulaLike'),
      count: summary.riskSummary.FORMULA_LIKE,
    },
    {
      key: 'SCIENTIFIC_NOTATION' as const,
      label: t('riskScientific'),
      count: summary.riskSummary.SCIENTIFIC_NOTATION,
    },
    {
      key: 'DECIMAL_SEPARATOR_AMBIGUITY' as const,
      label: t('riskDecimalComma'),
      count: summary.riskSummary.DECIMAL_SEPARATOR_AMBIGUITY,
    },
    {
      key: 'MIXED_DIRECTION' as const,
      label: t('riskMixedDirection'),
      count: summary.riskSummary.MIXED_DIRECTION,
    },
  ].filter((item) => item.count > 0);

  return (
    <div
      role="region"
      aria-label={t('risk')}
      data-testid="risk-summary"
      className="neo-control rounded-sm border-2 border-black bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 size-5 shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-charcoal" data-testid="risk-count-title">
            {t('riskSummaryTitle', { count: summary.totalRisks })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('riskSummarySub')}</p>

          <div
            className="mt-3 flex flex-wrap gap-2"
            data-testid="risk-category-badges"
          >
            {categoryMap.map((item) => (
              <span
                key={item.key}
                data-testid={`risk-badge-${item.key}`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-black bg-sage px-2.5 py-1 text-xs font-semibold text-charcoal"
              >
                <span>{item.label}:</span>
                <span className="tabular-nums font-bold">{item.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
