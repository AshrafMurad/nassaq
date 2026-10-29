import { useTranslation } from 'react-i18next';
import { ColumnTypeSelector } from './ColumnTypeSelector';
import { scanCellRisks } from '@/domain/risks';
import type { ParseSummary } from '@/domain/protocol';
import type { RiskCategory } from '@/domain/risks';

interface DataPreviewTableProps {
  summary: ParseSummary;
  columnTypes: Record<number, 'text' | 'number'>;
  onColumnTypeChange: (colIndex: number, type: 'text' | 'number') => void;
  disabled?: boolean;
}

export function columnIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export function DataPreviewTable({
  summary,
  columnTypes,
  onColumnTypeChange,
  disabled = false,
}: DataPreviewTableProps) {
  const { t } = useTranslation();

  const riskLabel = (category: RiskCategory): string => {
    switch (category) {
      case 'LEADING_ZERO': return t('riskLeadingZero');
      case 'LONG_NUMBER': return t('riskLongNumber');
      case 'DATE_SHAPED': return t('riskDateShaped');
      case 'FORMULA_LIKE': return t('riskFormulaLike');
      case 'SCIENTIFIC_NOTATION': return t('riskScientific');
      case 'DECIMAL_SEPARATOR_AMBIGUITY': return t('riskDecimalComma');
      case 'MIXED_DIRECTION': return t('riskMixedDirection');
      default: return category;
    }
  };

  const startRowNumber = summary.firstRowIsHeader ? 2 : 1;

  return (
    <div className="space-y-2" data-testid="data-preview-table-container">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-charcoal">{t('previewHeading')}</h3>
        <span className="text-xs text-muted-foreground">
          {t('previewCaption', {
            shown: summary.previewRows.length,
            total: summary.dataRows,
          })}
        </span>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-label={t('preview')}
        data-testid="preview-scroll-area"
        className="neo-control neo-focus max-h-96 overflow-auto rounded-sm border-2 border-black bg-white"
      >
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">
            {t('previewCaption', {
              shown: summary.previewRows.length,
              total: summary.dataRows,
            })}
          </caption>
          <thead>
            <tr className="border-b-2 border-black bg-sage">
              {/* Row number column header */}
              <th
                scope="col"
                className="w-12 border-r border-black p-2 text-center font-bold text-charcoal"
              >
                #
              </th>
              {Array.from({ length: summary.columns }, (_, c) => {
                const letter = columnIndexToLetter(c);
                const meta = summary.columnMeta[c] ?? {
                  index: c,
                  label: '',
                  nonEmptyCount: 0,
                  isNumericEligible: false,
                  riskCounts: {
                    LEADING_ZERO: 0,
                    LONG_NUMBER: 0,
                    DATE_SHAPED: 0,
                    SCIENTIFIC_NOTATION: 0,
                    DECIMAL_SEPARATOR_AMBIGUITY: 0,
                    FORMULA_LIKE: 0,
                    MIXED_DIRECTION: 0,
                  },
                };
                const hasLabel = Boolean(meta.label);

                return (
                  <th
                    key={c}
                    scope="col"
                    data-testid={`column-header-${c}`}
                    className="min-w-44 border-r border-black p-2.5 align-top font-bold text-charcoal last:border-r-0"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="rounded bg-yellow px-1.5 py-0.5 font-extrabold text-black">
                        {letter}
                      </span>
                      {hasLabel && (
                        <span
                          className="truncate text-xs font-semibold"
                          title={meta.label}
                        >
                          <bdi dir="auto">{meta.label}</bdi>
                        </span>
                      )}
                    </div>

                    <ColumnTypeSelector
                      columnIndex={c}
                      columnLetter={letter}
                      currentType={columnTypes[c] ?? 'text'}
                      meta={meta}
                      onChange={(type) => onColumnTypeChange(c, type)}
                      disabled={disabled}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {summary.previewRows.map((row, rIdx) => {
              const rowNum = startRowNumber + rIdx;

              return (
                <tr
                  key={rIdx}
                  data-testid={`preview-row-${rIdx}`}
                  className="border-b border-black/20 hover:bg-yellow/20"
                >
                  <th
                    scope="row"
                    className="border-r border-black bg-sage/40 p-2 text-center font-mono text-muted-foreground select-none"
                  >
                    {rowNum}
                  </th>
                  {Array.from({ length: summary.columns }, (_, cIdx) => {
                    const cellVal = row[cIdx] ?? '';
                    const isEmpty = cellVal === '';
                    const hasNewline = cellVal.includes('\n') || cellVal.includes('\r');
                    const hasSurroundingSpace =
                      cellVal.startsWith(' ') || cellVal.endsWith(' ');
                    const risks = scanCellRisks(cellVal);

                    return (
                      <td
                        key={cIdx}
                        data-testid={`cell-${rIdx}-${cIdx}`}
                        className="max-w-xs border-r border-black/20 p-2 align-top text-charcoal last:border-r-0"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                            {isEmpty ? (
                              <span className="italic text-muted-foreground select-none">
                                {t('emptyCellLabel')}
                              </span>
                            ) : (
                              <bdi dir="auto">{cellVal}</bdi>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {hasNewline && (
                              <span
                                title={t('newlineIndicator')}
                                aria-label={t('newlineIndicator')}
                                className="rounded bg-charcoal/10 px-1 font-mono text-[10px] text-charcoal"
                              >
                                ↵
                              </span>
                            )}
                            {hasSurroundingSpace && !isEmpty && (
                              <span
                                title={t('whitespaceIndicator')}
                                aria-label={t('whitespaceIndicator')}
                                className="rounded bg-charcoal/10 px-1 font-mono text-[10px] text-charcoal"
                              >
                                ␣
                              </span>
                            )}
                            {risks.length > 0 && (
                              <span
                                title={risks.map(riskLabel).join(', ')}
                                aria-label={risks.map(riskLabel).join(', ')}
                                data-testid={`cell-risk-${rIdx}-${cIdx}`}
                                className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black"
                              >
                                !
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-end text-[11px] text-muted-foreground">{t('previewScrollHint')}</p>
    </div>
  );
}
