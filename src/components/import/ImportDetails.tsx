/**
 * ImportDetails — Phase 4 + Phase 6
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
 *     - Displays the Phase 6 repair panel: bounded suggestion list, staged diff
 *       preview with explicit bulk confirmation, per-cell manual editing with
 *       re-validation feedback, and bounded Undo/Redo (nothing changes without
 *       an explicit user confirmation; docs/04 §1a)
 *     - Displays DataPreviewTable (up to 20 rows, escaped safe text, cell risk badges, ColumnTypeSelector per column)
 *     - Displays ParseResultSummary (rows, columns, encoding, delimiter, uneven rows)
 *     - Displays DownloadAction (triggers safe XLSX generation over original +
 *       approved diffs, displays read-back verification result, enables download)
 *  - Changing encoding/delimiter/header with confirmed diffs warns before
 *    discarding them (re-parse from raw bytes).
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
import { delimiterLabelKey, DELIMITER_CANDIDATES } from '@/domain/delimiter';
import { EncodingSelector } from './EncodingSelector';
import { DelimiterSelector } from './DelimiterSelector';
import { HeaderModeToggle } from './HeaderModeToggle';
import { RiskSummary } from './RiskSummary';
import { DataPreviewTable } from './DataPreviewTable';
import { RepairSuggestions } from './RepairSuggestions';
import { RepairStagedPreview } from './RepairStagedPreview';
import { RepairHistory } from './RepairHistory';
import { DownloadAction } from './DownloadAction';
import { triggerFileDownload, revokeDownloadUrl } from '@/lib/download';
import { updateColumnType, type ColumnType } from '@/app/import-state';
import {
  createRepairState,
  stageSuggestion,
  stageEdit,
  unstageCell,
  clearStaged,
  confirmStaged,
  rejectSuggestion,
  undo as undoRepairs,
  redo as redoRepairs,
  approvedEdits,
  confirmedCount,
  stagedCount,
  historyFull,
  clearRepairs,
  type RepairState,
} from '@/app/repair-state';
import type { CellEdit } from '@/domain/repairs';
import type { SuggestionItem } from '@/domain/suggestions';
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
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);

  const [parseState, setParseState] = useState<ParseState>({ status: 'idle' });
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const [encoding, setEncoding] = useState<SupportedEncoding>('utf-8');
  const [delimiter, setDelimiter] = useState<DelimiterChar | undefined>(undefined);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [columnTypes, setColumnTypes] = useState<Record<number, ColumnType>>({});

  // ── Phase 6: repair workflow state ────────────────────────────────────
  const [repairState, setRepairState] = useState<RepairState>(createRepairState);
  /** Ref mirror so worker callbacks always read the current repair state. */
  const repairStateRef = useRef<RepairState>(repairState);
  useEffect(() => {
    repairStateRef.current = repairState;
  }, [repairState]);
  /** True while an APPLY_EDITS sync is in flight (blocks further mutations). */
  const [editsPending, setEditsPending] = useState(false);
  /** Last RepairState whose diff list the worker accepted (error rollback). */
  const lastSyncedRepairRef = useRef<RepairState>(createRepairState());
  /** Localized polite announcement for the repair live region. */
  const [repairLive, setRepairLive] = useState('');
  /** Localized repair error (EDIT_CONFLICT / EDIT_INVALID). */
  const [repairError, setRepairError] = useState<string | null>(null);
  /** Pending re-parse action awaiting explicit discard confirmation. */
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);

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
          onEditsApplied: (msg) => {
            setEditsPending(false);
            setParseState({ status: 'ready', summary: msg.summary });
            lastSyncedRepairRef.current = repairStateRef.current;
            setRepairError(null);
            setRepairLive(
              t('repairAnnounceApplied', { count: msg.appliedCount }),
            );
          },
          onError: (msg) => {
            if (msg.code === 'EDIT_CONFLICT' || msg.code === 'EDIT_INVALID') {
              // Fail closed: roll the UI back to the last worker-confirmed
              // repair state; no value was changed by the rejected batch.
              setEditsPending(false);
              setRepairState(lastSyncedRepairRef.current);
              setRepairLive(
                msg.code === 'EDIT_CONFLICT'
                  ? t('errorEditConflict')
                  : t('errorEditInvalid', { detail: msg.detail ?? '' }),
              );
              setRepairError(
                msg.code === 'EDIT_CONFLICT'
                  ? t('errorEditConflict')
                  : t('errorEditInvalid', { detail: msg.detail ?? '' }),
              );
              return;
            }
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
    // A different file invalidates every diff (docs/04 §1a-7).
    const fresh = clearRepairs();
    setRepairState(fresh);
    lastSyncedRepairRef.current = fresh;
    setRepairError(null);
    setRepairLive('');
    setPendingDiscard(null);
    startParse(encoding, delimiter, firstRowIsHeader);
    return () => {
      revokeDownloadUrl(activeBlobUrlRef.current);
      clientRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // U-10 (docs/05 §7): move keyboard/AT focus to the blocking error heading
  // whenever the parse state enters error.
  useEffect(() => {
    if (parseState.status === 'error') {
      errorHeadingRef.current?.focus();
    }
  }, [parseState]);

  // ── Phase 6: repair sync ────────────────────────────────────────────────
  /**
   * Sends the COMPLETE approved diff list to the worker (APPLY_EDITS).
   * Undo/redo reuse this path: the desired list is always sent in full, so
   * the worker's effective table can never drift from the confirmed UI state.
   */
  const syncEdits = useCallback(
    (state: RepairState) => {
      const client = clientRef.current;
      if (!client) return;
      setEditsPending(true);
      const sent = client.applyEdits(approvedEdits(state));
      if (!sent) setEditsPending(false);
    },
    [],
  );

  const totalRepairCount = stagedCount(repairState) + confirmedCount(repairState);

  /** Runs a re-parse-triggering change; warns first when diffs would be lost. */
  const runWithDiscardGuard = (action: () => void) => {
    if (totalRepairCount === 0) {
      action();
      return;
    }
    setPendingDiscard(() => action);
  };

  const confirmDiscard = () => {
    const action = pendingDiscard;
    const fresh = clearRepairs();
    setRepairState(fresh);
    lastSyncedRepairRef.current = fresh;
    setRepairError(null);
    setRepairLive('');
    setPendingDiscard(null);
    action?.();
  };

  const cancelDiscard = () => {
    setPendingDiscard(null);
  };

  const handleEncodingChange = (enc: SupportedEncoding) => {
    runWithDiscardGuard(() => {
      setEncoding(enc);
      setDelimiter(undefined);
      setColumnTypes({});
      startParse(enc, undefined, firstRowIsHeader);
    });
  };

  const handleDelimiterConfirm = (delim: DelimiterChar) => {
    runWithDiscardGuard(() => {
      setDelimiter(delim);
      setColumnTypes({});
      startParse(encoding, delim, firstRowIsHeader);
    });
  };

  const handleHeaderToggle = (header: boolean) => {
    runWithDiscardGuard(() => {
      setFirstRowIsHeader(header);
      setColumnTypes({});
      startParse(encoding, delimiter, header);
    });
  };

  const handleEncodingConfirm = () => {
    startParse(encoding, delimiter, firstRowIsHeader);
  };

  // ── Phase 6: repair actions ─────────────────────────────────────────────
  // Fail-closed bounding (docs/04 §1a-7): once the history is full, further
  // edits are refused until undo frees space or a re-parse resets.
  const repairFull = historyFull(repairState);

  const handleStageSuggestion = (s: SuggestionItem) => {
    if (editsPending || repairFull) return;
    setRepairState((prev) => stageSuggestion(prev, s));
    setRepairError(null);
  };

  const handleUnstageCell = (row: number, col: number) => {
    if (editsPending) return;
    setRepairState((prev) => unstageCell(prev, row, col));
  };

  const handleRejectSuggestion = (id: string) => {
    if (editsPending) return;
    // Rejecting a suggestion changes nothing (docs/04 §1a-3).
    setRepairState((prev) => rejectSuggestion(prev, id));
  };

  const handleClearStaged = () => {
    if (editsPending) return;
    setRepairState((prev) => clearStaged(prev));
  };

  const handleConfirmStaged = () => {
    if (editsPending) return;
    const next = confirmStaged(repairState);
    setRepairState(next);
    syncEdits(next);
  };

  const handleManualEdit = (edit: CellEdit) => {
    if (editsPending || repairFull) return;
    // A manually typed value is confirmed by its explicit per-cell Confirm;
    // it becomes its own undo/redo transaction.
    const staged = stageEdit(repairState, edit);
    const next = confirmStaged(staged);
    setRepairState(next);
    syncEdits(next);
  };

  const handleUndo = () => {
    if (editsPending) return;
    const next = undoRepairs(repairState);
    if (next === repairState) return;
    setRepairState(next);
    syncEdits(next);
    setRepairLive(t('repairAnnounceUndone'));
  };

  const handleRedo = () => {
    if (editsPending) return;
    const next = redoRepairs(repairState);
    if (next === repairState) return;
    setRepairState(next);
    syncEdits(next);
    setRepairLive(t('repairAnnounceRedone'));
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
    // Block export while an edit sync is in flight so the workbook is always
    // generated from a worker-confirmed effective table (docs/04 §1a-5).
    if (editsPending) return;
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
      case 'COLUMN_COUNT_MISMATCH': return t('errorColumnCountMismatch', { detail: d });
      case 'LIMIT_EXCEEDED': return t('errorLimitExceeded', { detail: d });
      case 'CELL_TOO_LONG': return t('errorCellTooLong', { detail: d });
      case 'UNSUPPORTED_FILE': return t('errorUnsupportedFile');
      case 'FILE_TOO_LARGE': return t('errorFileTooLarge');
      case 'EMPTY_FILE': return t('errorEmptyFile');
      case 'WORKER_UNAVAILABLE': return t('errorWorkerUnavailable');
      case 'NO_DATA_ROWS': return t('errorNoDataRows');
      case 'ZERO_COLUMNS': return t('errorZeroColumns');
      case 'EXPORT_FAILED': return t('errorExportFailed');
      case 'VERIFY_FAILED': return t('errorVerifyFailed', { detail: d });
      case 'EDIT_CONFLICT': return t('errorEditConflict');
      case 'EDIT_INVALID': return t('errorEditInvalid', { detail: d });
      default: return t('badEncode');
    }
  }

  const activeDelimiter: DelimiterChar =
    delimiter ??
    (parseState.status === 'ready' ? parseState.summary.delimiter : ',');

  const hadBom =
    parseState.status === 'ready' ? parseState.summary.hadBom : false;

  // ── Phase 6: derived repair view data ───────────────────────────────────
  const stagedList = Object.values(repairState.staged);
  const stagedKeys: ReadonlySet<string> = new Set(
    stagedList.map((e) => `${e.row}:${e.col}`),
  );
  const editedCellKeys: ReadonlySet<string> = new Set([
    ...approvedEdits(repairState).map((e) => `${e.row}:${e.col}`),
    ...stagedList.map((e) => `${e.row}:${e.col}`),
  ]);

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
        {pendingDiscard && (
          <div
            role="alert"
            data-testid="repair-discard-warning"
            className="neo-control rounded-sm border-2 border-black bg-yellow p-3"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-charcoal">
                  {t('repairDiscardWarningTitle')}
                </p>
                <p className="mt-1 text-xs text-charcoal">
                  {t('repairDiscardWarningBody', { count: totalRepairCount })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={confirmDiscard}
                    data-testid="repair-discard-confirm"
                    className="min-h-9"
                  >
                    {t('repairDiscardConfirm')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelDiscard}
                    data-testid="repair-discard-cancel"
                    className="min-h-9"
                  >
                    {t('repairDiscardCancel')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

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
            {/* U-8 (docs/05 §4): Cancel is available while reading/parsing.
                Cancelling resets to the fresh start flow; the unmount cleanup
                terminates the worker and revokes any download URL. */}
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              data-testid="cancel-button"
              className="ms-auto min-h-11"
            >
              {t('cancel')}
            </Button>
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
                  {t(delimiterLabelKey(d))}
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
            <h3
              ref={errorHeadingRef}
              tabIndex={-1}
              data-testid="parse-error-heading"
              className="text-sm font-bold text-charcoal outline-none"
            >
              {errorMessage(parseState.err)}
            </h3>
          </div>
        )}

        {parseState.status === 'ready' && (
          <div className="space-y-6">
            {/* 1. Risk Summary Strip */}
            <RiskSummary summary={parseState.summary} />

            {/* 2. Phase 6: Repair workflow (explicit confirmed diffs only) */}
            <section
              aria-label={t('repairTitle')}
              data-testid="repair-panel"
              className="space-y-3 rounded-sm border-2 border-black bg-white p-4"
            >
              <div>
                <h3 className="text-sm font-bold text-charcoal">{t('repairTitle')}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('repairSubtitle')}
                </p>
              </div>

              <RepairHistory
                confirmedTransactions={confirmedCount(repairState)}
                canUndo={repairState.history.approved.length > 0}
                canRedo={repairState.history.redo.length > 0}
                onUndo={handleUndo}
                onRedo={handleRedo}
                disabled={editsPending}
                liveMessage={repairLive}
              />

              {repairError && (
                <p
                  role="alert"
                  data-testid="repair-error"
                  className="flex items-start gap-2 rounded-sm border border-black bg-yellow/40 p-2 text-xs font-bold text-charcoal"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden="true" />
                  {repairError}
                </p>
              )}

              {repairFull && (
                <p
                  role="alert"
                  data-testid="repair-history-full"
                  className="rounded-sm border border-black bg-yellow/40 p-2 text-xs font-bold text-charcoal"
                >
                  {t('repairHistoryFull')}
                </p>
              )}

              <RepairStagedPreview
                staged={stagedList}
                onConfirm={handleConfirmStaged}
                onClear={handleClearStaged}
                onUnstage={(edit) => handleUnstageCell(edit.row, edit.col)}
                disabled={editsPending || repairFull}
              />

              <RepairSuggestions
                suggestions={parseState.summary.suggestions.items}
                total={parseState.summary.suggestions.total}
                rejected={repairState.rejected}
                stagedKeys={stagedKeys}
                onStage={handleStageSuggestion}
                onReject={(s) => handleRejectSuggestion(s.id)}
                disabled={editsPending || repairFull}
              />
            </section>

            {/* 3. Interactive Data Preview Table with Column Type Selectors */}
            <DataPreviewTable
              summary={parseState.summary}
              columnTypes={columnTypes}
              onColumnTypeChange={handleColumnTypeChange}
              onConfirmEdit={handleManualEdit}
              editedCells={editedCellKeys}
            />

            {/* 4. Parse Metadata Statistics */}
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

            {/* U-8 (docs/05 §4): Cancel is available while generating/verifying.
                Cancelling resets to the fresh start flow (no stale results). */}
            {exportState.status === 'exporting' && (
              <div className="flex justify-start border-t border-black/10 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  data-testid="cancel-button"
                  className="min-h-11"
                >
                  {t('cancel')}
                </Button>
              </div>
            )}
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
