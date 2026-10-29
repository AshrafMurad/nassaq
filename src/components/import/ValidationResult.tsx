/**
 * ValidationResult — Phase 4
 *
 * Displays the outcome of the mandatory read-back verification:
 *  - Success: displays checkmark, verified dimensions, cell type counts, and confirmation
 *    that no formulas, links, or mutations were introduced.
 *  - Failure: displays alert, generic reason, and coordinates (row/col) without disclosing
 *    sensitive cell values, and clearly explains that the download is blocked to protect data.
 */

import { useTranslation } from 'react-i18next';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import type { ExportManifest, VerificationFailure } from '@/domain/export-manifest';

interface ValidationResultProps {
  manifest?: ExportManifest;
  failure?: VerificationFailure;
}

export function ValidationResult({ manifest, failure }: ValidationResultProps) {
  const { t, i18n } = useTranslation();

  if (failure) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-sm border-2 border-black bg-red-50 p-4 shadow-hard text-charcoal space-y-3"
        data-testid="validation-failure"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-6 shrink-0 text-red-600" aria-hidden="true" />
          <h3 className="text-base font-bold text-red-950">
            {t('validationFailedTitle')}
          </h3>
        </div>
        <p className="text-sm font-medium text-red-900">
          {t('validationFailedBody')}
        </p>
        <div className="rounded border border-red-300 bg-white/80 p-2.5 text-xs sm:text-sm font-semibold text-red-950">
          {failure.row !== undefined && failure.column !== undefined ? (
            <span>
              {t('validationFailureCoord', {
                row: failure.row,
                col: failure.column,
              })}
              {' '}
              ({t('validationFailureGeneric', { reason: failure.reason })})
            </span>
          ) : (
            <span>
              {t('validationFailureGeneric', { reason: failure.reason })}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (manifest) {
    const verifiedTime = new Intl.DateTimeFormat(i18n.language, {
      timeStyle: 'medium',
      dateStyle: 'short',
    }).format(new Date(manifest.verifiedAt));

    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-sm border-2 border-black bg-card p-4 shadow-hard space-y-4"
        data-testid="validation-success"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 size-6 shrink-0 text-green-700"
            aria-hidden="true"
          />
          <div>
            <h3 className="text-base font-bold text-charcoal">
              {t('validationSuccessTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('validationSuccessBody')}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 border-t border-black/10 pt-3 text-xs sm:grid-cols-4 sm:text-sm">
          <div className="rounded border border-black/15 bg-muted/30 p-2">
            <dt className="text-muted-foreground">{t('manifestTextCells')}</dt>
            <dd className="text-base font-bold tabular-nums" data-testid="manifest-text-cells">
              {manifest.textCells.toLocaleString()}
            </dd>
          </div>

          <div className="rounded border border-black/15 bg-muted/30 p-2">
            <dt className="text-muted-foreground">{t('manifestNumberCells')}</dt>
            <dd className="text-base font-bold tabular-nums" data-testid="manifest-number-cells">
              {manifest.numberCells.toLocaleString()}
            </dd>
          </div>

          <div className="rounded border border-black/15 bg-muted/30 p-2">
            <dt className="text-muted-foreground">{t('manifestEmptyCells')}</dt>
            <dd className="text-base font-bold tabular-nums" data-testid="manifest-empty-cells">
              {manifest.emptyCells.toLocaleString()}
            </dd>
          </div>

          <div className="rounded border border-black/15 bg-muted/30 p-2">
            <dt className="text-muted-foreground">{t('manifestTotalCells')}</dt>
            <dd className="text-base font-bold tabular-nums" data-testid="manifest-total-cells">
              {manifest.totalCells.toLocaleString()}
            </dd>
          </div>
        </dl>

        <p className="text-xs text-muted-foreground">
          {t('manifestVerifiedAt')}: <span className="font-semibold tabular-nums">{verifiedTime}</span>
        </p>
      </div>
    );
  }

  return null;
}
