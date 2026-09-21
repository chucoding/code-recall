import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTrendingRepositories } from '../model/use-repos';
import { DEFAULT_BADGE_COLOR, readableTextColor } from '../lib/contrast';

export interface TrendingRepoListProps {
  /** 뱃지를 눌렀을 때 호출. 인자는 저장소 URL */
  onSelect: (repositoryUrl: string) => void;
  /** 카드 생성 중처럼 선택을 막아야 할 때 true */
  disabled?: boolean;
}

/**
 * GitHub 트렌딩 저장소 뱃지 목록
 *
 * 목록 자체는 상위에서 내려받지 않고 `useTrendingRepositories`로 직접 구독한다.
 * `onSelect`와 `disabled`만 props로 두는데, 이 컴포넌트가 버튼 줄이라는 말단 사용자 인터페이스이고
 * 두 값이 각각 클릭 이벤트와 단순 비활성 표시라서 스토어를 경유하는 것보다 결합도가 낮다.
 */
const TrendingRepoList: React.FC<TrendingRepoListProps> = ({ onSelect, disabled }) => {
  const { t, i18n } = useTranslation();
  const { repositories, updatedAt } = useTrendingRepositories();

  const updatedLabel = updatedAt
    ? t('demo.trendingUpdatedAt', {
      date: updatedAt.toLocaleDateString(i18n.language.startsWith('ko') ? 'ko-KR' : 'en-US', {
        month: 'long',
        day: 'numeric',
      }),
    })
    : null;

  return (
    <div className="mt-6 w-full" role="group" aria-label={t('demo.trendingListLabel')}>
      <p className="mb-3 text-center text-xs font-semibold tracking-wide text-text-muted uppercase">
        {t('demo.trendingTitle')}
        {updatedLabel && <span className="ml-2 font-medium normal-case">{updatedLabel}</span>}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {repositories.map((repository) => {
          const backgroundColor = repository.languageColor || DEFAULT_BADGE_COLOR;

          return (
            <button
              key={repository.fullName}
              type="button"
              onClick={() => onSelect(repository.url)}
              disabled={disabled}
              title={repository.description || repository.fullName}
              className="inline-flex items-center gap-2 h-11 min-h-[44px] w-[max-content] shrink-0 rounded-full border-0 pl-1.5 pr-4 text-[0.85rem] font-semibold transition-[opacity,filter] duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:opacity-90 focus:outline focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-bg"
              style={{ backgroundColor, color: readableTextColor(backgroundColor) }}
            >
              <img
                src={`https://github.com/${repository.owner}.png?size=64`}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                className="h-8 w-8 shrink-0 rounded-full bg-black/10 object-cover"
                aria-hidden
              />
              <span className="whitespace-nowrap">{repository.fullName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TrendingRepoList;
