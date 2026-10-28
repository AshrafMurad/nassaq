import { useId, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudUpload } from 'lucide-react';

interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
}

export function FileDropzone({ onFileSelected }: FileDropzoneProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.item(0);
    if (file) onFileSelected(file);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      setDragActive(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !event.currentTarget.contains(event.relatedTarget)
    ) {
      setDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    handleFiles(event.dataTransfer?.files ?? null);
  };

  return (
    <div
      data-testid="dropzone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={
        dragActive
          ? 'rounded-2xl border-2 border-solid border-primary bg-accent/50 p-8 text-center shadow-md transition-shadow motion-safe:duration-200 sm:p-10'
          : 'rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center transition-shadow motion-safe:duration-200 sm:p-10'
      }
    >
      <CloudUpload className="mx-auto size-10 text-primary" aria-hidden="true" />
      <input
        id={inputId}
        data-testid="file-input"
        type="file"
        accept=".csv,.txt"
        className="peer sr-only"
        onChange={handleChange}
      />
      <label
        htmlFor={inputId}
        className="mt-4 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-sm outline-none transition-colors motion-safe:duration-200 hover:bg-primary/90 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50"
      >
        {t('choose')}
      </label>
      <p className="mt-3 text-sm text-muted-foreground">{t('drag')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('limits')}</p>
    </div>
  );
}
