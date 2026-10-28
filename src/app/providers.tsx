import { useEffect, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import {
  DEFAULT_LOCALE,
  directionFor,
  i18n,
  isLocale,
  type Locale,
} from '@/i18n';

function currentLocale(language: string): Locale {
  return isLocale(language) ? language : DEFAULT_LOCALE;
}

function DocumentLocaleSync() {
  const { i18n: instance, t } = useTranslation();
  const locale = currentLocale(instance.language);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionFor(locale);
    document.title = t('htmlTitle');
  }, [locale, t]);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <DocumentLocaleSync />
      {children}
    </I18nextProvider>
  );
}
