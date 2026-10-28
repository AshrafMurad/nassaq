import { useTranslation } from 'react-i18next';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImportDetailsProps {
  file: File;
  onClear: () => void;
}

export function ImportDetails({ file, onClear }: ImportDetailsProps) {
  const { t, i18n: instance } = useTranslation();
  const sizeText = new Intl.NumberFormat(instance.language).format(file.size);

  return (
    <div
      data-testid="import-details"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <p className="text-sm font-medium text-muted-foreground">
        {t('selectedFile')}
      </p>
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
    </div>
  );
}
