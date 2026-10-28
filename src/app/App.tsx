import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { AppShell } from './AppShell';
import { FileDropzone } from '@/components/import/FileDropzone';
import { ImportDetails } from '@/components/import/ImportDetails';

export function App() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);

  return (
    <AppShell>
      <section aria-labelledby="hero-heading" className="text-center">
        <h1
          id="hero-heading"
          className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {t('title')}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {t('tagline')}
        </p>
      </section>

      <section aria-label={t('choose')} className="mx-auto mt-10 max-w-xl">
        {file ? (
          <ImportDetails file={file} onClear={() => setFile(null)} />
        ) : (
          <FileDropzone onFileSelected={setFile} />
        )}
        <p aria-live="polite" className="sr-only">
          {file ? t('fileSelectedAnnouncement', { name: file.name }) : ''}
        </p>
      </section>

      <section aria-labelledby="how-heading" className="mx-auto mt-14 max-w-xl">
        <h2 id="how-heading" className="text-xl font-bold tracking-tight">
          {t('howTitle')}
        </h2>
        <ol className="mt-5 list-decimal space-y-3 ps-6 marker:font-semibold marker:text-primary">
          <li className="text-muted-foreground">{t('how1')}</li>
          <li className="text-muted-foreground">{t('how2')}</li>
          <li className="text-muted-foreground">{t('how3')}</li>
        </ol>
      </section>

      <section
        aria-labelledby="privacy-heading"
        className="mx-auto mt-12 max-w-xl"
      >
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent/40 p-5">
          <ShieldCheck
            className="mt-0.5 size-6 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <h2
              id="privacy-heading"
              className="font-bold tracking-tight text-accent-foreground"
            >
              {t('privacyTitle')}
            </h2>
            <p className="mt-1 font-medium text-accent-foreground">
              {t('privacy')}
            </p>
            <p className="mt-1 text-sm text-accent-foreground/80">
              {t('privacyBody')}
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
