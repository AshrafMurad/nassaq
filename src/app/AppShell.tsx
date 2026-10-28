import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Locale } from '@/i18n';

const REPOSITORY_URL = 'https://github.com/AshrafMurad/nassaq';

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function LanguageToggle() {
  const { i18n: instance, t } = useTranslation();
  const current: Locale = instance.language === 'en' ? 'en' : 'ar';
  const next: Locale = current === 'ar' ? 'en' : 'ar';

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void instance.changeLanguage(next)}
      aria-label={t('switchLanguage')}
      data-testid="language-toggle"
    >
      <Languages aria-hidden="true" />
      <span aria-hidden="true">{next === 'en' ? 'English' : 'العربية'}</span>
    </Button>
  );
}

function RepositoryLink() {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" asChild>
      <a
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('viewOnGithub')}
        data-testid="github-link"
      >
        <GithubMark className="size-4" />
        <span aria-hidden="true">GitHub</span>
      </a>
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t('skipToContent')}
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 64 64"
              className="size-7"
              aria-hidden="true"
              role="presentation"
            >
              <rect width="64" height="64" rx="14" fill="var(--primary)" />
              <path
                d="M18 21h28M18 32h28M18 43h28M25 14v36M39 14v36"
                stroke="var(--primary-foreground)"
                strokeWidth="4.5"
                strokeLinecap="round"
                opacity="0.94"
              />
            </svg>
            <span className="text-lg font-extrabold tracking-tight">
              {t('appName')}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <LanguageToggle />
            <RepositoryLink />
          </span>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-12"
      >
        {children}
      </main>
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted-foreground sm:px-6">
          <p>{t('privacy')}</p>
          <p>
            {t('appName')} ·{' '}
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
