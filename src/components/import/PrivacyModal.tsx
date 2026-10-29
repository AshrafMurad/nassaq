import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, X, HardDrive, EyeOff, Clock, Server, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyModal({ isOpen, onClose }: PrivacyModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    // If the click happened directly on the dialog backdrop (not its child content)
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border-2 border-black bg-cream p-0 text-black shadow-[8px_8px_0_0_#000] backdrop:bg-black/50 backdrop:backdrop-blur-xs open:animate-in open:fade-in open:zoom-in-95"
      aria-labelledby="privacy-modal-heading"
      data-testid="privacy-modal"
    >
      <div className="flex items-center justify-between border-b-2 border-black bg-yellow px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="size-6 text-black" aria-hidden="true" />
          <h2 id="privacy-modal-heading" className="font-display text-lg font-extrabold sm:text-xl">
            {t('privacyModalTitle')}
          </h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          aria-label={t('privacyModalClose')}
          data-testid="privacy-modal-close"
          className="size-9 p-0"
        >
          <X className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-4 p-5 sm:p-6 text-sm leading-relaxed">
        <section className="rounded-lg border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000]">
          <div className="flex items-start gap-3">
            <HardDrive className="size-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-base text-black mb-1">{t('privacyItemLocalTitle')}</h3>
              <p className="text-charcoal/90">{t('privacyItemLocalDesc')}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000]">
          <div className="flex items-start gap-3">
            <EyeOff className="size-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-base text-black mb-1">{t('privacyItemNoTrackTitle')}</h3>
              <p className="text-charcoal/90">{t('privacyItemNoTrackDesc')}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000]">
          <div className="flex items-start gap-3">
            <Clock className="size-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-base text-black mb-1">{t('privacyItemEphemeralTitle')}</h3>
              <p className="text-charcoal/90">{t('privacyItemEphemeralDesc')}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000]">
          <div className="flex items-start gap-3">
            <Server className="size-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-base text-black mb-1">{t('privacyItemHostingTitle')}</h3>
              <p className="text-charcoal/90">{t('privacyItemHostingDesc')}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000]">
          <div className="flex items-start gap-3">
            <Lock className="size-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-base text-black mb-1">{t('privacyItemSecurityTitle')}</h3>
              <p className="text-charcoal/90">{t('privacyItemSecurityDesc')}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="flex justify-end border-t-2 border-black bg-sage/30 px-5 py-3 sm:px-6">
        <Button
          variant="default"
          onClick={onClose}
          data-testid="privacy-modal-confirm"
          className="min-h-10 px-6"
        >
          {t('privacyModalClose')}
        </Button>
      </div>
    </dialog>
  );
}
