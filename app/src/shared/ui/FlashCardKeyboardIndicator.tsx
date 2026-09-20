import { useTranslation } from 'react-i18next';

const kbdClass =
  'bg-surface-light border border-border-medium rounded px-2 py-0.5 font-mono text-[0.75rem] text-text shadow-[0_1px_2px_rgba(0,0,0,0.2)]';

export interface FlashCardKeyboardIndicatorProps {
  showDelete?: boolean;
  className?: string;
}

export function FlashCardKeyboardIndicator({
  showDelete = true,
  className = '',
}: FlashCardKeyboardIndicatorProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`inline-flex bg-surface/90 px-5 py-2.5 rounded-[20px] shadow-[0_4px_12px_rgba(0,0,0,0.3)] text-[0.85rem] text-text-light backdrop-blur-sm gap-4 items-center border border-border animate-fade-in max-[768px]:hidden ${className}`}
      role="status"
      aria-label={t('flashcard.move')}
    >
      <div className="flex items-center gap-1.5">
        <kbd className={kbdClass}>&larr;</kbd>
        <kbd className={kbdClass}>&rarr;</kbd>
        <span>{t('flashcard.move')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <kbd className={kbdClass}>Space</kbd>
        <span>{t('flashcard.flip')}</span>
      </div>
      {showDelete && (
        <div className="flex items-center gap-1.5">
          <kbd className={kbdClass}>Del</kbd>
          <span>{t('flashcard.delete')}</span>
        </div>
      )}
    </div>
  );
}
