/**
 * ImportDetails — Phase 4
 *
 * Shown after a file is selected. Manages the worker parse & export lifecycle:
 *  - Automatically starts a parse job when mounted with a new file.
 *  - Shows progress spinner during decoding / parsing.
 *  - Shows ENCODING_REVIEW notice when non-ASCII UTF-8 detected (non-blocking).
 *  - Shows DELIMITER_REVIEW selector when auto-detection is ambiguous.
 *  - When READY:
 *     - Displays EncodingSelector & DelimiterSelector for manual tuning (re-parses from raw bytes)
 *     - Displays HeaderModeToggle
 *     - Displays RiskSummary (breakdown of leading zeros, long IDs, date-shapes, formulas, etc.)
 *     - Displays DataPreviewTable (up to 20 rows, escaped safe text, cell risk badges, ColumnTypeSelector per column)
 *     - Displays ParseResultSummary (rows, columns, encoding, delimiter, uneven rows)
 *     - Displays DownloadAction (triggers safe XLSX generation, displays read-back verification result, enables download)
 *  - Shows ParseError when the worker returns an error.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkerClient } from '@/lib/worker-client';
import { delimiterLabel, DELIMITER_CANDIDATES } from '@/domain/delimiter';
import { EncodingSelector } from './EncodingSelector';
import { DelimiterSelector } from './DelimiterSelector';
import { HeaderModeToggle } from './HeaderModeToggle';
import { RiskSummary } from './RiskSummary';
import { DataPreviewTable } from './DataPreviewTable';
import { DownloadAction } from './DownloadAction';
import { triggerFileDownload, revokeDownloadUrl } from '@/lib/download';
import { updateColumnType, type ColumnType } from '@/app/import-state';
import type { Ref } from 'react';
import type {
  ParseSummary,
  WorkerMsgError,
  WorkerMsgDelimiterReview,
  WorkerMsgEncodingReview,
  SupportedEncoding,
  DelimiterChar,
  ProgressPhase,
} from '@/domain/protocol';
import type {
  ExportManifest,
  VerificationFailure,
  VerificationFailureReason,
} from '@/domain/export-manifest';

interface ImportDetailsProps {
  file: File;
  onClear: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

type ParseState =
  | { status: 'idle' }
  | { status: 'parsing'; phase: ProgressPhase }
  | { status: 'encoding-review'; msg: WorkerMsgEncodingReview; previewText: string }
  | { status: 'delimiter-review'; msg: WorkerMsgDelimiterReview }
  | { status: 'ready'; summary: ParseSummary }
  | { status: 'error'; err: WorkerMsgError };

type ExportState =
  | { status: 'idle' }
  | { status: 'exporting'; phase: ProgressPhase }
  | { status: 'verified'; buffer: ArrayBuffer; manifest: ExportManifest }
  | { status: 'failed'; failure: VerificationFailure };

export function ImportDetails({ file, onClear, headingRef }: ImportDetailsProps) {
  const { t, i18n: instance } = useTranslation();
  const sizeText = new Intl.NumberFormat(instance.language).format(file.size);

  const clientRef = useRef<WorkerClient | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const [parseState, setParseState] = useState<ParseState>({ status: 'idle' });
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const [encoding, setEncoding] = useState<SupportedEncoding>('utf-8');
  const [delimiter, setDelimiter] = useState<DelimiterChar | undefined>(undefined);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [columnTypes, setColumnTypes] = useState<Record<number, ColumnType>>({});

  const startParse = useCallback(
    (
      enc: SupportedEncoding,
      delim: DelimiterChar | undefined,
      header: boolean,
    ) => {
      if (!clientRef.current) {
        clientRef.current = new WorkerClient();
      }
      const client = clientRef.current;

      revokeDownloadUrl(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
      setExportState({ status: 'idle' });
      setParseState({ status: 'parsing', phase: 'decoding' });

      client.parse(
        file,
        { encoding: enc, delimiter: delim, firstRowIsHeader: header },
        {
          onProgress: (msg) => {
            if (msg.phase === 'generating-xlsx' || msg.phase === 'verifying-xlsx') {
              setExportState({ status: 'exporting', phase: msg.phase });
            } else {
              setParseState({ status: 'parsing', phase: msg.phase });
            }
          },
          onEncodingReview: (msg) => {
            setParseState({
              status: 'encoding-review',
              msg,
              previewText: msg.preview,
            });
          },
          onDelimiterReview: (msg) => {
            setParseState({ status: 'delimiter-review', msg });
          },
          onReady: (msg) => {
            setParseState({ status: 'ready', summary: msg.summary });
          },
          onExportReady: (msg) => {
            setExportState({
              status: 'verified',
              buffer: msg.buffer,
              manifest: msg.manifest,
            });
          },
          onError: (msg) => {
            if (msg.code === 'VERIFY_FAILED') {
              let failure: VerificationFailure = { reason: 'CORRUPT_XLSX' };
              if (msg.detail) {
                const parts = msg.detail.split(':');
                const reason = parts[0] as VerificationFailureReason;
                const row = parts[1] ? Number(parts[1]) : undefined;
                const column = parts[2] ? Number(parts[2]) : undefined;
                failure = { reason, row, column };
              }
              setExportState({ status: 'failed', failure });
            } else if (msg.code === 'EXPORT_FAILED') {
              setExportState({
                status: 'failed',
                failure: { reason: 'CORRUPT_XLSX' },
              });
            } else {
              setParseState({ status: 'error', err: msg });
            }
          },
        },
      );
    },
    [file],
  );

  // Auto-start parse on mount
  useEffect(() => {
    startParse(encoding, delimiter, firstRowIsHeader);
    return () => {
      revokeDownloadUrl(activeBlobUrlRef.current);
      clientRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const handleEncodingChange = (enc: SupportedEncoding) => {
    setEncoding(enc);
    setDelimiter(undefined);
    setColumnTypes({});
    startParse(enc, undefined, firstRowIsHeader);
  };

  const handleDelimiterConfirm = (delim: DelimiterChar) => {
    setDelimiter(delim);
    setColumnTypes({});
    startParse(encoding, delim, firstRowIsHeader);
  };

  const handleHeaderToggle = (header: boolean) => {
    setFirstRowIsHeader(header);
    setColumnTypes({});
    startParse(encoding, delimiter, header);
  };

  const handleEncodingConfirm = () => {
    startParse(encoding, delimiter, firstRowIsHeader);
  };

  const handleColumnTypeChange = (c: number, type: ColumnType) => {
    setColumnTypes((prev) => updateColumnType(prev, c, type));
    if (exportState.status !== 'idle') {
      revokeDownloadUrl(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
      setExportState({ status: 'idle' });
    }
  };

  const handleExport = () => {
    if (!clientRef.current || parseState.status !== 'ready') return;
    setExportState({ status: 'exporting', phase: 'generating-xlsx' });
    clientRef.current.exportXlsx(columnTypes, firstRowIsHeader);
  };

  const handleDownload = () => {
    if (exportState.status !== 'verified') return;
    const { url } = triggerFileDownload(exportState.buffer, file.name);
    activeBlobUrlRef.current = url;
  };

  function progressLabel(phase: ProgressPhase): string {
    switch (phase) {
      case 'decoding': return t('parsingDecoding');
      case 'detecting-delimiter': return t('parsingDetecting');
      case 'parsing': return t('parsingParsing');
      case 'validating': return t('parsingValidating');
      case 'generating-xlsx': return t('parsingGeneratingXlsx');
      case 'verifying-xlsx': return t('parsingVerifyingXlsx');
      default: return t('parsing');
    }
  }

  function errorMessage(err: WorkerMsgError): string {
    const d = err.detail ?? '';
    switch (err.code) {
      case 'DECODE_FAILED': return t('errorDecodeFailed');
      case 'MALFORMED_CSV': return t('errorMalformedCsv', { detail: d });
      case 'LIMIT_EXCEEDED': return t('errorLimitExceeded', { detail: d });
      case 'CELL_TOO_LONG': return t('errorCellTooLong', { detail: d });
      case 'UNSUPPORTED_FILE': return t('errorUnsupportedFile');
      case 'FILE_TOO_LARGE': return t('errorFileTooLarge');
      case 'NO_DATA_ROWS': return t('errorNoDataRows');
      case 'ZERO_COLUMNS': return t('errorZeroColumns');
      case 'EXPORT_FAILED': return t('errorExportFailed');
      case 'VERIFY_FAILED': return t('errorVerifyFailed', { detail: d });
      default: return t('badEncode');
    }
  }

  const activeDelimiter: DelimiterChar =
    delimiter ??
    (parseState.status === 'ready' ? parseState.summary.delimiter : ',');

  const hadBom =
    parseState.status === 'ready' ? parseState.summary.hadBom : false;

  return (
    <div data-testid="import-details" className="neo-panel flex flex-col overflow-hidden bg-card">
      {/* ── File identity row ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-bold tracking-tight text-charcoal outline-none sm:text-xl"
            data-testid="selected-file-heading"
          >
            {t('selectedFile')}
          </h2>
          <div className="mt-2 flex min-w-0 items-center gap-3">
            <FileSpreadsheet className="size-7 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold" title={file.name}>
                <bdi dir="auto" data-testid="file-name">
                  {file.name}
                </bdi>
              </p>
              <p
                className="mt-0.5 text-sm tabular-nums text-muted-foreground"
                data-testid="file-size"
                title={String(file.size)}
              >
                {sizeText} {t('bytesUnit')}
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onClear}
          data-testid="choose-another"
          className="min-h-11 shrink-0"
        >
          {t('new')}
        </Button>
      </div>

      {/* ── Settings controls: Encoding, Delimiter, Header ────────────── */}
      <div className="space-y-4 border-t border-black bg-card px-5 py-4 sm:px-6">
        <EncodingSelector
          value={encoding}
          hadBom={hadBom}
          onChange={handleEncodingChange}
          disabled={parseState.status === 'parsing' || exportState.status === 'exporting'}
        />

        <DelimiterSelector
          value={activeDelimiter}
          onChange={handleDelimiterConfirm}
          disabled={parseState.status === 'parsing' || exportState.status === 'exporting'}
        />

        <div className="pt-1">
          <HeaderModeToggle
            checked={firstRowIsHeader}
            onChange={handleHeaderToggle}
            disabled={parseState.status === 'parsing' || exportState.status === 'exporting'}
          />
        </div>
      </div>

      {/* ── Worker processing & interactive review panel ──────────────── */}
      <div className="border-t border-black px-5 py-5 sm:px-6">
        {parseState.status === 'idle' && null}

        {parseState.status === 'parsing' && (
          <div className="flex items-center gap-3 py-4" role="status" aria-live="polite">
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold text-charcoal">
              {progressLabel(parseState.phase)}
            </span>
          </div>
        )}

        {parseState.status === 'encoding-review' && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-3"
            data-testid="encoding-review"
          >
            <p className="text-sm font-bold text-charcoal">
              {t('encodingReviewTitle')}
            </p>
            <p className="text-sm text-charcoal">{t('encodingReviewNonAscii')}</p>
            <pre
              className="max-h-24 overflow-auto rounded-sm border border-black bg-sage p-2 text-xs [overflow-wrap:anywhere]"
              dir="auto"
              aria-label="Encoding preview"
            >
              <bdi>{parseState.previewText}</bdi>
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleEncodingConfirm}
                data-testid="encoding-confirm"
              >
                {t('encodingConfirm')}
              </Button>
            </div>
          </div>
        )}

        {parseState.status === 'delimiter-review' && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-3"
            data-testid="delimiter-review"
          >
            <p className="text-sm font-bold text-charcoal">
              {t('delimiterReviewTitle')}
            </p>
            <p className="text-sm text-charcoal">
              {parseState.msg.reason === 'tie' && t('delimiterReviewTie')}
              {parseState.msg.reason === 'all-single-column' && t('delimiterReviewSingleCol')}
              {(parseState.msg.reason === 'too-few-records' ||
                parseState.msg.reason === 'no-multi-column') &&
                t('delimiterReviewFewRecords')}
            </p>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t('delimiterReviewTitle')}
            >
              {DELIMITER_CANDIDATES.map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelimiterConfirm(d)}
                  data-testid={`delimiter-option-${d === '\t' ? 'tab' : d}`}
                >
                  {delimiterLabel(d)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {parseState.status === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-3 py-2"
            data-testid="parse-error"
          >
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-red-600"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-charcoal">{errorMessage(parseState.err)}</p>
          </div>
        )}

        {parseState.status === 'ready' && (
          <div className="space-y-6">
            {/* 1. Risk Summary Strip */}
            <RiskSummary summary={parseState.summary} />

            {/* 2. Interactive Data Preview Table with Column Type Selectors */}
            <DataPreviewTable
              summary={parseState.summary}
              columnTypes={columnTypes}
              onColumnTypeChange={handleColumnTypeChange}
            />

            {/* 3. Parse Metadata Statistics */}
            <ParseResultSummary summary={parseState.summary} />

            {/* 4. Safe Excel Action Area with Verification and Download */}
            <DownloadAction
              onExport={handleExport}
              onDownload={handleDownload}
              isExporting={exportState.status === 'exporting'}
              isVerified={exportState.status === 'verified'}
              manifest={
                exportState.status === 'verified'
                  ? exportState.manifest
                  : undefined
              }
              failure={
                exportState.status === 'failed'
                  ? exportState.failure
                  : undefined
              }
              progressPhase={
                exportState.status === 'exporting'
                  ? exportState.phase
                  : undefined
              }
            />
          </div>
        )}
      </div>

      {/* ── Full filename disclosure ──────────────────────────────────── */}
      <details className="min-w-0 max-w-full border-t border-black px-5 pb-4 sm:px-6">
        <summary className="control-feedback neo-control mt-3 min-h-11 cursor-pointer content-center bg-sage px-3 py-2 text-sm font-bold text-primary hover:bg-yellow active:bg-yellow">
          {t('showFullFilename')}
        </summary>
        <p className="break-all px-2 pt-2 text-sm [overflow-wrap:anywhere]">
          <bdi dir="auto">{file.name}</bdi>
        </p>
      </details>
    </div>
  );
}

// ── ParseResultSummary ────────────────────────────────────────────────────

interface ParseResultSummaryProps {
  summary: ParseSummary;
}

function ParseResultSummary({ summary }: ParseResultSummaryProps) {
  const { t } = useTranslation();

  const delimLabel = summary.delimiter === '\t'
    ? t('delimiterTab')
    : summary.delimiter === ','
      ? t('delimiterComma')
      : summary.delimiter === ';'
        ? t('delimiterSemicolon')
        : t('delimiterPipe');

  const encodingLabel = summary.encoding === 'utf-8'
    ? `UTF-8${summary.hadBom ? ' (BOM)' : ''}`
    : summary.encoding === 'windows-1256'
      ? 'Windows-1256'
      : 'ISO-8859-6';

  return (
    <div className="rounded-sm border border-black/20 bg-muted/20 p-4 space-y-3" data-testid="parse-result">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-5 shrink-0 text-green-700" aria-hidden="true" />
        <p className="text-sm font-bold text-charcoal">{t('parseResultTitle')}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4 sm:text-sm">
        <div>
          <dt className="text-muted-foreground">{t('parseRows')}</dt>
          <dd className="font-semibold tabular-nums" data-testid="parse-data-rows">
            {summary.dataRows.toLocaleString()}
          </dd>
        </div>

        <div>
          <dt className="text-muted-foreground">{t('parseColumns')}</dt>
          <dd className="font-semibold tabular-nums" data-testid="parse-columns">
            {summary.columns}
          </dd>
        </div>

        <div>
          <dt className="text-muted-foreground">{t('parseEncoding')}</dt>
          <dd className="font-semibold" data-testid="parse-encoding">{encodingLabel}</dd>
        </div>

        <div>
          <dt className="text-muted-foreground">{t('parseDelimiter')}</dt>
          <dd className="font-semibold" data-testid="parse-delimiter">{delimLabel}</dd>
        </div>

        <div className="col-span-2 sm:col-span-4 flex items-center gap-2 pt-1 border-t border-black/10">
          <dt className="text-muted-foreground">{t('parseHasHeader')}:</dt>
          <dd className="font-semibold" data-testid="parse-has-header">
            {summary.firstRowIsHeader ? t('parseYes') : t('parseNo')}
          </dd>
        </div>
      </dl>

      {summary.hasUnevenRows && (
        <p
          role="alert"
          className="flex items-start gap-2 text-xs sm:text-sm text-amber-700"
          data-testid="uneven-rows-warning"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('parseUnevenWarning')}
        </p>
      )}
    </div>
  );
}
