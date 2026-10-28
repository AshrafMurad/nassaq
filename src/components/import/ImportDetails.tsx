import { useTranslation } from 'react-i18next';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Ref } from 'react';

interface ImportDetailsProps {
  file: File;
  onClear: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

export function ImportDetails({ file, onClear, headingRef }: ImportDetailsProps) {
  const { t, i18n: instance } = useTranslation();
  const sizeText = new Intl.NumberFormat(instance.language).format(file.size);

  return (
    <div
      data-testid="import-details"
      className="neo-panel flex min-h-72 flex-col justify-center bg-card p-5 sm:p-6"
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="neo-focus rounded-sm text-sm text-muted-foreground"
      >
        {t('selectedFile')}
      </h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet
            className="size-8 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
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
        <Button
          variant="outline"
          onClick={onClear}
          data-testid="choose-another"
        >
          {t('new')}
        </Button>
      </div>
      <details className="mt-3 min-w-0">
        <summary className="control-feedback neo-control mt-1 min-h-11 cursor-pointer content-center bg-sage px-3 py-2 text-sm font-bold text-primary hover:bg-yellow active:bg-yellow">
          {t('showFullFilename')}
        </summary>
        <p className="px-2 pt-2 text-sm [overflow-wrap:anywhere]">
          <bdi dir="auto">{file.name}</bdi>
        </p>
      </details>
    </div>
  );
}
