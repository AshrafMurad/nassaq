import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar, type Translation } from './ar';
import { en } from './en';

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: Translation };
  }
}
