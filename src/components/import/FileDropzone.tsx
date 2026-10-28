import { useId, useState, type ChangeEvent, type DragEvent, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudUpload } from 'lucide-react';

interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  inputRef?: Ref<HTMLInputElement>;
}

export function FileDropzone({ onFileSelected, inputRef }: FileDropzoneProps) {
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
          ? 'neo-panel min-h-72 bg-sage p-6 text-center sm:p-10'
          : 'neo-panel min-h-72 bg-card p-6 text-center sm:p-10'
      }
    >
      <CloudUpload className="mx-auto size-12 text-primary" aria-hidden="true" />
      <input
        id={inputId}
        ref={inputRef}
        data-testid="file-input"
        type="file"
        accept=".csv,.txt"
        className="peer sr-only"
        onChange={handleChange}
      />
      <label
        htmlFor={inputId}
        className="control-feedback neo-control neo-push mt-4 inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 bg-primary px-5 py-3 font-bold text-primary-foreground hover:bg-charcoal active:bg-charcoal sm:w-auto"
      >
        {t('choose')}
      </label>
      <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
        {dragActive ? t('dropReady') : t('drag')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('limits')}</p>
    </div>
  );
}
