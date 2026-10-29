/**
 * DownloadAction — Phase 4
 *
 * Coordinates XLSX generation, verification feedback, and browser download:
 *  - Primary "Create safe Excel" action triggers worker XLSX export.
 *  - Displays spinner and phase indicators during generation/verification.
 *  - Mounts ValidationResult upon completion (or failure).
 *  - Enables "Download verified XLSX" only after 100% round-trip verification passes.
 */

import { useTranslation } from 'react-i18next';
import { Download, FileCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ValidationResult } from './ValidationResult';
import type { ExportManifest, VerificationFailure } from '@/domain/export-manifest';

interface DownloadActionProps {
  onExport: () => void;
  onDownload: () => void;
  isExporting: boolean;
  isVerified: boolean;
  manifest?: ExportManifest;
  failure?: VerificationFailure;
  progressPhase?: string;
}

export function DownloadAction({
  onExport,
  onDownload,
  isExporting,
  isVerified,
  manifest,
  failure,
  progressPhase,
}: DownloadActionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 border-t-2 border-black pt-5">
      {/* ── Verification Result display (success or failure) ────────── */}
      {manifest && <ValidationResult manifest={manifest} />}
      {failure && <ValidationResult failure={failure} />}

      {/* ── Action Buttons ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-charcoal">
            {isVerified ? t('downloadReady') : t('create')}
          </p>
          <p className="text-xs text-muted-foreground">
            {isVerified ? t('validationSuccessBody') : t('createActionHelp')}
          </p>
        </div>

        {isVerified ? (
          <Button
            size="lg"
            onClick={onDownload}
            className="neo-push min-h-12 border-2 border-black bg-yellow text-base font-extrabold text-black shadow-hard hover:bg-yellow hover:text-black"
            data-testid="download-excel-button"
          >
            <Download className="size-5 shrink-0" aria-hidden="true" />
            <span>{t('downloadButton')}</span>
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={onExport}
            disabled={isExporting}
            className="neo-push min-h-12 border-2 border-black bg-yellow text-base font-extrabold text-black shadow-hard hover:bg-yellow hover:text-black disabled:opacity-50"
            data-testid="create-excel-button"
          >
            {isExporting ? (
              <>
                <Loader2
                  className="size-5 shrink-0 animate-spin"
                  aria-hidden="true"
                  data-testid="exporting-spinner"
                />
                <span>
                  {progressPhase === 'verifying-xlsx'
                    ? t('parsingVerifyingXlsx')
                    : t('parsingGeneratingXlsx')}
                </span>
              </>
            ) : (
              <>
                <FileCheck className="size-5 shrink-0" aria-hidden="true" />
                <span>{t('create')}</span>
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
