import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { AppShell } from './AppShell';
import { FileDropzone } from '@/components/import/FileDropzone';
import { ImportDetails } from '@/components/import/ImportDetails';

export function App() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusPending = useRef(false);

  const changeFile = (next: File | null) => {
    focusPending.current = true;
    setFile(next);
  };

  useLayoutEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    const target = file ? headingRef.current : inputRef.current;
    target?.focus({ preventScroll: true });
  }, [file]);

  return (
    <AppShell>
      <section aria-labelledby="hero-heading" className="neo-intro">
        <h1
          id="hero-heading"
          className="neo-heading"
        >
          {t('title')}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-charcoal sm:text-lg">
          {t('tagline')}
        </p>
      </section>

      <section aria-label={t('choose')} className="mx-auto mt-8 max-w-xl">
        {file ? (
          <ImportDetails
            file={file}
            headingRef={headingRef}
            onClear={() => changeFile(null)}
          />
        ) : (
          <FileDropzone inputRef={inputRef} onFileSelected={changeFile} />
        )}
        <p aria-live="polite" className="sr-only">
          {file ? t('fileSelectedAnnouncement', { name: file.name }) : ''}
        </p>
      </section>

      <section aria-labelledby="how-heading" className="neo-panel mx-auto mt-10 max-w-xl bg-charcoal p-6 text-white sm:p-8">
        <h2 id="how-heading" className="text-2xl tracking-tight text-yellow sm:text-3xl">
          {t('howTitle')}
        </h2>
        <ol role="list" className="neo-steps">
          <li>{t('how1')}</li>
          <li>{t('how2')}</li>
          <li>{t('how3')}</li>
        </ol>
      </section>

      <section
        aria-labelledby="privacy-heading"
        className="neo-panel mx-auto mt-10 max-w-xl bg-sage"
      >
        <div className="flex items-start gap-4 p-6 sm:p-8">
          <ShieldCheck
            className="mt-0.5 size-8 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <h2
              id="privacy-heading"
              className="text-2xl tracking-tight text-accent-foreground"
            >
              {t('privacyTitle')}
            </h2>
            <p className="mt-3 font-bold text-accent-foreground">
              {t('privacy')}
            </p>
            <p className="mt-2 text-sm text-charcoal">
              {t('privacyBody')}
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
