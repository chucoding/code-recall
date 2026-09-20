import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/shared/lib/navigationStore';
import Card from '@/shared/ui/AppCard';
import { Button } from '@/shared/ui/button';
import { ClipboardList, Settings } from 'lucide-react';

const NoDataView: React.FC = () => {
  const { t } = useTranslation();
  const { navigateToSettings } = useNavigationStore();
  return (
    <Card>
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-muted border border-border flex items-center justify-center" aria-hidden>
        <ClipboardList className="w-10 h-10 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-xl mb-2 font-semibold text-foreground leading-tight">
        {t('noData.title')}
      </h2>
      <p className="text-[13px] mb-1.5 text-muted-foreground leading-snug">
        {t('noData.subtitle')}
      </p>
      <p className="text-[11px] mb-6 text-muted-foreground leading-snug">
        {t('noData.hint')}
      </p>

      <Button
        onClick={() => navigateToSettings()}
        className="inline-flex items-center justify-center gap-2 rounded-xl"
      >
        <Settings className="w-4 h-4" aria-hidden />
        {t('noData.goToSettings')}
      </Button>
    </Card>
  );
};

export default NoDataView;
